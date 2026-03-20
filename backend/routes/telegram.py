"""
Telegram API routes — multi-step conversation engine.

Bot conversation states per chat_id (in-memory):
    wait_recipient_confirm — found 1 candidate, waiting for YES/NO confirmation
    wait_recipient_pick    — found N candidates, waiting for number selection
    wait_confirm           — AI-generated preview ready, waiting for YES/EDIT/NO
    wait_edit              — user requested edits; waiting for SUBJECT:/BODY: reply

Email flow: resolve recipient → AI generates content → preview → YES/EDIT/NO → send.
NL flow: any non-slash message → AI command engine (same as dashboard).
"""
import asyncio
import functools
import logging
import os
import re
from datetime import datetime, timezone as tz
from email.utils import parsedate_to_datetime

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

# ── Per-chat conversation state ──────────────────────────────────────────────
# chat_id → {"state": str, "intent": dict, "user_id": str, ...}
# state values: "wait_recipient_confirm" | "wait_recipient_pick" |
#               "wait_confirm" | "wait_edit"
_conv: dict = {}


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


async def _get_connection(user_id: str) -> dict | None:
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    url = (
        f"{supabase_url}/rest/v1/telegram_connections"
        f"?user_id=eq.{user_id}&select=*"
    )
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=_sb_headers())
        rows = resp.json() if resp.status_code == 200 else []
    return rows[0] if rows else None


async def _set_connection(user_id: str, patch: dict):
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


async def _get_user_display_name(user_id: str) -> str:
    """Fetch user's display name from Supabase auth (for email sign-off)."""
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    url = f"{supabase_url}/auth/v1/admin/users/{user_id}"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            resp = await client.get(url, headers={"Authorization": f"Bearer {key}", "apikey": key})
            if resp.status_code == 200:
                data = resp.json()
                meta = data.get("user_metadata") or {}
                name = (meta.get("full_name") or meta.get("name") or "").strip()
                if name:
                    return name
                email = data.get("email", "")
                return email.split("@")[0] if email else ""
    except Exception:
        pass
    return ""


# ── Text/formatting helpers ──────────────────────────────────────────────────

def _fmt_date(date_str: str) -> str:
    """Parse RFC 2822 or ISO date to a short readable string."""
    if not date_str:
        return ""
    try:
        dt = parsedate_to_datetime(date_str)
        return dt.strftime("%b %d, %I:%M %p")
    except Exception:
        pass
    try:
        dt = datetime.fromisoformat(date_str[:19])
        return dt.strftime("%b %d, %I:%M %p")
    except Exception:
        return date_str[:20]


def _extract_sender(raw_from: str) -> str:
    """Extract display name from 'Name <email@x.com>' or return email."""
    if not raw_from:
        return "Unknown"
    m = re.match(r'^"?([^"<]+?)"?\s*<[^>]+>$', raw_from.strip())
    return m.group(1).strip() if m else raw_from.split("<")[0].strip() or raw_from


async def _send_long(chat_id: str, text: str, chunk_size: int = 4000):
    """Send a long message by splitting it into ≤chunk_size pieces at line boundaries."""
    if len(text) <= chunk_size:
        await send_message(chat_id, text)
        return
    lines, current = text.split("\n"), ""
    for line in lines:
        candidate = (current + "\n" + line) if current else line
        if len(candidate) > chunk_size:
            if current.strip():
                await send_message(chat_id, current)
            current = line
        else:
            current = candidate
    if current.strip():
        await send_message(chat_id, current)


# ── Result formatters ────────────────────────────────────────────────────────

def _format_email_list(messages: list) -> str:
    """
    Format ALL emails with full From / Subject / Date / Body preview.
    Caller should use _send_long() since this can exceed 4096 chars.
    """
    if not messages:
        return "📭 No emails found."

    header = f"📧 <b>{len(messages)} email{'s' if len(messages) != 1 else ''} found</b>\n\n"
    body   = ""

    for m in messages:
        sender  = _extract_sender(m.get("from", "Unknown"))
        subject = m.get("subject") or "(No Subject)"
        date    = _fmt_date(m.get("date", ""))
        # Prefer parsed body for richer preview; fall back to snippet
        preview = (m.get("body") or m.get("snippet") or "").strip()
        if len(preview) > 250:
            # Cut at last space to avoid mid-word truncation
            preview = preview[:250].rsplit(" ", 1)[0] + "…"

        entry  = f"<b>📧 From:</b> {sender}\n"
        entry += f"<b>Subject:</b> {subject}\n"
        if date:
            entry += f"<b>Date:</b> {date}\n"
        if preview:
            entry += f"<b>Preview:</b> {preview}\n"
        entry += "─" * 28 + "\n\n"
        body  += entry

    return header + body


def _format_nl_result(result: dict) -> str:
    """Convert a command_executor result dict to readable Telegram HTML."""
    t = result.get("type", "")

    if t == "gmail_search":
        return _format_email_list(result.get("messages", []))

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
        for e in events[:10]:
            start = (e.get("start") or "")[:16].replace("T", " ")
            title = e.get("title") or "Event"
            attendees = e.get("attendees") or []
            entry = f"\n<b>{title}</b>\n{start}"
            if attendees:
                entry += f"\nWith: {', '.join(attendees[:3])}"
            lines.append(entry)
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
        for f in files[:10]:
            name  = f.get("name") or "File"
            link  = f.get("link", "")
            ftype = f.get("type", "")
            entry = f'<a href="{link}">{name}</a>' if link else name
            if ftype:
                entry += f" <i>({ftype})</i>"
            lines.append(f"\n{entry}")
        return "\n".join(lines)

    if t == "error":
        return f"❌ {result.get('error', 'Something went wrong.')}"

    return "✅ Done."


# ── Email send multi-step helpers ────────────────────────────────────────────

def _get_body(params: dict) -> str:
    return (
        params.get("body") or params.get("message") or params.get("content") or ""
    ).strip()


async def _generate_and_preview(chat_id: str, intent: dict, user_id: str,
                                original_command: str = ""):
    """Generate AI email content (subject + body) then show the preview."""
    params  = intent.setdefault("parameters", {})
    to      = (params.get("to") or "").strip()
    subject = (params.get("subject") or "").strip()
    body    = _get_body(params)

    if not subject or not body:
        from ai_engine import generate_email_content
        sender_name = await _get_user_display_name(user_id)
        try:
            generated = await generate_email_content(
                original_command or to, to, sender_name=sender_name
            )
            if not subject and generated.get("subject"):
                subject = generated["subject"]
                params["subject"] = subject
            if not body and generated.get("body"):
                body = generated["body"]
                params["body"] = body
        except Exception:
            logger.exception("[Telegram] Email generation failed for chat_id=%s", chat_id)

    params["body"]    = body
    params["subject"] = subject
    await _show_email_preview(chat_id, intent, user_id)


async def _advance_email_send(chat_id: str, intent: dict, user_id: str,
                              original_command: str = ""):
    """
    Step 1: Resolve recipient (name → email via Gmail history).
    Step 2: AI generates subject + body.
    Step 3: Show preview with YES / EDIT / NO.
    """
    params  = intent.setdefault("parameters", {})
    to      = (params.get("to") or "").strip()

    if not to:
        _conv.pop(chat_id, None)
        await send_message(chat_id, "📧 Who should I send this to? (Enter an email address)")
        return

    # Step 1 — if `to` is a name (no @), resolve via Gmail contact history
    if "@" not in to:
        profile       = await _get_profile(user_id)
        access_token  = (profile or {}).get("google_access_token")
        refresh_token = (profile or {}).get("google_refresh_token")

        if not access_token:
            _conv.pop(chat_id, None)
            await send_message(chat_id, "⚠️ Google account not connected. Can't search contacts.")
            return

        from command_executor import find_recipient_candidates, _build_creds
        try:
            loop       = asyncio.get_event_loop()
            creds      = await loop.run_in_executor(
                None, functools.partial(_build_creds, access_token, refresh_token)
            )
            candidates = await loop.run_in_executor(
                None, functools.partial(find_recipient_candidates, creds, to)
            )
        except Exception:
            logger.exception("[Telegram] Recipient resolution failed for chat_id=%s", chat_id)
            candidates = []

        if not candidates:
            _conv.pop(chat_id, None)
            await send_message(
                chat_id,
                f"❌ I couldn't find an email for <b>{to}</b> in your Gmail history.\n\n"
                "Please provide their email address directly.",
            )
            return

        if len(candidates) == 1:
            c = candidates[0]
            params["to"] = c["email"]
            _conv[chat_id] = {
                "state":            "wait_recipient_confirm",
                "intent":           intent,
                "user_id":          user_id,
                "original_command": original_command,
            }
            await send_message(
                chat_id,
                f"📧 Found: <b>{c.get('display_name', c['email'])}</b> &lt;{c['email']}&gt;\n\n"
                "Is this correct? Reply <b>YES</b> to continue or <b>NO</b> to cancel.",
            )
            return

        # Multiple matches — list them
        lines = [f"🔍 Multiple matches for <b>{to}</b>. Which one?\n"]
        for i, c in enumerate(candidates[:5], 1):
            lines.append(f"{i}. {c.get('display_name', '')} &lt;{c['email']}&gt;")
        lines.append("\nReply with the <b>number</b> (1, 2, …) or <b>NO</b> to cancel.")
        _conv[chat_id] = {
            "state":            "wait_recipient_pick",
            "intent":           intent,
            "user_id":          user_id,
            "original_command": original_command,
            "candidates":       candidates[:5],
        }
        await send_message(chat_id, "\n".join(lines))
        return

    # Step 2+3 — email already has @, go straight to generation + preview
    await _generate_and_preview(chat_id, intent, user_id, original_command)


async def _show_email_preview(chat_id: str, intent: dict, user_id: str):
    params  = intent.get("parameters", {})
    to      = params.get("to", "?")
    subject = params.get("subject") or "(No Subject)"
    body    = _get_body(params)

    body_preview = body[:500] + ("…" if len(body) > 500 else "")
    preview = (
        f"📧 <b>Ready to send email</b>\n\n"
        f"<b>To:</b> {to}\n"
        f"<b>Subject:</b> {subject}\n"
        f"<b>Body:</b>\n{body_preview}\n\n"
        "Reply <b>YES</b> to send, <b>EDIT</b> to modify, or <b>NO</b> to cancel."
    )
    _conv[chat_id] = {"state": "wait_confirm", "intent": intent, "user_id": user_id}
    await send_message(chat_id, preview)


async def _execute_email_send(chat_id: str, intent: dict,
                               access_token: str, refresh_token: str | None):
    """Call execute_command for a Gmail send and report the result."""
    from command_executor import execute_command
    try:
        loop   = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            functools.partial(execute_command, intent, access_token, refresh_token),
        )
        logger.info("[Telegram] Email send result for chat_id=%s: %s", chat_id, result)

        if isinstance(result, dict):
            if result.get("type") == "error":
                await send_message(chat_id, f"❌ Email failed: {result.get('error', 'unknown error')}")
                return
            if result.get("type") == "needs_disambiguation":
                kind       = result.get("kind", "item")
                candidates = result.get("candidates") or []
                lines      = [f"🔍 <b>Multiple {kind}s found — which one?</b>"]
                for c in candidates[:5]:
                    if kind == "recipient":
                        lines.append(f"• {c.get('display_name', '')} &lt;{c.get('email', '')}&gt;")
                    else:
                        lines.append(f"• {c.get('name', '')} <i>({c.get('type', '')})</i>")
                lines.append("\nPlease re-send using the exact email address.")
                await send_message(chat_id, "\n".join(lines))
                return
            if result.get("sent") or result.get("type") == "gmail_send":
                to = result.get("to") or intent.get("parameters", {}).get("to", "recipient")
                await send_message(chat_id, f"✅ Email sent to <b>{to}</b>")
                return

        await send_message(chat_id, _format_nl_result(result))

    except Exception as e:
        logger.exception("[Telegram] Email send failed for chat_id=%s", chat_id)
        await send_message(chat_id, f"❌ Email failed: {str(e)[:300]}")


# ── NL command handler ────────────────────────────────────────────────────────

async def _handle_nl_command(chat_id: str, text: str, user_id: str,
                              access_token: str, refresh_token: str | None):
    """
    Parse and execute a natural language command via the AI engine.
    Gmail Send → multi-step compose flow.
    Everything else → execute immediately and return formatted result.
    """
    from ai_engine import parse_command_intent
    from command_executor import execute_command

    await send_message(chat_id, "⏳ Processing…")

    try:
        intent = await parse_command_intent(text)
    except Exception:
        logger.exception("[Telegram] Intent parsing failed for chat_id=%s", chat_id)
        await send_message(chat_id, "⚠️ AI service unavailable. Please try again.")
        return

    if not isinstance(intent, dict) or "service" not in intent:
        await send_message(chat_id, "🤔 I couldn't understand that. Try /help for examples.")
        return

    service = (intent.get("service") or "").lower()
    action  = (intent.get("action")  or "").lower()

    # Gmail Send/Reply → AI generates subject+body, then shows preview
    if service == "gmail" and action in ("send", "reply"):
        await _advance_email_send(chat_id, intent, user_id, text)
        return

    # All other commands — execute and return result
    try:
        loop   = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            functools.partial(execute_command, intent, access_token, refresh_token),
        )
        logger.info("[Telegram] NL result for chat_id=%s type=%s",
                    chat_id, result.get("type") if isinstance(result, dict) else type(result))
    except Exception as e:
        logger.exception("[Telegram] NL execution failed for chat_id=%s", chat_id)
        await send_message(chat_id, f"❌ Command failed: {str(e)[:300]}")
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
        lines.append("\nPlease rephrase with more specific details.")
        await send_message(chat_id, "\n".join(lines))
        return

    await _send_long(chat_id, _format_nl_result(result))


# ── REST endpoints ────────────────────────────────────────────────────────────

@router.post("/connect")
async def telegram_connect(request: Request):
    """Generate a verification code (legacy fallback)."""
    user = await _require_auth(request)
    code = generate_verification_code()
    await _set_connection(user["id"], {
        "verification_code": code,
        "chat_id":   None,
        "username":  None,
        "verified_at": None,
    })
    return {"code": code}


@router.post("/disconnect")
async def telegram_disconnect(request: Request):
    user = await _require_auth(request)
    await _delete_connection(user["id"])
    return {"success": True}


@router.get("/status")
async def telegram_status(request: Request):
    user = await _require_auth(request)
    conn = await _get_connection(user["id"])
    if not conn:
        return {"connected": False, "pending": False, "username": None}
    if conn.get("verified_at"):
        return {"connected": True, "pending": False, "username": conn.get("username")}
    return {"connected": False, "pending": True, "username": None}


@router.post("/test")
async def telegram_test(request: Request):
    """Send a test message. No plan check — any connected user can test."""
    user = await _require_auth(request)
    conn = await _get_connection(user["id"])
    if not conn or not conn.get("verified_at") or not conn.get("chat_id"):
        raise HTTPException(status_code=400, detail="No verified Telegram connection found.")
    try:
        await send_test_message(conn["chat_id"])
        return {"success": True}
    except Exception:
        logger.exception("[Telegram] Test failed for user %s", user["id"])
        raise HTTPException(status_code=502, detail="Failed to send test message.")


# ── Main webhook ──────────────────────────────────────────────────────────────

@router.post("/webhook")
async def telegram_webhook(request: Request):
    """Receive and route Telegram Bot API updates."""
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

    is_command = text.startswith("/")
    if is_command:
        raw = text.split()[0].lstrip("/").lower()
        command = raw.split("@")[0]
    else:
        command = None

    # ── /start [USER_ID] — one-click auto-link ────────────────────────────────
    if command == "start":
        parts   = text.split(maxsplit=1)
        payload = parts[1].strip() if len(parts) > 1 else None
        if payload:
            try:
                await _set_connection(payload, {
                    "chat_id":           chat_id,
                    "username":          username,
                    "verified_at":       datetime.now(tz.utc).isoformat(),
                    "verification_code": None,
                })
                await send_message(
                    chat_id,
                    "✅ <b>Your account is linked!</b>\n\n"
                    "You'll receive your daily briefing here.\n\n"
                    "💬 <b>Just type naturally, like:</b>\n"
                    "— \"Find emails from LinkedIn\"\n"
                    "— \"What's on my calendar today?\"\n"
                    "— \"Send email to X about Y\"\n\n"
                    "/briefing /tasks /automations /help",
                )
            except Exception:
                logger.exception("[Telegram] Auto-link failed for payload=%s", payload)
                await send_message(
                    chat_id,
                    "⚠️ Something went wrong linking your account. "
                    "Please try again from the WorkspaceFlow dashboard.",
                )
        else:
            await send_message(
                chat_id,
                "👋 <b>Welcome to WorkspaceFlow!</b>\n\n"
                "Open your dashboard and click <b>Open Telegram Bot →</b> to link automatically.",
            )
        return JSONResponse({"ok": True})

    # ── /verify CODE — legacy fallback ───────────────────────────────────────
    if command == "verify":
        parts = text.split()
        if len(parts) < 2:
            await send_message(chat_id, "Usage: <code>/verify CODE</code>")
            return JSONResponse({"ok": True})
        code         = parts[1].strip()
        supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        url = (
            f"{supabase_url}/rest/v1/telegram_connections"
            f"?verification_code=eq.{code}&verified_at=is.null&select=user_id"
        )
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=_sb_headers())
            rows = resp.json() if resp.status_code == 200 else []
        if not rows:
            await send_message(chat_id, "❌ Invalid or expired code. Generate a fresh one from your dashboard.")
            return JSONResponse({"ok": True})
        user_id = rows[0]["user_id"]
        await _set_connection(user_id, {
            "chat_id": chat_id, "username": username,
            "verified_at": datetime.now(tz.utc).isoformat(), "verification_code": None,
        })
        await send_message(chat_id, "✅ <b>Connected!</b>\n\n💬 Just type anything naturally or use /help.")
        return JSONResponse({"ok": True})

    # ── Look up user by chat_id (required for all further messages) ───────────
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{supabase_url}/rest/v1/telegram_connections"
            f"?chat_id=eq.{chat_id}&verified_at=not.is.null&select=user_id",
            headers=_sb_headers(),
        )
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

    # ── /cancel — clear any active conversation state ────────────────────────
    if command == "cancel":
        _conv.pop(chat_id, None)
        await send_message(chat_id, "❌ Cancelled.")
        return JSONResponse({"ok": True})

    # ── Conversation state machine (non-slash replies) ────────────────────────
    if not is_command and chat_id in _conv:
        state   = _conv[chat_id]["state"]
        intent  = _conv[chat_id]["intent"]
        params  = intent.setdefault("parameters", {})
        answer  = text.strip()
        upper   = answer.upper()

        if state == "wait_recipient_confirm":
            orig_cmd = _conv[chat_id].get("original_command", "")
            if upper in ("YES", "Y", "OK", "YEP", "SURE"):
                _conv.pop(chat_id, None)
                await _generate_and_preview(chat_id, intent, user_id, orig_cmd)
            elif upper in ("NO", "N", "CANCEL"):
                _conv.pop(chat_id, None)
                await send_message(chat_id, "❌ Cancelled.")
            else:
                await send_message(chat_id, "Please reply <b>YES</b> to continue or <b>NO</b> to cancel.")
            return JSONResponse({"ok": True})

        if state == "wait_recipient_pick":
            candidates = _conv[chat_id].get("candidates", [])
            orig_cmd   = _conv[chat_id].get("original_command", "")
            if upper in ("NO", "N", "CANCEL"):
                _conv.pop(chat_id, None)
                await send_message(chat_id, "❌ Cancelled.")
            elif answer.isdigit() and 1 <= int(answer) <= len(candidates):
                chosen = candidates[int(answer) - 1]
                params["to"] = chosen["email"]
                _conv.pop(chat_id, None)
                await _generate_and_preview(chat_id, intent, user_id, orig_cmd)
            else:
                await send_message(
                    chat_id,
                    f"Please reply with a number (1–{len(candidates)}) or <b>NO</b> to cancel.",
                )
            return JSONResponse({"ok": True})

        if state == "wait_confirm":
            if upper in ("YES", "Y", "SEND", "OK", "CONFIRM", "YEP", "YUP", "SURE"):
                _conv.pop(chat_id, None)
                await _execute_email_send(chat_id, intent, access_token, refresh_token)
            elif upper == "EDIT":
                _conv[chat_id]["state"] = "wait_edit"
                await send_message(
                    chat_id,
                    "✏️ <b>What would you like to change?</b>\n\n"
                    "Reply with one or both:\n"
                    "<code>SUBJECT: your new subject</code>\n"
                    "<code>BODY: your new body text</code>",
                )
            elif upper in ("NO", "N", "CANCEL", "STOP", "NOPE"):
                _conv.pop(chat_id, None)
                await send_message(chat_id, "❌ Cancelled.")
            else:
                # Treat as a new NL command; discard old pending
                _conv.pop(chat_id, None)
                if not access_token:
                    await send_message(chat_id, "⚠️ Google account not connected.")
                    return JSONResponse({"ok": True})
                await _handle_nl_command(chat_id, text, user_id, access_token, refresh_token)
            return JSONResponse({"ok": True})

        if state == "wait_edit":
            # Parse SUBJECT: and/or BODY: from user reply
            subject_match = re.search(r'(?im)^SUBJECT:\s*(.+?)(?=\nBODY:|$)', answer, re.DOTALL)
            body_match    = re.search(r'(?im)^BODY:\s*(.+)', answer, re.DOTALL)
            if subject_match:
                params["subject"] = subject_match.group(1).strip()
            if body_match:
                params["body"] = body_match.group(1).strip()
            if not subject_match and not body_match:
                # No keywords — treat entire reply as body replacement
                params["body"] = answer
            _conv.pop(chat_id, None)
            await _show_email_preview(chat_id, intent, user_id)
            return JSONResponse({"ok": True})

    # ── Slash commands ────────────────────────────────────────────────────────

    if command == "help":
        await send_message(
            chat_id,
            "💬 <b>Just type anything naturally, like:</b>\n"
            "— \"Find emails from LinkedIn\"\n"
            "— \"What's on my calendar today?\"\n"
            "— \"Send email to sarah@example.com about the proposal\"\n"
            "— \"Show my pending tasks\"\n"
            "— \"Archive all newsletters\"\n\n"
            "<b>Or use commands:</b>\n"
            "/briefing — morning briefing\n"
            "/tasks — priority items\n"
            "/automations — list your automations\n"
            "/status — account info\n"
            "/cancel — cancel current action\n"
            "/help — this message",
        )

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

    elif command == "briefing":
        if not access_token:
            await send_message(chat_id, "⚠️ Google account not connected. Reconnect at workspace-flow.vercel.app")
            return JSONResponse({"ok": True})
        await send_message(chat_id, "⏳ Fetching your briefing…")
        try:
            from google_service import fetch_morning_briefing_data
            from ai_engine import generate_briefing_summary
            loop     = asyncio.get_event_loop()
            raw_data = await loop.run_in_executor(
                None, functools.partial(fetch_morning_briefing_data, access_token, refresh_token)
            )
            briefing = await generate_briefing_summary(raw_data)
            if not isinstance(briefing, dict) or "schedule" not in briefing:
                raise ValueError("Unexpected briefing format")
            await _send_long(chat_id, format_briefing_telegram(briefing))
        except Exception:
            logger.exception("[Telegram] Briefing failed for chat_id=%s", chat_id)
            await send_message(chat_id, "⚠️ Something went wrong. Please try again.")

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
                None, functools.partial(fetch_morning_briefing_data, access_token, refresh_token)
            )
            briefing = await generate_briefing_summary(raw_data)
            urgent   = (briefing.get("last_24h") or {}).get("urgent_items") or []
            msg      = (
                "<b>⚡ Priority Items</b>\n\n" + "\n".join(f"• {it}" for it in urgent)
                if urgent else "✅ No urgent priority items right now."
            )
            await send_message(chat_id, msg)
        except Exception:
            logger.exception("[Telegram] Tasks failed for chat_id=%s", chat_id)
            await send_message(chat_id, "⚠️ Something went wrong. Please try again.")

    elif command == "automations":
        rules = await _get_automations(user_id)
        if not rules:
            await send_message(
                chat_id,
                "📋 <b>No automations yet.</b>\n\n"
                "Create one at workspace-flow.vercel.app/dashboard/rules\n"
                "or type: /automation add \"describe what you want\"",
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
            lines.append("\n/automation pause [name] · /automation run [name]")
            await send_message(chat_id, "\n".join(lines))

    elif command == "automation":
        parts       = text.split(maxsplit=2)
        sub         = parts[1].lower() if len(parts) > 1 else ""
        description = parts[2].strip().strip('"') if len(parts) > 2 else ""

        if sub == "add":
            if not description:
                await send_message(chat_id, 'Usage: /automation add "description"')
            else:
                supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
                try:
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        await client.post(
                            f"{supabase_url}/rest/v1/rules",
                            json={"user_id": user_id, "title": description[:80],
                                  "description": description, "is_active": True},
                            headers={**_sb_headers(True), "Prefer": "return=minimal"},
                        )
                    await send_message(chat_id, f"✅ Automation added:\n<i>{description}</i>")
                except Exception:
                    await send_message(chat_id, "⚠️ Failed to add automation. Try from the dashboard.")

        elif sub in ("pause", "unpause", "enable", "disable"):
            if not description:
                await send_message(chat_id, f"Usage: /automation {sub} [name]")
            else:
                active = sub not in ("pause", "disable")
                rules  = await _get_automations(user_id)
                match  = next((r for r in rules
                                if description.lower() in (r.get("title") or "").lower()
                                or description.lower() in (r.get("description") or "").lower()), None)
                if not match:
                    await send_message(chat_id, f'❌ No automation found matching "{description}".')
                else:
                    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
                    async with httpx.AsyncClient(timeout=10.0) as client:
                        await client.patch(
                            f"{supabase_url}/rest/v1/rules?id=eq.{match['id']}&user_id=eq.{user_id}",
                            json={"is_active": active},
                            headers={**_sb_headers(True), "Prefer": "return=minimal"},
                        )
                    word = "resumed" if active else "paused"
                    await send_message(chat_id, f"✅ Automation {word}: <i>{match.get('title', description)}</i>")

        elif sub == "run":
            await send_message(chat_id, "⚡ Manual triggers coming soon. Manage at workspace-flow.vercel.app/dashboard/rules")
        else:
            await send_message(
                chat_id,
                "/automation add \"desc\" — create\n"
                "/automation pause [name] — pause\n"
                "/automation run [name] — trigger\n"
                "/automations — list all",
            )

    else:
        # Unknown slash command OR any plain text → natural language
        if not access_token:
            await send_message(chat_id, "⚠️ Google account not connected. Reconnect at workspace-flow.vercel.app")
            return JSONResponse({"ok": True})
        await _handle_nl_command(chat_id, text, user_id, access_token, refresh_token)

    return JSONResponse({"ok": True})
