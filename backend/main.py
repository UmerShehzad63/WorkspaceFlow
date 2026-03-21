from contextlib import asynccontextmanager
from fastapi import FastAPI, HTTPException, Request, UploadFile, File, Form
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from slowapi import Limiter, _rate_limit_exceeded_handler
from slowapi.util import get_remote_address
from slowapi.errors import RateLimitExceeded
import logging
import os
import asyncio
import functools
from datetime import datetime, timezone
from typing import List, Optional
from dotenv import load_dotenv

# MUST load env vars before importing other modules
load_dotenv()

import httpx
from google_service import fetch_morning_briefing_data, fetch_schedule_only
from ai_engine import generate_briefing_summary, parse_command_intent
from command_executor import execute_command
from email_service import send_automation_request_email, send_support_email, send_preview_email
from routes.telegram import router as telegram_router
from jobs.scheduler import start_scheduler, stop_scheduler

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# ── App lifecycle: start/stop scheduler + register Telegram webhook ─────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    start_scheduler()

    # Auto-register the Telegram webhook on every startup so Render deploys
    # don't require manual re-registration.
    try:
        from services.telegram import set_webhook
        webhook_url = "https://workspaceflow-backend.onrender.com/api/telegram/webhook"
        await set_webhook(webhook_url)
    except Exception as e:
        logger.warning("[Telegram] Webhook registration failed (non-fatal): %s", e)

    yield
    stop_scheduler()

limiter = Limiter(key_func=get_remote_address)
app     = FastAPI(lifespan=lifespan)
app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, _rate_limit_exceeded_handler)

# ── Mount Telegram router ───────────────────────────────────────────────────
app.include_router(telegram_router)

# ── Security headers ────────────────────────────────────────────────────────
@app.middleware("http")
async def add_security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"]  = "nosniff"
    response.headers["X-Frame-Options"]         = "DENY"
    response.headers["Referrer-Policy"]         = "strict-origin-when-cross-origin"
    response.headers["X-XSS-Protection"]        = "0"
    response.headers["Permissions-Policy"]      = "camera=(), microphone=(), geolocation=()"
    return response

# ── CORS ────────────────────────────────────────────────────────────────────
_raw_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000").split(",")
ALLOWED_ORIGINS = [o.strip() for o in _raw_origins if o.strip() and o.strip() != "*"]
if not ALLOWED_ORIGINS:
    ALLOWED_ORIGINS = ["http://localhost:3000"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=ALLOWED_ORIGINS,
    allow_credentials=True,
    allow_methods=["GET", "POST"],
    allow_headers=["Authorization", "Content-Type"],
)

# ── Auth helpers ─────────────────────────────────────────────────────────────
async def verify_supabase_user(token: str):
    url     = f"{os.getenv('NEXT_PUBLIC_SUPABASE_URL')}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey":        os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            response = await client.get(url, headers=headers)
            if response.status_code == 200:
                return response.json()
    except Exception:
        pass
    return None

async def require_auth(request: Request):
    auth_header = request.headers.get("Authorization")
    if not auth_header or not auth_header.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    token = auth_header.split(" ")[1]
    user  = await verify_supabase_user(token)
    if not user:
        raise HTTPException(status_code=401, detail="Invalid session")
    return user

# ── Allowed MIME types for file uploads ────────────────────────────────────
ALLOWED_UPLOAD_MIME_TYPES = {
    "image/jpeg", "image/png", "image/gif", "image/webp",
    "application/pdf", "text/plain",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    "application/vnd.ms-excel",
    "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
}

# ── Health check ─────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    """Unauthenticated liveness probe for Fly.io / Docker HEALTHCHECK."""
    return {"status": "ok"}

@app.get("/")
async def root():
    return {"status": "WorkspaceFlow Backend Online", "model": "gpt-4o-mini (OpenAI)"}


# ── Morning Briefing — schedule only (fast, ~1-2 s) ─────────────────────────
@app.get("/api/briefing/schedule")
@limiter.limit("20/minute")
async def get_briefing_schedule(request: Request):
    user     = await require_auth(request)
    user_id  = user["id"]

    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_key  = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    profile_url  = f"{supabase_url}/rest/v1/profiles?id=eq.{user_id}&select=google_access_token,google_refresh_token"
    headers      = {"Authorization": f"Bearer {service_key}", "apikey": service_key}

    async with httpx.AsyncClient(timeout=10.0) as client:
        resp     = await client.get(profile_url, headers=headers)
        profiles = resp.json() if resp.status_code == 200 else []

    if not profiles or not profiles[0].get("google_access_token"):
        raise HTTPException(status_code=400, detail="Google account not connected.")

    profile       = profiles[0]
    access_token  = profile["google_access_token"]
    refresh_token = profile.get("google_refresh_token")

    try:
        loop     = asyncio.get_event_loop()
        schedule = await loop.run_in_executor(
            None, functools.partial(fetch_schedule_only, access_token, refresh_token)
        )
    except Exception as e:
        raise HTTPException(status_code=502, detail=f"Failed to fetch calendar: {str(e)[:200]}")

    return {"schedule": schedule}


# ── Morning Briefing — full (calendar + Gmail + AI) ──────────────────────────
@app.get("/api/briefing")
@limiter.limit("10/minute")
async def get_briefing(request: Request):
    user    = await require_auth(request)
    user_id = user["id"]

    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_key  = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    profile_url  = f"{supabase_url}/rest/v1/profiles?id=eq.{user_id}&select=google_access_token,google_refresh_token"
    headers      = {"Authorization": f"Bearer {service_key}", "apikey": service_key}

    async with httpx.AsyncClient(timeout=15.0) as client:
        response = await client.get(profile_url, headers=headers)
        profiles = response.json() if response.status_code == 200 else []

        if not profiles:
            raise HTTPException(status_code=404, detail="User profile not found")

        profile       = profiles[0]
        access_token  = profile.get("google_access_token")
        refresh_token = profile.get("google_refresh_token")

    if not access_token:
        raise HTTPException(status_code=400, detail="Google account not connected. Please reconnect.")

    try:
        raw_data = fetch_morning_briefing_data(access_token, refresh_token)
    except Exception as e:
        logger.exception("Failed to fetch Google data (user_id=%s)", user_id)
        if any(kw in str(e).lower() for kw in ["getaddrinfo", "nameresolution", "servernotfound", "dns"]):
            raise HTTPException(status_code=502, detail="Failed to reach Google APIs — DNS/network error.")
        raise HTTPException(status_code=502, detail="Failed to fetch workspace data. Try reconnecting your Google account.")

    briefing = await generate_briefing_summary(raw_data)
    if not isinstance(briefing, dict) or "schedule" not in briefing or "last_24h" not in briefing:
        logger.error("[OpenAI] Briefing generation failed: %s", briefing)
        raise HTTPException(status_code=503, detail="AI service temporarily unavailable. Try again shortly.")

    # Attach raw per-email data so the frontend can render individual email rows
    briefing['last_24h_emails'] = [
        {'from': e.get('from', ''), 'subject': e.get('subject', ''), 'snippet': e.get('snippet', '')}
        for e in raw_data.get('last_24h_emails', [])[:20]
    ]
    briefing['older_emails'] = [
        {'from': e.get('from', ''), 'subject': e.get('subject', ''), 'snippet': e.get('snippet', '')}
        for e in raw_data.get('older_emails', [])[:10]
    ]

    return briefing


# ── Command Bar ──────────────────────────────────────────────────────────────
@app.post("/api/command")
@limiter.limit("20/minute")
async def run_command(request: Request):
    user    = await require_auth(request)
    user_id = user["id"]

    data         = await request.json()
    command      = data.get("command", "").strip()
    overrides    = data.get("overrides") or {}
    preview_only = bool(data.get("preview_only", False))
    req_timezone = (data.get("timezone") or "").strip() or "UTC"

    if not command:
        raise HTTPException(status_code=400, detail="Command cannot be empty")
    if len(command) > 500:
        raise HTTPException(status_code=400, detail="Command too long (max 500 characters)")

    intent = await parse_command_intent(command, user_timezone=req_timezone)
    if not isinstance(intent, dict) or "service" not in intent:
        raise HTTPException(status_code=503, detail="AI service unavailable. Try again shortly.")

    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_key  = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    profile_url  = f"{supabase_url}/rest/v1/profiles?id=eq.{user_id}&select=google_access_token,google_refresh_token,timezone"
    g_headers    = {"Authorization": f"Bearer {service_key}", "apikey": service_key}

    async with httpx.AsyncClient(timeout=15.0) as client:
        resp     = await client.get(profile_url, headers=g_headers)
        profiles = resp.json() if resp.status_code == 200 else []

    if not profiles:
        raise HTTPException(status_code=404, detail="User profile not found")

    profile       = profiles[0]
    access_token  = profile.get("google_access_token")
    refresh_token = profile.get("google_refresh_token")
    user_timezone = profile.get("timezone") or "UTC"
    eff_timezone  = req_timezone or user_timezone or "UTC"

    if not access_token:
        raise HTTPException(status_code=400, detail="Google account not connected. Please reconnect.")

    # For Gmail Send/Reply: resolve recipient → generate content → preview modal.
    if preview_only and intent.get("service", "").lower() == "gmail" and \
            intent.get("action", "").lower() in ("send", "reply"):
        params          = intent.setdefault("parameters", {})
        to              = (params.get("to") or "").strip()
        recipient_email = (overrides.get("recipient_email") or "").strip()

        # ── Step 1: Resolve recipient ──────────────────────────────────────
        if recipient_email:
            to = recipient_email
            params["to"] = to
        elif to and "@" not in to:
            from command_executor import find_recipient_candidates, _build_creds
            loop = asyncio.get_event_loop()
            creds = await loop.run_in_executor(
                None, functools.partial(_build_creds, access_token, refresh_token)
            )
            candidates = await loop.run_in_executor(
                None, functools.partial(find_recipient_candidates, creds, to)
            )
            # Always show disambiguation: 0 candidates → ask for email, 1 → confirm, 2+ → pick
            return {
                "intent": intent,
                "result": {
                    "type": "needs_disambiguation",
                    "kind": "recipient",
                    "query": params.get("to", to),
                    "candidates": candidates,
                    "current_overrides": overrides,
                },
                "preview_only": False,
                "needs_disambiguation": True,
            }

        # ── Step 1.5: Resolve Drive file if attachment mentioned ───────────
        drive_filename = (
            params.get("drive_file") or params.get("attachment") or
            params.get("file") or params.get("filename") or ""
        ).strip()
        file_id_override = (overrides.get("file_id") or "").strip()
        if drive_filename and not file_id_override:
            from command_executor import find_file_candidates, _build_creds, _GDRIVE_TYPE_LABELS
            loop2 = asyncio.get_event_loop()
            try:
                creds2 = await loop2.run_in_executor(
                    None, functools.partial(_build_creds, access_token, refresh_token)
                )
                file_cands = await loop2.run_in_executor(
                    None, functools.partial(find_file_candidates, creds2, drive_filename)
                )
            except Exception:
                file_cands = []
            if not file_cands:
                return {
                    "intent": intent,
                    "result": {
                        "type": "needs_disambiguation",
                        "kind": "file",
                        "query": drive_filename,
                        "candidates": [],
                        "current_overrides": {**overrides, "recipient_email": to},
                    },
                    "preview_only": False,
                    "needs_disambiguation": True,
                }
            if len(file_cands) > 1:
                return {
                    "intent": intent,
                    "result": {
                        "type": "needs_disambiguation",
                        "kind": "file",
                        "query": drive_filename,
                        "candidates": [
                            {
                                "id": f["id"],
                                "name": f["name"],
                                "type": _GDRIVE_TYPE_LABELS.get(f.get("mimeType", ""), f.get("mimeType", "").split("/")[-1]),
                                "modified": f.get("modifiedTime", ""),
                            }
                            for f in file_cands
                        ],
                        "current_overrides": {**overrides, "recipient_email": to},
                    },
                    "preview_only": False,
                    "needs_disambiguation": True,
                }
            # Single file found — cache for display in preview and for execution
            params["_drive_file_id"]   = file_cands[0]["id"]
            params["_drive_file_name"] = file_cands[0]["name"]
        elif file_id_override:
            # User picked file from disambiguation — cache file_id; name comes from overrides
            params["_drive_file_id"]   = file_id_override
            params["_drive_file_name"] = overrides.get("filename", drive_filename or "attachment")

        # ── Step 2: Generate email content ────────────────────────────────
        subject = (params.get("subject") or "").strip()
        body    = (params.get("body") or params.get("message") or params.get("content") or "").strip()
        if not subject or not body:
            from ai_engine import generate_email_content
            meta        = user.get("user_metadata") or {}
            sender_name = (meta.get("full_name") or meta.get("name") or "").strip()
            if not sender_name:
                sender_name = (user.get("email") or "").split("@")[0]
            to_name   = (params.get("_to_name") or "").strip()
            generated = await generate_email_content(command, to, sender_name=sender_name, to_name=to_name)
            if not subject and generated.get("subject"):
                params["subject"] = generated["subject"]
            if not body and generated.get("body"):
                params["body"] = generated["body"]
        intent["parameters"] = params

        # ── Step 3: Return for preview ────────────────────────────────────
        return {"intent": intent, "preview_only": True}

    # For Calendar Create/Schedule/Add/Book: resolve attendees → preview confirmation.
    if preview_only and intent.get("service", "").lower() == "calendar" and \
            intent.get("action", "").lower() in ("schedule", "create", "add", "book"):
        params = intent.setdefault("parameters", {})
        # Inject user's timezone so calendar_create uses the correct local time
        params["_timezone"] = eff_timezone

        # Collect attendees from all possible keys the AI might use
        raw_attendees = list(params.get("attendees") or [])
        if isinstance(raw_attendees, str):
            raw_attendees = [a.strip() for a in raw_attendees.split(",")]
        for key in ("attendee", "with"):
            val = params.get(key)
            if val:
                raw_attendees.append(str(val))

        # Resolve name-only attendees → emails via Gmail history
        if raw_attendees:
            from command_executor import find_recipient_candidates, _build_creds
            loop = asyncio.get_event_loop()
            creds = await loop.run_in_executor(
                None, functools.partial(_build_creds, access_token, refresh_token)
            )
            resolved = []
            for att in raw_attendees:
                att = att.strip()
                if not att:
                    continue
                if "@" in att:
                    resolved.append(att)
                else:
                    candidates = await loop.run_in_executor(
                        None, functools.partial(find_recipient_candidates, creds, att)
                    )
                    if len(candidates) == 1:
                        resolved.append(candidates[0]["email"])
                    elif len(candidates) > 1:
                        return {
                            "intent": intent,
                            "result": {
                                "type": "needs_disambiguation",
                                "kind": "recipient",
                                "query": att,
                                "candidates": candidates,
                                "current_overrides": overrides,
                            },
                            "preview_only": False,
                            "needs_disambiguation": True,
                        }
                    else:
                        # Can't resolve — leave empty so user fills in the modal
                        resolved.append("")
            params["attendees"] = resolved

        intent["parameters"] = params
        return {"intent": intent, "preview_only": True}

    try:
        loop   = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None, functools.partial(execute_command, intent, access_token, refresh_token, overrides, eff_timezone)
        )
    except Exception as e:
        import re as _re
        error_str = str(e)
        logger.exception("[Command] Execution error")
        if "403" in error_str or "insufficient" in error_str.lower() or "scope" in error_str.lower():
            raise HTTPException(status_code=403, detail="Insufficient Google permissions. Please sign out and sign in again to grant the required access.")
        if "timeout" in error_str.lower():
            raise HTTPException(status_code=504, detail="Google API timed out. Please try again.")
        if "401" in error_str or "invalid_grant" in error_str.lower():
            raise HTTPException(status_code=401, detail="Google session expired. Please sign out and sign in again.")
        # Extract a meaningful message from Google HttpError responses
        match = _re.search(r'"message":\s*"([^"]+)"', error_str)
        if match:
            raise HTTPException(status_code=502, detail=f"Google API error: {match.group(1)}")
        # Surface the raw error (truncated) rather than a useless generic message
        raise HTTPException(status_code=502, detail=f"Command failed: {str(e)[:200]}")

    if isinstance(result, dict) and result.get("type") == "error":
        raise HTTPException(status_code=422, detail=result["error"])
    if isinstance(result, dict) and result.get("type") == "needs_disambiguation":
        return {"intent": intent, "result": result, "success": False, "needs_disambiguation": True}

    return {"intent": intent, "result": result, "success": True}


# ── Send Preview ─────────────────────────────────────────────────────────────
@app.post("/api/send-preview")
@limiter.limit("5/minute")
async def send_preview(request: Request):
    """
    Send the morning briefing to the user's preferred channel.
    Priority: Telegram (Pro/Pro Plus, if connected) → email.
    """
    user    = await require_auth(request)
    user_id = user["id"]
    data    = await request.json()
    briefing = data.get("briefing")
    note     = (data.get("note") or "").strip() or None   # optional personal note

    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    service_key  = os.getenv("SUPABASE_SERVICE_ROLE_KEY")
    sb_headers   = {"Authorization": f"Bearer {service_key}", "apikey": service_key}

    # Fetch profile (Google tokens + plan)
    profile_url = (
        f"{supabase_url}/rest/v1/profiles"
        f"?id=eq.{user_id}"
        f"&select=google_access_token,google_refresh_token,email,plan"
    )
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp     = await client.get(profile_url, headers=sb_headers)
        profiles = resp.json() if resp.status_code == 200 else []

    if not profiles:
        raise HTTPException(status_code=404, detail="User profile not found")

    profile       = profiles[0]
    access_token  = profile.get("google_access_token")
    refresh_token = profile.get("google_refresh_token")
    user_email    = user.get("email") or profile.get("email", "")
    meta          = user.get("user_metadata") or {}
    user_name     = (meta.get("full_name") or meta.get("name") or "").strip() or user_email.split("@")[0]
    plan          = (profile.get("plan") or "free").lower()

    if not access_token:
        raise HTTPException(status_code=400, detail="Google account not connected. Please reconnect.")

    # Fetch fresh briefing if not supplied
    if not briefing:
        try:
            loop     = asyncio.get_event_loop()
            raw_data = await loop.run_in_executor(
                None, functools.partial(fetch_morning_briefing_data, access_token, refresh_token)
            )
            briefing = await generate_briefing_summary(raw_data)
            if not isinstance(briefing, dict) or "schedule" not in briefing:
                raise ValueError("Briefing generation returned unexpected data")
        except Exception:
            raise HTTPException(status_code=502, detail="Failed to fetch briefing. Please try again.")

    loop = asyncio.get_event_loop()

    # Priority 1: Telegram (Pro/Pro Plus/trial only, if connected)
    if plan in ("pro", "pro_plus", "trialing", "pro_trial", "active"):
        tg_conn_url = (
            f"{supabase_url}/rest/v1/telegram_connections"
            f"?user_id=eq.{user_id}"
            f"&verified_at=not.is.null"
            f"&select=chat_id"
        )
        async with httpx.AsyncClient(timeout=10.0) as client:
            tg_resp = await client.get(tg_conn_url, headers=sb_headers)
            tg_rows = tg_resp.json() if tg_resp.status_code == 200 else []

        if tg_rows and tg_rows[0].get("chat_id"):
            try:
                from services.telegram import send_message, format_briefing_telegram
                message = format_briefing_telegram(briefing)
                if note:
                    message = f"📝 <i>{note}</i>\n\n" + message
                await send_message(tg_rows[0]["chat_id"], message)
                return {"success": True, "channel": "telegram"}
            except RuntimeError as e:
                logger.warning("[Telegram] Not configured, falling back to email: %s", e)
            except Exception as e:
                logger.warning("[Telegram] Send failed, falling back to email: %s", e)

    # Fallback: Email
    try:
        await loop.run_in_executor(
            None, functools.partial(send_preview_email, user_email, user_name, briefing, note)
        )
        return {"success": True, "channel": "email"}
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to send preview. Please try again.")


# ── Request Automation ────────────────────────────────────────────────────────
@app.post("/api/request-automation")
@limiter.limit("5/minute")
async def request_automation(request: Request):
    user = await require_auth(request)

    data        = await request.json()
    title       = (data.get("title")       or "").strip()
    description = (data.get("description") or "").strip()
    trigger_app = (data.get("trigger_app") or "").strip()
    action_app  = (data.get("action_app")  or "").strip()

    if not description:
        raise HTTPException(status_code=400, detail="Description is required")

    requester_email = user.get("email", "")
    meta            = user.get("user_metadata") or {}
    requester_name  = (meta.get("full_name") or meta.get("name") or "").strip() or requester_email.split("@")[0]
    timestamp       = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            functools.partial(
                send_automation_request_email,
                requester_name, requester_email,
                title, description,
                trigger_app, action_app,
                timestamp,
            ),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to send request email.")

    return {"success": True, "message": "Request sent successfully"}


# ── Contact Support ───────────────────────────────────────────────────────────
@app.post("/api/support")
@limiter.limit("5/minute")
async def contact_support(
    request:      Request,
    subject_type: str                      = Form(...),
    description:  str                      = Form(...),
    files:        Optional[List[UploadFile]] = File(None),
):
    user         = await require_auth(request)
    subject_type = subject_type.strip()
    description  = description.strip()

    if not description:
        raise HTTPException(status_code=400, detail="Description is required")

    valid_subjects = {"Technical Error", "Feedback", "Feature Request"}
    if subject_type not in valid_subjects:
        raise HTTPException(status_code=400, detail=f"Invalid subject. Must be one of: {', '.join(valid_subjects)}")

    user_email = user.get("email", "")
    meta       = user.get("user_metadata") or {}
    user_name  = (meta.get("full_name") or meta.get("name") or "").strip() or user_email.split("@")[0]
    timestamp  = datetime.now(timezone.utc).strftime("%Y-%m-%d %H:%M UTC")

    attachments = []
    if files:
        for upload in files[:5]:
            if not upload.filename:
                continue
            mime = upload.content_type or "application/octet-stream"
            if mime not in ALLOWED_UPLOAD_MIME_TYPES:
                raise HTTPException(status_code=400, detail=f"File type not allowed: {mime}")
            content = await upload.read(5 * 1024 * 1024)
            attachments.append((upload.filename, content, mime))

    try:
        loop = asyncio.get_event_loop()
        await loop.run_in_executor(
            None,
            functools.partial(
                send_support_email,
                user_name, user_email,
                subject_type, description,
                attachments, timestamp,
            ),
        )
    except RuntimeError as e:
        raise HTTPException(status_code=503, detail=str(e))
    except Exception:
        raise HTTPException(status_code=500, detail="Failed to send support email.")

    return {"success": True, "message": "Support request sent successfully"}


# ── Diagnostic ────────────────────────────────────────────────────────────────
@app.get("/api/test")
@limiter.limit("10/minute")
async def test_connectivity(request: Request):
    """Authenticated connectivity check — prevents config enumeration."""
    await require_auth(request)
    results = {}

    from ai_engine import OPENAI_API_KEY, OPENAI_BASE_URL, OPENAI_MODEL
    results["openai_key_configured"]     = bool(OPENAI_API_KEY)
    results["google_client_configured"]  = bool(os.getenv("GOOGLE_CLIENT_ID"))
    results["supabase_configured"]       = bool(os.getenv("NEXT_PUBLIC_SUPABASE_URL"))
    results["telegram_configured"]        = bool(os.getenv("TELEGRAM_BOT_TOKEN"))

    import socket
    try:
        socket.getaddrinfo("gmail.googleapis.com", 443)
        results["google_dns_reachable"] = True
    except socket.gaierror as e:
        results["google_dns_reachable"] = False
        results["google_dns_error"]     = str(e)

    if OPENAI_API_KEY:
        try:
            async with httpx.AsyncClient(timeout=8.0) as client:
                resp = await client.post(
                    OPENAI_BASE_URL,
                    json={"model": OPENAI_MODEL, "messages": [{"role": "user", "content": "ping"}], "max_tokens": 1},
                    headers={"Authorization": f"Bearer {OPENAI_API_KEY}", "Content-Type": "application/json"},
                )
                results["openai_reachable"] = True
                results["openai_status"]    = resp.status_code
        except Exception as e:
            results["openai_reachable"] = False
            results["openai_error"]     = str(e)

    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    if supabase_url:
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                resp = await client.get(f"{supabase_url}/rest/v1/")
                results["supabase_reachable"] = resp.status_code < 500
        except Exception as e:
            results["supabase_reachable"] = False
            results["supabase_error"]     = str(e)

    return results


# ── External Cron: send all due briefings ────────────────────────────────────
@app.post("/api/briefing/send-all")
@limiter.limit("10/minute")
async def send_all_briefings(request: Request):
    """
    External cron endpoint — triggers daily briefings for all due users.
    Secure with CRON_SECRET env var: set Authorization: Bearer <CRON_SECRET> in cron headers.
    Set up a free cron job at cron-job.org to hit this endpoint daily at your chosen time.
    Example: POST https://workspaceflow-backend.onrender.com/api/briefing/send-all
             Authorization: Bearer <your-CRON_SECRET>
    """
    cron_secret = os.getenv("CRON_SECRET", "")
    if cron_secret:
        auth = request.headers.get("Authorization", "")
        if auth != f"Bearer {cron_secret}":
            raise HTTPException(status_code=401, detail="Unauthorized")

    from jobs.scheduler import send_daily_briefings
    print("[Cron] /api/briefing/send-all triggered")
    await send_daily_briefings()
    return {"success": True, "message": "Briefings job executed"}


# ── External Cron: send-daily alias (returns counts) ─────────────────────────
@app.post("/api/briefing/send-daily")
@limiter.limit("10/minute")
async def send_daily_briefings_endpoint(request: Request):
    """
    External cron endpoint — triggers daily briefings for all due users.
    Returns: {"sent": N, "skipped": M, "errors": P}
    Secure with CRON_SECRET env var: set Authorization: Bearer <CRON_SECRET> in cron headers.
    Setup: cron-job.org → POST https://workspaceflow-backend.onrender.com/api/briefing/send-daily
    Schedule: Every day at 8:00 AM (or your preferred time)
    """
    cron_secret = os.getenv("CRON_SECRET", "")
    if cron_secret:
        auth = request.headers.get("Authorization", "")
        if auth != f"Bearer {cron_secret}":
            raise HTTPException(status_code=401, detail="Unauthorized")

    from jobs.scheduler import send_daily_briefings
    print("[Cron] /api/briefing/send-daily triggered")
    counts = await send_daily_briefings()
    return counts if isinstance(counts, dict) else {"sent": 0, "skipped": 0, "errors": 0}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="127.0.0.1", port=8000)
