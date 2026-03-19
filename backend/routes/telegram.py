"""
Telegram API routes.

Endpoints:
    POST /api/telegram/connect     — generate verification code (paid plans only)
    POST /api/telegram/disconnect  — unlink account
    GET  /api/telegram/status      — connection status (any auth'd user)
    POST /api/telegram/webhook     — receive updates from Telegram Bot API
    POST /api/telegram/test        — send test message to connected chat

Bot commands handled in webhook:
    /start [USER_ID]  — auto-link account (one-click deeplink flow)
    /briefing         — full morning briefing
    /tasks            — priority items
    /automations      — list active automations
    /automation add/pause/run — manage automations
    /status           — account & connection info
    /help             — help text with NL examples
    <any other text>  — natural language command (same AI as dashboard)
"""
import asyncio
import functools
import logging
import os
from datetime import datetime, timezone as tz

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse

from services.telegram import (
    format_briefing_telegram,
    generate_verification_code,
    send_message,
    send_test_message,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/telegram", tags=["telegram"])

# Plans that get full Telegram features
PAID_PLANS = {"pro", "team", "trialing", "pro_trial"}

# In-memory pending Gmail send confirmations, keyed by chat_id.
# Stores {intent, user_id} until the user replies YES/NO.
_pending_sends: dict = {}


# ── Supabase helpers ────────────────────────────────────────────────────────

def _sb_headers(content_type: bool = False) -> dict:
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    h   = {"Authorization": f"Bearer {key}", "apikey": key}
    if content_type:
        h["Content-Type"] = "application/json"
    return h


async def _verify_supabase_user(token: str):
    url     = f"{os.getenv('NEXT_PUBLIC_SUPABASE_URL')}/auth/v1/user"
    headers = {
        "Authorization": f"Bearer {token}",
        "apikey":        os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY"),
    }
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=headers)
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return None


async def _require_auth(request: Request):
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing or invalid token")
    user = await _verify_supabase_user(auth.split(" ")[1])
    if not user:
        raise HTTPException(status_code=401, detail="Invalid session")
    return user


async def _get_profile(user_id: str) -> dict | None:
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    url = (
        f"{supabase_url}/rest/v1/profiles"
        f"?id=eq.{user_id}"
        f"&select=id,plan,google_access_token,google_refresh_token"
    )
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=_sb_headers())
        rows = resp.json() if resp.status_code == 200 else []
    return rows[0] if rows else None


async def _require_paid(request: Request):
    """Authenticate and enforce a paid plan (pro/team/trialing/pro_trial)."""
    user    = await _require_auth(request)
    profile = await _get_profile(user["id"])
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")
    plan = (profile.get("plan") or "free").lower()
    if plan not in PAID_PLANS:
        raise HTTPException(
            status_code=403,
            detail="Telegram delivery requires a Pro or Team plan. Upgrade to continue.",
        )
    return user, profile


async def _get_connection(user_id: str) -> dict | None:
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    url = (
        f"{supabase_url}/rest/v1/telegram_connections"
        f"?user_id=eq.{user_id}"
        f"&select=*"
    )
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=_sb_headers())
        rows = resp.json() if resp.status_code == 200 else []
    return rows[0] if rows else None


async def _set_connection(user_id: str, patch: dict):
    """Insert or update the telegram_connections row for user_id."""
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    existing     = await _get_connection(user_id)

    if existing:
        url     = f"{supabase_url}/rest/v1/telegram_connections?user_id=eq.{user_id}"
        headers = {**_sb_headers(True), "Prefer": "return=minimal"}
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.patch(url, json=patch, headers=headers)
    else:
        url     = f"{supabase_url}/rest/v1/telegram_connections"
        headers = {**_sb_headers(True), "Prefer": "return=minimal"}
        async with httpx.AsyncClient(timeout=10.0) as client:
            await client.post(url, json={"user_id": user_id, **patch}, headers=headers)


async def _delete_connection(user_id: str):
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    url = f"{supabase_url}/rest/v1/telegram_connections?user_id=eq.{user_id}"
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.delete(url, headers=_sb_headers())


async def _get_automations(user_id: str) -> list:
    """Fetch user's automations/rules from Supabase."""
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    url = (
        f"{supabase_url}/rest/v1/rules"
        f"?user_id=eq.{user_id}"
        f"&select=id,title,description,is_active,trigger_app,action_app"
        f"&order=created_at.desc"
    )
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=_sb_headers())
            if resp.status_code == 200:
                return resp.json()
    except Exception:
        pass
    return []


# ── Result formatting for Telegram HTML ─────────────────────────────────────

def _format_nl_result(result: dict) -> str:
    """Convert a command_executor result dict to a readable Telegram HTML string."""
    t = result.get("type", "")

    if t == "gmail_search":
        msgs = result.get("messages", [])
        if not msgs:
            return "📭 No emails found."
        lines = [f"<b>📧 {len(msgs)} email{'s' if len(msgs) != 1 else ''} found</b>"]
        for m in msgs[:5]:
            raw_from = m.get("from", "Unknown")
            # Extract display name from "Name <email>" format
            sender = raw_from.split("<")[0].strip().strip('"') or raw_from
            subject = m.get("subject") or "(No Subject)"
            snippet = (m.get("snippet") or "")[:120]
            lines.append(f"\n<b>{sender}</b> — {subject}")
            if snippet:
                lines.append(f"<i>{snippet}…</i>")
        if len(msgs) > 5:
            lines.append(f"\n… and {len(msgs) - 5} more.")
        return "\n".join(lines)

    if t == "gmail_send":
        return f"✅ Email sent to <b>{result.get('to', 'recipient')}</b>"

    if t == "gmail_archive":
        n = result.get("archived", 0)
        return f"✅ Archived <b>{n}</b> email{'s' if n != 1 else ''}."

    if t == "calendar_search":
        events = result.get("events", [])
        if not events:
            return "📅 No upcoming events found."
        lines = [f"<b>📅 {len(events)} event{'s' if len(events) != 1 else ''}</b>"]
        for e in events[:5]:
            start = (e.get("start") or "")[:16].replace("T", " ")
            title = e.get("title") or "Event"
            lines.append(f"\n<b>{title}</b>\n{start}")
        return "\n".join(lines)

    if t == "calendar_create":
        title = result.get("title") or "Event"
        start = (result.get("start") or "")[:16].replace("T", " ")
        link  = result.get("link", "")
        text  = f"✅ Event created: <b>{title}</b>\n{start}"
        if link:
            text += f'\n<a href="{link}">Open in Calendar</a>'
        return text

    if t == "drive_search":
        files = result.get("files", [])
        if not files:
            return "📁 No files found."
        lines = [f"<b>📁 {len(files)} file{'s' if len(files) != 1 else ''} found</b>"]
        for f in files[:5]:
            name = f.get("name") or "File"
            link = f.get("link", "")
            ftype = f.get("type", "")
            entry = f'<a href="{link}">{name}</a>' if link else name
            if ftype:
                entry += f" <i>({ftype})</i>"
            lines.append(f"\n{entry}")
        return "\n".join(lines)

    if t == "error":
        return f"⚠️ {result.get('error', 'Something went wrong.')}"

    return "✅ Done."


# ── Natural language command handler ────────────────────────────────────────

async def _handle_nl_command(chat_id: str, text: str, user_id: str,
                              access_token: str, refresh_token: str | None):
    """
    Parse and execute a natural language command, exactly like the dashboard
    Command Bar. For Gmail Send, shows a preview and asks for confirmation.
    """
    from ai_engine import parse_command_intent
    from command_executor import execute_command

    await send_message(chat_id, "⏳ Processing…")

    try:
        intent = await parse_command_intent(text)
    except Exception:
        logger.exception("[Telegram] Intent parsing failed")
        await send_message(chat_id, "⚠️ AI service unavailable. Please try again.")
        return

    if not isinstance(intent, dict) or "service" not in intent:
        await send_message(chat_id, "🤔 I couldn't understand that. Try /help for examples.")
        return

    service = (intent.get("service") or "").lower()
    action  = (intent.get("action")  or "").lower()
    params  = intent.get("parameters") or {}

    # Gmail Send → show preview, wait for YES/NO confirmation
    if service == "gmail" and action in ("send", "reply"):
        to      = params.get("to") or "?"
        subject = params.get("subject") or "(No Subject)"
        body    = (params.get("body") or params.get("message") or params.get("content") or "").strip()

        preview = (
            f"📧 <b>Ready to send email</b>\n\n"
            f"<b>To:</b> {to}\n"
            f"<b>Subject:</b> {subject}\n"
            f"<b>Body:</b>\n{body[:300]}{'…' if len(body) > 300 else ''}\n\n"
            "Reply <b>YES</b> to send or <b>NO</b> to cancel."
        )
        _pending_sends[chat_id] = {"intent": intent, "user_id": user_id}
        await send_message(chat_id, preview)
        return

    # All other commands: execute directly
    try:
        loop   = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            functools.partial(execute_command, intent, access_token, refresh_token),
        )
    except Exception:
        logger.exception("[Telegram] Command execution failed for chat_id=%s", chat_id)
        await send_message(chat_id, "⚠️ Something went wrong. Please try again.")
        return

    if isinstance(result, dict) and result.get("type") == "needs_disambiguation":
        kind       = result.get("kind", "item")
        candidates = result.get("candidates") or []
        lines      = [f"🔍 <b>Multiple {kind}s found — be more specific:</b>"]
        for c in candidates[:5]:
            if kind == "recipient":
                lines.append(f"• {c.get('display_name', '')} &lt;{c.get('email', '')}&gt;")
            else:
                lines.append(f"• {c.get('name', '')} <i>({c.get('type', '')})</i>")
        lines.append("\nPlease rephrase with more details.")
        await send_message(chat_id, "\n".join(lines))
        return

    await send_message(chat_id, _format_nl_result(result))


# ── Routes ───────────────────────────────────────────────────────────────────

@router.post("/connect")
async def telegram_connect(request: Request):
    """Generate a 6-digit verification code (fallback for manual flow)."""
    user, _ = await _require_paid(request)
    code    = generate_verification_code()
    await _set_connection(user["id"], {
        "verification_code": code,
        "chat_id":           None,
        "username":          None,
        "verified_at":       None,
    })
    return {"code": code}


@router.post("/disconnect")
async def telegram_disconnect(request: Request):
    """Unlink Telegram from the authenticated user's account."""
    user = await _require_auth(request)
    await _delete_connection(user["id"])
    return {"success": True}


@router.get("/status")
async def telegram_status(request: Request):
    """Return the Telegram connection status for the authenticated user."""
    user = await _require_auth(request)
    conn = await _get_connection(user["id"])

    if not conn:
        return {"connected": False, "pending": False, "username": None}
    if conn.get("verified_at"):
        return {"connected": True, "pending": False, "username": conn.get("username")}
    return {"connected": False, "pending": True, "username": None}


@router.post("/test")
async def telegram_test(request: Request):
    """Send a test message to the verified Telegram connection."""
    user, _ = await _require_paid(request)
    conn    = await _get_connection(user["id"])

    if not conn or not conn.get("verified_at") or not conn.get("chat_id"):
        raise HTTPException(
            status_code=400,
            detail="No verified Telegram connection found. Connect first.",
        )
    try:
        await send_test_message(conn["chat_id"])
        return {"success": True}
    except Exception:
        logger.exception("[Telegram] Test message failed for user %s", user["id"])
        raise HTTPException(status_code=502, detail="Failed to send test message.")


@router.post("/webhook")
async def telegram_webhook(request: Request):
    """Receive JSON updates from the Telegram Bot API."""
    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": True})

    message = body.get("message") or body.get("edited_message")
    if not message:
        return JSONResponse({"ok": True})

    chat_id  = str(message.get("chat", {}).get("id", ""))
    from_    = message.get("from") or {}
    username = from_.get("username") or from_.get("first_name") or "user"
    text     = (message.get("text") or "").strip()

    if not chat_id or not text:
        return JSONResponse({"ok": True})

    # ── Detect slash commands ────────────────────────────────────────────────
    is_command = text.startswith("/")
    if is_command:
        raw_cmd = text.split()[0].lstrip("/").lower()
        command = raw_cmd.split("@")[0]   # strip /cmd@BotName suffix
    else:
        command = None

    # ── /start [USER_ID] — one-click auto-link ───────────────────────────────
    if command == "start":
        parts   = text.split(maxsplit=1)
        payload = parts[1].strip() if len(parts) > 1 else None

        if payload:
            now_iso = datetime.now(tz.utc).isoformat()
            try:
                await _set_connection(payload, {
                    "chat_id":           chat_id,
                    "username":          username,
                    "verified_at":       now_iso,
                    "verification_code": None,
                })
                await send_message(
                    chat_id,
                    f"✅ <b>Your account is linked!</b>\n\n"
                    "You'll receive your daily briefing here.\n\n"
                    "💬 <b>Just type anything naturally:</b>\n"
                    "— \"Find emails from LinkedIn\"\n"
                    "— \"What's on my calendar today?\"\n"
                    "— \"Send email to X about Y\"\n\n"
                    "/briefing — morning briefing\n"
                    "/tasks — priority items\n"
                    "/help — all commands",
                )
            except Exception:
                logger.exception("[Telegram] Auto-link failed for user_id=%s", payload)
                await send_message(
                    chat_id,
                    "⚠️ Something went wrong linking your account. "
                    "Please try again from the WorkspaceFlow dashboard.",
                )
        else:
            await send_message(
                chat_id,
                "👋 <b>Welcome to WorkspaceFlow!</b>\n\n"
                "Open your dashboard and click <b>Open Telegram Bot →</b> "
                "to link your account automatically.",
            )
        return JSONResponse({"ok": True})

    # ── /verify CODE — legacy manual flow (keep as fallback) ─────────────────
    if command == "verify":
        parts = text.split()
        if len(parts) < 2:
            await send_message(
                chat_id,
                "Usage: <code>/verify CODE</code>\n\nGet your code from the WorkspaceFlow dashboard.",
            )
            return JSONResponse({"ok": True})

        code         = parts[1].strip()
        supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        url          = (
            f"{supabase_url}/rest/v1/telegram_connections"
            f"?verification_code=eq.{code}"
            f"&verified_at=is.null"
            f"&select=user_id"
        )
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=_sb_headers())
            rows = resp.json() if resp.status_code == 200 else []

        if not rows:
            await send_message(
                chat_id,
                "❌ Invalid or expired code.\n\nGenerate a fresh one from your dashboard.",
            )
            return JSONResponse({"ok": True})

        user_id = rows[0]["user_id"]
        now_iso = datetime.now(tz.utc).isoformat()
        await _set_connection(user_id, {
            "chat_id":           chat_id,
            "username":          username,
            "verified_at":       now_iso,
            "verification_code": None,
        })
        await send_message(
            chat_id,
            f"✅ <b>Connected!</b>\n\n"
            "💬 Just type anything naturally or use /help for commands.",
        )
        return JSONResponse({"ok": True})

    # ── All other messages — look up user by chat_id ─────────────────────────
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    conn_url = (
        f"{supabase_url}/rest/v1/telegram_connections"
        f"?chat_id=eq.{chat_id}"
        f"&verified_at=not.is.null"
        f"&select=user_id"
    )
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(conn_url, headers=_sb_headers())
        rows = resp.json() if resp.status_code == 200 else []

    if not rows:
        await send_message(
            chat_id,
            "👋 This Telegram isn't linked to WorkspaceFlow.\n\n"
            "Open your dashboard and click <b>Open Telegram Bot →</b> to connect.",
        )
        return JSONResponse({"ok": True})

    user_id       = rows[0]["user_id"]
    profile       = await _get_profile(user_id)
    access_token  = (profile or {}).get("google_access_token")
    refresh_token = (profile or {}).get("google_refresh_token")

    # ── YES/NO confirmation for pending Gmail sends ───────────────────────────
    if not is_command and chat_id in _pending_sends:
        pending = _pending_sends[chat_id]
        answer  = text.strip().upper()

        if answer in ("YES", "Y", "SEND", "OK", "CONFIRM"):
            del _pending_sends[chat_id]
            from command_executor import execute_command
            try:
                loop   = asyncio.get_event_loop()
                result = await loop.run_in_executor(
                    None,
                    functools.partial(
                        execute_command,
                        pending["intent"], access_token, refresh_token,
                    ),
                )
                await send_message(chat_id, _format_nl_result(result))
            except Exception:
                logger.exception("[Telegram] Confirmed send failed for chat_id=%s", chat_id)
                await send_message(chat_id, "⚠️ Failed to send the email. Please try again.")
        elif answer in ("NO", "N", "CANCEL", "STOP"):
            del _pending_sends[chat_id]
            await send_message(chat_id, "❌ Cancelled.")
        else:
            # Treat as a new command; discard old pending
            del _pending_sends[chat_id]
            await _handle_nl_command(chat_id, text, user_id, access_token, refresh_token)
        return JSONResponse({"ok": True})

    # ── /help ─────────────────────────────────────────────────────────────────
    if command == "help":
        await send_message(
            chat_id,
            "💬 <b>Just type anything naturally, like:</b>\n"
            "— \"Find emails from LinkedIn\"\n"
            "— \"What's on my calendar today?\"\n"
            "— \"Send email to X about Y\"\n"
            "— \"Show my pending tasks\"\n"
            "— \"Archive all newsletters\"\n\n"
            "<b>Or use commands:</b>\n"
            "/briefing — morning briefing\n"
            "/tasks — priority items\n"
            "/automations — list your automations\n"
            "/status — account info\n"
            "/help — this message",
        )

    # ── /status ───────────────────────────────────────────────────────────────
    elif command == "status":
        google_ok = bool(access_token)
        plan      = (profile or {}).get("plan", "free").title()
        await send_message(
            chat_id,
            "<b>⚙️ Account Status</b>\n\n"
            f"Plan: {plan}\n"
            f"Google: {'✅ connected' if google_ok else '❌ not connected'}\n"
            "Telegram: ✅ connected",
        )

    # ── /briefing ─────────────────────────────────────────────────────────────
    elif command == "briefing":
        if not access_token:
            await send_message(
                chat_id,
                "⚠️ Your Google account isn't connected.\n"
                "Please reconnect at workspace-flow.vercel.app",
            )
            return JSONResponse({"ok": True})

        await send_message(chat_id, "⏳ Fetching your briefing…")
        try:
            from google_service import fetch_morning_briefing_data
            from ai_engine import generate_briefing_summary

            loop     = asyncio.get_event_loop()
            raw_data = await loop.run_in_executor(
                None,
                functools.partial(fetch_morning_briefing_data, access_token, refresh_token),
            )
            briefing = await generate_briefing_summary(raw_data)

            if not isinstance(briefing, dict) or "schedule" not in briefing:
                raise ValueError("Unexpected briefing format")

            await send_message(chat_id, format_briefing_telegram(briefing))

        except Exception:
            logger.exception("[Telegram] Briefing failed for chat_id=%s", chat_id)
            await send_message(chat_id, "⚠️ Something went wrong. Please try again in a moment.")

    # ── /tasks ────────────────────────────────────────────────────────────────
    elif command == "tasks":
        if not access_token:
            await send_message(chat_id, "⚠️ Google account not connected.")
            return JSONResponse({"ok": True})

        await send_message(chat_id, "⏳ Fetching priority items…")
        try:
            from google_service import fetch_morning_briefing_data
            from ai_engine import generate_briefing_summary

            loop     = asyncio.get_event_loop()
            raw_data = await loop.run_in_executor(
                None,
                functools.partial(fetch_morning_briefing_data, access_token, refresh_token),
            )
            briefing = await generate_briefing_summary(raw_data)

            urgent = (briefing.get("last_24h") or {}).get("urgent_items") or []
            msg    = (
                "<b>⚡ Priority Items</b>\n\n" + "\n".join(f"• {it}" for it in urgent)
                if urgent else "✅ No urgent priority items right now."
            )
            await send_message(chat_id, msg)

        except Exception:
            logger.exception("[Telegram] Tasks failed for chat_id=%s", chat_id)
            await send_message(chat_id, "⚠️ Something went wrong. Please try again.")

    # ── /automations ──────────────────────────────────────────────────────────
    elif command == "automations":
        rules = await _get_automations(user_id)
        if not rules:
            await send_message(
                chat_id,
                "📋 <b>No automations yet.</b>\n\n"
                "Create one at workspace-flow.vercel.app/dashboard/rules\n"
                "or use: /automation add \"describe what you want\"",
            )
        else:
            active   = [r for r in rules if r.get("is_active", True)]
            inactive = [r for r in rules if not r.get("is_active", True)]
            lines    = [f"<b>📋 Your Automations ({len(rules)} total)</b>"]
            if active:
                lines.append("\n<b>Active:</b>")
                for r in active[:8]:
                    lines.append(f"• {r.get('title') or r.get('description', 'Untitled')}")
            if inactive:
                lines.append("\n<b>Paused:</b>")
                for r in inactive[:4]:
                    lines.append(f"• {r.get('title') or r.get('description', 'Untitled')}")
            lines.append("\n/automation pause [name] — pause an automation")
            lines.append("/automation run [name] — run manually")
            await send_message(chat_id, "\n".join(lines))

    # ── /automation add/pause/run ──────────────────────────────────────────────
    elif command == "automation":
        parts      = text.split(maxsplit=2)
        sub        = parts[1].lower() if len(parts) > 1 else ""
        description = parts[2].strip().strip('"') if len(parts) > 2 else ""

        if sub == "add":
            if not description:
                await send_message(
                    chat_id,
                    "Usage: /automation add \"description\"\n\n"
                    "Example: /automation add \"Every Monday send me unread email summary\"",
                )
            else:
                supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
                url     = f"{supabase_url}/rest/v1/rules"
                headers = {**_sb_headers(True), "Prefer": "return=minimal"}
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        await client.post(url, json={
                            "user_id":     user_id,
                            "title":       description[:80],
                            "description": description,
                            "is_active":   True,
                        }, headers=headers)
                    await send_message(
                        chat_id,
                        f"✅ Automation added:\n<i>{description}</i>\n\n"
                        "View it at workspace-flow.vercel.app/dashboard/rules",
                    )
                except Exception:
                    logger.exception("[Telegram] Failed to add automation for user %s", user_id)
                    await send_message(chat_id, "⚠️ Failed to add automation. Please try from the dashboard.")

        elif sub in ("pause", "unpause", "enable", "disable"):
            if not description:
                await send_message(chat_id, f"Usage: /automation {sub} [name]")
            else:
                active = sub not in ("pause", "disable")
                rules  = await _get_automations(user_id)
                match  = next(
                    (r for r in rules if description.lower() in (r.get("title") or "").lower()
                     or description.lower() in (r.get("description") or "").lower()),
                    None,
                )
                if not match:
                    await send_message(chat_id, f"❌ No automation found matching \"{description}\".")
                else:
                    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
                    url     = f"{supabase_url}/rest/v1/rules?id=eq.{match['id']}&user_id=eq.{user_id}"
                    headers = {**_sb_headers(True), "Prefer": "return=minimal"}
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        await client.patch(url, json={"is_active": active}, headers=headers)
                    status_word = "resumed" if active else "paused"
                    await send_message(chat_id, f"✅ Automation {status_word}: <i>{match.get('title', description)}</i>")

        elif sub == "run":
            await send_message(
                chat_id,
                "⚡ Manual automation triggers are coming soon.\n"
                "Manage automations at workspace-flow.vercel.app/dashboard/rules",
            )

        else:
            await send_message(
                chat_id,
                "<b>/automation commands:</b>\n"
                "/automation add \"description\" — create new\n"
                "/automation pause [name] — pause\n"
                "/automation run [name] — trigger manually\n"
                "/automations — list all",
            )

    # ── Non-slash message OR unknown command → natural language ───────────────
    else:
        if not access_token:
            await send_message(
                chat_id,
                "⚠️ Your Google account isn't connected.\n"
                "Please reconnect at workspace-flow.vercel.app",
            )
            return JSONResponse({"ok": True})
        await _handle_nl_command(chat_id, text, user_id, access_token, refresh_token)

    return JSONResponse({"ok": True})
