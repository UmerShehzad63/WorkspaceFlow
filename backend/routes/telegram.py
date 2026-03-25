"""
Telegram API routes — multi-step conversation engine.

Bot conversation states per chat_id (in-memory):
    wait_intent_confirm    — AI parsed intent, awaiting user confirmation
    wait_service_pick      — unknown service; waiting for service inline button
    wait_recipient_confirm — found 1 candidate, awaiting inline button
    wait_recipient_pick    — found N candidates, awaiting inline button pick
    wait_confirm           — AI-generated preview ready, awaiting inline button
    wait_edit_field        — user chose Edit; awaiting subject/body button
    wait_edit_method       — chose subject or body; awaiting AI-vs-Replace button
    wait_ai_instruction    — chose AI modify; awaiting instruction text
    wait_ai_approve        — AI rewrote field; awaiting accept/retry button
    wait_edit              — replace directly; awaiting new text

Email flow: resolve recipient → AI generates content → preview → buttons → send.
NL flow: any non-slash message → AI command engine → intent confirm → execute.
Free text: every step handles typed text in addition to button callbacks.
"""
import asyncio
import functools
import logging
import os
import re
import secrets
from datetime import datetime, timezone as tz
from email.utils import parsedate_to_datetime

import httpx
from fastapi import APIRouter, HTTPException, Request
from fastapi.responses import JSONResponse
from slowapi import Limiter
from slowapi.util import get_remote_address

limiter = Limiter(key_func=get_remote_address)

from telegram import InlineKeyboardButton, InlineKeyboardMarkup

from services.telegram import (
    answer_callback_query,
    edit_message_reply_markup,
    edit_message_text,
    format_briefing_telegram,
    generate_verification_code,
    send_message,
    send_test_message,
)

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/api/telegram", tags=["telegram"])

# ── Per-chat state ───────────────────────────────────────────────────────────
# _conv: multi-step flow state (active step, intent, etc.)
# _sessions: task/service lock — persists for the life of a task
_conv: dict     = {}
_sessions: dict = {}  # chat_id → {"task": str, "service": str}
_plan_warning_sent: dict = {}  # chat_id → datetime: rate-limits "upgrade required" to 1/hr


def _is_pro_plan(plan: str) -> bool:
    """Return True if the plan grants Telegram / Pro feature access."""
    return (plan or "").lower() in {"pro", "pro_plus", "trialing", "pro_trial", "active"}


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
        f"&select=id,plan,google_access_token,google_refresh_token,timezone"
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


def _fmt_event_dt(dt_str: str, user_timezone: str = "UTC") -> str:
    """
    Parse an RFC 3339 event dateTime and format in user's local timezone.
    Returns e.g. "Sun, Mar 22 · 9:00 PM"
    """
    if not dt_str:
        return "?"
    s = dt_str.strip()
    try:
        from zoneinfo import ZoneInfo
        import datetime as _dt
        if s.endswith("Z"):
            s = s[:-1] + "+00:00"
        dt = _dt.datetime.fromisoformat(s)
        local_dt = dt.astimezone(ZoneInfo(user_timezone))
        hour = int(local_dt.strftime("%I"))
        hour_str = str(hour)
        minute = local_dt.strftime("%M")
        ampm   = local_dt.strftime("%p")
        return f"{local_dt.strftime('%a')}, {local_dt.strftime('%b')} {local_dt.day} · {hour_str}:{minute} {ampm}"
    except Exception:
        return s[:16].replace("T", " ")


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


def _format_nl_result(result: dict, user_timezone: str = "UTC") -> str:
    """Convert a command_executor result dict to readable Telegram HTML."""
    t = result.get("type", "")

    if t == "unsupported":
        return result.get("message", "I can't do that with Google Workspace.")

    if t == "gmail_search":
        return _format_email_list(result.get("messages", []))

    if t == "gmail_send":
        return f"✅ Email sent to <b>{result.get('to', 'recipient')}</b>"

    if t == "gmail_archive":
        n = result.get("archived", 0)
        return f"✅ Archived <b>{n}</b> email{'s' if n != 1 else ''}."

    if t == "calendar_search":
        events  = result.get("events", [])
        summary = result.get("summary", "")
        if not events:
            return f"📅 {summary or 'No events found.'}"
        header = f"📅 <b>{summary}</b>" if summary else f"📅 <b>{len(events)} event{'s' if len(events) != 1 else ''}</b>"
        lines  = [header]
        for i, e in enumerate(events[:10]):
            raw_start = e.get("start") or ""
            # Use date-only for all-day events, otherwise convert to local time
            if len(raw_start) == 10:
                start = raw_start  # all-day event
            else:
                start = _fmt_event_dt(raw_start, user_timezone)
            title = e.get("title") or "Event"
            entry = f"\n{i+1}. <b>{title}</b>"
            if start:
                entry += f"\n   📅 {start}"
            attendees = e.get("attendees") or []
            if attendees:
                entry += f"\n   👥 {', '.join(attendees[:3])}"
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

    if t == "calendar_delete":
        n = result.get("deleted", 0)
        if n == 0:
            return "📅 No events found to delete."
        lines = [f"✅ <b>Deleted {n} event{'s' if n != 1 else ''}</b>"]
        for ev in result.get("deleted_events", [])[:5]:
            title = ev.get("title", "(No title)")
            start = ev.get("start", "")
            if start:
                start = _fmt_event_dt(start, user_timezone)
                lines.append(f"  • {title} — {start}")
            else:
                lines.append(f"  • {title}")
        return "\n".join(lines)

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


# ── Inline keyboard builders ─────────────────────────────────────────────────

_CONFIRM_KB = InlineKeyboardMarkup([[
    InlineKeyboardButton("✅ Send",   callback_data="email:send"),
    InlineKeyboardButton("✏️ Edit",  callback_data="email:edit"),
    InlineKeyboardButton("❌ Cancel", callback_data="email:cancel"),
]])

_EDIT_FIELD_KB = InlineKeyboardMarkup([[
    InlineKeyboardButton("✏️ Edit Subject", callback_data="email:edit_subject"),
    InlineKeyboardButton("✏️ Edit Body",    callback_data="email:edit_body"),
]])

_SERVICE_KB = InlineKeyboardMarkup([[
    InlineKeyboardButton("📧 Gmail",    callback_data="service:gmail"),
    InlineKeyboardButton("📅 Calendar", callback_data="service:calendar"),
    InlineKeyboardButton("📁 Drive",    callback_data="service:drive"),
]])

SUPPORTED_SERVICES = {"gmail", "calendar", "drive"}


def _recipient_kb(candidates: list) -> InlineKeyboardMarkup:
    """One button per candidate contact."""
    rows = []
    for i, c in enumerate(candidates):
        label = f"👤 {c.get('display_name', c['email'])} <{c['email']}>"
        rows.append([InlineKeyboardButton(label, callback_data=f"recipient:{i}")])
    rows.append([InlineKeyboardButton("❌ Cancel", callback_data="recipient:cancel")])
    return InlineKeyboardMarkup(rows)


_CONTINUE_CANCEL_KB = InlineKeyboardMarkup([[
    InlineKeyboardButton("✅ Continue",            callback_data="flow:continue"),
    InlineKeyboardButton("❌ Cancel & Start Over", callback_data="flow:cancel"),
]])

_INTENT_CONFIRM_KB = InlineKeyboardMarkup([[
    InlineKeyboardButton("✅ Correct",           callback_data="intent:confirm"),
    InlineKeyboardButton("❌ Wrong, let me fix", callback_data="intent:wrong"),
]])

_EDIT_METHOD_KB = InlineKeyboardMarkup([[
    InlineKeyboardButton("🤖 Modify with AI",   callback_data="edit_method:ai"),
    InlineKeyboardButton("✍️ Replace Directly", callback_data="edit_method:replace"),
]])

_AI_RESULT_KB = InlineKeyboardMarkup([[
    InlineKeyboardButton("✅ Use This",   callback_data="ai_edit:accept"),
    InlineKeyboardButton("🔄 Try Again", callback_data="ai_edit:retry"),
]])

_DRIVE_ERROR_KB = InlineKeyboardMarkup([[
    InlineKeyboardButton("📧 Send Without Attachment", callback_data="drive:skip"),
    InlineKeyboardButton("❌ Cancel",                  callback_data="email:cancel"),
]])

_TASK_LABELS = {
    "send_email":      "Send Email",
    "search_email":    "Search Emails",
    "archive_email":   "Archive Emails",
    "create_event":    "Create Calendar Event",
    "search_calendar": "Search Calendar",
    "search_drive":    "Search Drive",
}
_SVC_LABELS = {
    "gmail":    "Gmail",
    "calendar": "Google Calendar",
    "drive":    "Google Drive",
}


def _detect_task(service: str, action: str) -> str:
    """Derive a task label from service + action."""
    s, a = service.lower(), action.lower()
    if s == "gmail":
        if a in ("send", "reply"):                       return "send_email"
        if a in ("archive", "delete", "move", "label"):  return "archive_email"
        return "search_email"
    if s == "calendar":
        if a in ("create", "schedule", "add", "book"):   return "create_event"
        return "search_calendar"
    return "search_drive"


def _sniff_service(text: str) -> str | None:
    """Return the service name if the text clearly mentions one."""
    t = text.lower()
    if "drive" in t or "google drive" in t or "docs" in t or "sheets" in t:
        return "drive"
    if "calendar" in t or " cal " in t or "schedule" in t:
        return "calendar"
    if "gmail" in t or "email" in t or "inbox" in t or "mail" in t:
        return "gmail"
    return None


# ── Rule-based intent override (action verb takes highest priority over AI) ───

_RE_DOWNLOAD_VERB = re.compile(r'\b(download|fetch|grab|retrieve)\b', re.I)
_RE_DRIVE_KW      = re.compile(r'\b(drive|google\s+drive|my\s+drive)\b', re.I)
_RE_SEND_VERB     = re.compile(r'\b(send|compose|email\s+to|write\s+an?\s+email|mail\s+to)\b', re.I)
_RE_EMAIL_VERB    = re.compile(r'\b(send\s+(an?\s+)?email|email\s+to|write\s+(an?\s+)?email|compose\s+(an?\s+)?email|send\s+a\s+mail|mail\s+to)\b', re.I)


def _apply_intent_overrides(text: str, intent: dict) -> dict:
    """Override AI-detected service/action using strong rule-based signals.

    Download verbs always win over AI's Gmail/send classification:
      "download CV from drive" → Drive/search, NOT Gmail/send
    """
    t = text.lower()
    if _RE_DOWNLOAD_VERB.search(t):
        # Download verbs → must be Drive, never send email
        intent["service"] = "drive"
        if (intent.get("action") or "").lower() in ("send", "reply"):
            intent["action"] = "search"
    elif _RE_DRIVE_KW.search(t) and not _RE_SEND_VERB.search(t):
        # Explicit "drive/google drive" without a send verb → Drive
        intent["service"] = "drive"

    # "Send an email / email to / write an email" → always Gmail/Send
    service_cur = (intent.get("service") or "").lower()
    action_cur  = (intent.get("action")  or "").lower()
    if _RE_EMAIL_VERB.search(t) and service_cur not in SUPPORTED_SERVICES:
        intent["service"] = "gmail"
        if action_cur not in ("send", "reply"):
            intent["action"] = "send"
    return intent


def _intent_human_description(intent: dict) -> str:
    """Return a short human-readable description of the detected intent."""
    service = (intent.get("service") or "").lower()
    action  = (intent.get("action")  or "").lower()
    svc_label = _SVC_LABELS.get(service, service.title() or "Unknown Service")
    if service == "gmail":
        if action in ("send", "reply"):               return f"Send Email via {svc_label}"
        if action in ("archive", "delete", "label"):  return f"Archive Emails via {svc_label}"
        return f"Search Emails via {svc_label}"
    if service == "calendar":
        if action in ("create", "schedule", "add", "book"):
            params  = intent.get("parameters") or {}
            summary = params.get("summary") or "Event"
            start   = (params.get("start_time") or params.get("start") or "").strip()
            if start:
                try:
                    from datetime import datetime as _dt
                    _d = _dt.fromisoformat(start.split("+")[0].rstrip("Z"))
                    time_str = _d.strftime("%A, %B %-d at %-I:%M %p")
                except Exception:
                    try:
                        from datetime import datetime as _dt
                        _d = _dt.fromisoformat(start.split("+")[0].rstrip("Z"))
                        time_str = f"{_d.strftime('%A, %B')} {_d.day} at {_d.hour:02d}:{_d.minute:02d}"
                    except Exception:
                        time_str = start[:16].replace("T", " ")
                return f"Create Event: <b>{summary}</b> on {time_str}"
            return f"Create Event: <b>{summary}</b>"
        return "Search Calendar"
    if service == "drive":
        return "Search Google Drive"
    return intent.get("human_description") or f"{action.title()} on {svc_label}"


_CANCEL_WORDS_SET = frozenset({
    "cancel", "stop", "nvm", "nevermind", "leave it", "forget it",
    "abort", "quit", "no thanks", "nope", "exit", "skip",
})


def _is_cancel_text(text: str) -> bool:
    t = text.lower().strip()
    return (t in _CANCEL_WORDS_SET
            or "cancel" in t
            or "leave it" in t
            or "forget it" in t
            or "nevermind" in t)


_CONFIRM_WORDS_SET = frozenset({
    "yes", "y", "ok", "okay", "sure", "yep", "yup", "confirm", "correct",
    "right", "send it", "go ahead", "sounds good", "looks good",
    "do it", "proceed", "yes please", "yeah",
})


def _is_confirm_text(text: str) -> bool:
    return text.lower().strip() in _CONFIRM_WORDS_SET


async def _clear_kb(chat_id: str, message_id: int | None) -> None:
    """Strip inline keyboard from a message, keeping its text intact."""
    if message_id:
        await edit_message_reply_markup(chat_id, message_id)


def _session_warning(chat_id: str) -> str:
    """Return the ⚠️ mid-flow warning text for the current session."""
    session = _sessions.get(chat_id, {})
    task    = _TASK_LABELS.get(session.get("task", ""), "current task")
    svc     = _SVC_LABELS.get(session.get("service", ""), "current service")
    return (
        f"⚠️ I'm currently helping you with: <b>{task}</b> on <b>{svc}</b>.\n\n"
        "What would you like to do?"
    )


# ── Email send multi-step helpers ─────────────────────────────────────────────

def _get_body(params: dict) -> str:
    return (
        params.get("body") or params.get("message") or params.get("content") or ""
    ).strip()


async def _generate_and_preview(chat_id: str, intent: dict, user_id: str,
                                original_command: str = "",
                                status_message_id: int | None = None):
    """Generate AI email content (subject + body) then show the preview."""
    params  = intent.setdefault("parameters", {})
    to      = (params.get("to") or "").strip()
    subject = (params.get("subject") or "").strip()
    body    = _get_body(params)

    async def _update_status(text: str):
        if status_message_id:
            await edit_message_text(chat_id, status_message_id, text)
        else:
            await send_message(chat_id, text)

    if not subject or not body:
        await _update_status("📧 Preparing email…")
        from ai_engine import generate_email_content
        sender_name = await _get_user_display_name(user_id)
        to_name = (params.get("_to_name") or "").strip()
        try:
            generated = await generate_email_content(
                original_command or to, to, sender_name=sender_name, to_name=to_name
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
    # Always send preview as a fresh message (Part 2: no message disappearing)
    await _show_email_preview(chat_id, intent, user_id)


async def _advance_email_send(chat_id: str, intent: dict, user_id: str,
                              original_command: str = "",
                              status_message_id: int | None = None):
    """
    Step 1: Resolve recipient (name → email via Gmail history).
    Step 2: AI generates subject + body.
    Step 3: Show preview with inline buttons.
    """
    params  = intent.setdefault("parameters", {})
    to      = (params.get("to") or "").strip()

    async def _update_status(text: str):
        nonlocal status_message_id
        if status_message_id:
            await edit_message_text(chat_id, status_message_id, text)
        else:
            msg = await send_message(chat_id, text)
            if msg:
                status_message_id = msg.get("message_id")

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
            await _update_status("⚠️ Google account not connected. Can't search contacts.")
            return

        await _update_status("👤 Resolving recipient…")

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
            await _update_status(
                f"❌ I couldn't find an email for <b>{to}</b> in your Gmail history.\n\n"
                "Please provide their email address directly."
            )
            return

        if len(candidates) == 1:
            c = candidates[0]
            params["to"] = c["email"]
            params["_to_name"] = c.get("display_name", "")
            _conv[chat_id] = {
                "state":            "wait_recipient_confirm",
                "intent":           intent,
                "user_id":          user_id,
                "original_command": original_command,
            }
            kb = InlineKeyboardMarkup([[
                InlineKeyboardButton("✅ Yes", callback_data="recipient_confirm:yes"),
                InlineKeyboardButton("❌ Cancel", callback_data="recipient_confirm:cancel"),
            ]])
            confirm_text = (
                f"📧 Found: <b>{c.get('display_name', c['email'])}</b> &lt;{c['email']}&gt;\n\n"
                "Is this correct?"
            )
            msg = await send_message(chat_id, confirm_text, reply_markup=kb)
            if msg:
                _conv[chat_id]["confirm_message_id"] = msg.get("message_id")
            return

        # Multiple matches — inline buttons
        kb = _recipient_kb(candidates[:5])
        pick_text = f"🔍 Multiple matches for <b>{to}</b>. Which one?"
        _conv[chat_id] = {
            "state":            "wait_recipient_pick",
            "intent":           intent,
            "user_id":          user_id,
            "original_command": original_command,
            "candidates":       candidates[:5],
        }
        msg = await send_message(chat_id, pick_text, reply_markup=kb)
        if msg:
            _conv[chat_id]["confirm_message_id"] = msg.get("message_id")
        return

    # Step 2 — pre-resolve Drive file attachment so it shows in preview
    drive_file = (params.get("drive_file") or "").strip()
    if drive_file and not params.get("_drive_file_resolved"):
        await _update_status("📁 Looking for file in Drive…")
        profile_d       = await _get_profile(user_id)
        at_access       = (profile_d or {}).get("google_access_token") or access_token
        at_refresh      = (profile_d or {}).get("google_refresh_token") or refresh_token
        if at_access:
            from command_executor import find_file_candidates, _build_creds
            try:
                loop_d       = asyncio.get_event_loop()
                creds_d      = await loop_d.run_in_executor(
                    None, functools.partial(_build_creds, at_access, at_refresh)
                )
                file_cands   = await loop_d.run_in_executor(
                    None, functools.partial(find_file_candidates, creds_d, drive_file)
                )
            except Exception:
                logger.exception("[Telegram] Drive pre-resolution failed for chat_id=%s", chat_id)
                file_cands = []

            if not file_cands:
                _sessions.pop(chat_id, None)
                _conv.pop(chat_id, None)
                await send_message(
                    chat_id,
                    f"❌ <b>File not found in Drive: {drive_file}</b>\n\n"
                    "Please check the file name and try again.",
                    reply_markup=_DRIVE_ERROR_KB,
                )
                _conv[chat_id] = {"state": "wait_confirm", "intent": intent, "user_id": user_id}
                return
            elif len(file_cands) == 1:
                # Cache resolved metadata so execute_command uses it directly
                params["_drive_file_id"]       = file_cands[0]["id"]
                params["_drive_file_name"]     = file_cands[0]["name"]
                params["_drive_file_resolved"] = True
            elif len(file_cands) > 1:
                # Multiple files — show picker immediately, do NOT fall through to email preview
                kb_rows = []
                for i, fc in enumerate(file_cands[:5]):
                    label = f"📄 {fc.get('name', 'File')}"
                    kb_rows.append([InlineKeyboardButton(label, callback_data=f"drive_file:{i}")])
                kb_rows.append([InlineKeyboardButton("📧 Send Without Attachment", callback_data="drive:skip")])
                kb_rows.append([InlineKeyboardButton("❌ Cancel",                  callback_data="email:cancel")])
                msg = await send_message(
                    chat_id,
                    f"📁 <b>Multiple files found for '{drive_file}'</b>\nWhich one do you want to attach?",
                    reply_markup=InlineKeyboardMarkup(kb_rows),
                )
                _conv[chat_id] = {
                    "state":            "wait_drive_pick",
                    "intent":           intent,
                    "user_id":          user_id,
                    "original_command": original_command,
                    "drive_candidates": [{"id": fc["id"], "name": fc["name"]} for fc in file_cands[:5]],
                    "after_pick":       "generate_preview",   # show email preview after picking
                    "confirm_message_id": (msg or {}).get("message_id"),
                }
                return   # wait for user to pick — do NOT fall through

    # Step 3 — generate email + show preview
    await _generate_and_preview(chat_id, intent, user_id, original_command,
                                 status_message_id=status_message_id)  # spinner only


async def _show_email_preview(chat_id: str, intent: dict, user_id: str):
    """Always sends a fresh message — never edits an existing one (Part 2)."""
    params  = intent.get("parameters", {})
    to      = params.get("to", "?")
    subject = params.get("subject") or "(No Subject)"
    body    = _get_body(params)

    drive_file = params.get("_drive_file_name") or params.get("drive_file") or ""
    body_preview = body[:500] + ("…" if len(body) > 500 else "")
    preview = (
        f"✅ <b>Ready to send!</b>\n\n"
        f"<b>To:</b> {to}\n"
        f"<b>Subject:</b> {subject}\n"
        f"<b>Body:</b>\n{body_preview}"
    )
    if drive_file:
        preview += f"\n\n📎 <b>Attachment:</b> {drive_file}"
    msg = await send_message(chat_id, preview, reply_markup=_CONFIRM_KB)
    _conv[chat_id] = {
        "state":             "wait_confirm",
        "intent":            intent,
        "user_id":           user_id,
        "status_message_id": msg.get("message_id") if msg else None,
    }


async def _execute_email_send(chat_id: str, intent: dict,
                               access_token: str, refresh_token: str | None,
                               user_id: str = ""):
    """Call execute_command for a Gmail send; always sends new result messages (Part 2)."""
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
                err_msg = result.get("error", "unknown error")
                # Drive file not found — offer to send without attachment
                if "drive" in err_msg.lower() or "file" in err_msg.lower() or "found" in err_msg.lower():
                    await send_message(
                        chat_id,
                        f"❌ <b>Attachment issue:</b> {err_msg}\n\n"
                        "You can send the email without the attachment, or cancel.",
                        reply_markup=_DRIVE_ERROR_KB,
                    )
                    _conv[chat_id] = {"state": "wait_confirm", "intent": intent, "user_id": user_id}
                else:
                    await send_message(chat_id, f"❌ Email failed: {err_msg}")
                return
            if result.get("type") == "needs_disambiguation":
                kind       = result.get("kind", "item")
                candidates = result.get("candidates") or []
                if kind == "recipient" and candidates:
                    norm = [{"email": c.get("email", ""), "display_name": c.get("display_name", c.get("email", ""))} for c in candidates[:5]]
                    kb = _recipient_kb(norm)
                    msg = await send_message(chat_id,
                                             "🔍 <b>Multiple recipients found — which one?</b>",
                                             reply_markup=kb)
                    _conv[chat_id] = {
                        "state":      "wait_recipient_pick",
                        "intent":     intent,
                        "user_id":    user_id,
                        "candidates": norm,
                        "original_command": "",
                        "confirm_message_id": (msg or {}).get("message_id"),
                    }
                elif kind == "file" and candidates:
                    # Drive file disambiguation — show picker buttons
                    kb_rows = []
                    for i, f in enumerate(candidates[:5]):
                        label = f"📄 {f.get('name', 'File')} ({f.get('type', '')})"
                        kb_rows.append([InlineKeyboardButton(label, callback_data=f"drive_file:{i}")])
                    kb_rows.append([InlineKeyboardButton("❌ Cancel", callback_data="email:cancel")])
                    msg = await send_message(
                        chat_id,
                        "📁 <b>Multiple files found. Which one do you want to attach?</b>",
                        reply_markup=InlineKeyboardMarkup(kb_rows),
                    )
                    _conv[chat_id] = {
                        "state":           "wait_drive_pick",
                        "intent":          intent,
                        "user_id":         user_id,
                        "drive_candidates": candidates[:5],
                        "confirm_message_id": (msg or {}).get("message_id"),
                    }
                else:
                    lines = [f"🔍 <b>Multiple {kind}s found — be more specific:</b>"]
                    for c in candidates[:5]:
                        lines.append(f"• {c.get('name', '')} <i>({c.get('type', '')})</i>")
                    lines.append("\nPlease rephrase with more specific details.")
                    await send_message(chat_id, "\n".join(lines))
                return
            if result.get("sent") or result.get("type") == "gmail_send":
                to = result.get("to") or intent.get("parameters", {}).get("to", "recipient")
                _sessions.pop(chat_id, None)
                await send_message(chat_id, f"✅ Email sent to <b>{to}</b>")
                return

        await send_message(chat_id, _format_nl_result(result, "UTC"))

    except Exception as e:
        logger.exception("[Telegram] Email send failed for chat_id=%s", chat_id)
        await send_message(chat_id, "❌ Failed to send email. Please try again.")


# ── Calendar delete flow ──────────────────────────────────────────────────────

async def _handle_calendar_delete(chat_id: str, intent: dict, user_id: str,
                                   access_token: str, refresh_token: str | None,
                                   user_timezone: str = "UTC"):
    """
    Calendar delete flow: list events → confirm → delete.
    Step 1: fetch and show matching events.
    Step 2: ask YES/NO.
    Step 3: on YES, delete them all.
    """
    from command_executor import execute_command, _build_creds, _local_to_rfc3339, _calendar_service

    params   = intent.get("parameters", {})
    time_min = _local_to_rfc3339(params.get("date_range_start"), user_timezone)
    time_max = _local_to_rfc3339(params.get("date_range_end"), user_timezone)
    query    = params.get("query") or params.get("title") or ""

    status_msg = await send_message(chat_id, "🔍 Finding events…")
    status_id  = (status_msg or {}).get("message_id")

    try:
        loop   = asyncio.get_event_loop()
        creds  = await loop.run_in_executor(
            None, functools.partial(_build_creds, access_token, refresh_token)
        )
        svc    = _calendar_service(creds)

        from command_executor import calendar_search
        search_result = await loop.run_in_executor(
            None,
            functools.partial(
                calendar_search, access_token, refresh_token,
                query=query, time_min=time_min, time_max=time_max,
                display_start=params.get("date_range_start"),
                display_end=params.get("date_range_end"),
            )
        )
    except Exception as e:
        await send_message(chat_id, "❌ Could not fetch calendar events. Please try again.")
        return

    events = search_result.get("events", [])
    if not events:
        summary = search_result.get("summary", "No events found.")
        if status_id:
            await edit_message_text(chat_id, status_id, f"📅 {summary}\n\nNothing to delete.")
        else:
            await send_message(chat_id, f"📅 {summary}\n\nNothing to delete.")
        return

    # Build confirmation message
    lines = [f"🗑 <b>Found {len(events)} event{'s' if len(events) != 1 else ''} to delete:</b>\n"]
    for i, e in enumerate(events[:8]):
        raw_start = e.get("start") or ""
        start = raw_start if len(raw_start) == 10 else _fmt_event_dt(raw_start, user_timezone)
        lines.append(f"{i+1}. <b>{e.get('title','Event')}</b>")
        if start:
            lines.append(f"   📅 {start}")
    if len(events) > 8:
        lines.append(f"\n…and {len(events) - 8} more.")
    lines.append("\n<b>Delete all of these?</b>")

    del_kb = InlineKeyboardMarkup([[
        InlineKeyboardButton("🗑 Yes, Delete All", callback_data="cal_delete:confirm"),
        InlineKeyboardButton("❌ No, Cancel",      callback_data="cal_delete:cancel"),
    ]])

    if status_id:
        await edit_message_text(chat_id, status_id, "\n".join(lines), reply_markup=del_kb)
    else:
        await send_message(chat_id, "\n".join(lines), reply_markup=del_kb)

    _conv[chat_id] = {
        "state":        "wait_delete_confirm",
        "intent":       intent,
        "user_id":      user_id,
        "events":       events,
        "user_timezone": user_timezone,
        "status_message_id": status_id,
    }


# ── Route confirmed intent ────────────────────────────────────────────────────

async def _route_intent(chat_id: str, intent: dict, user_id: str,
                        access_token: str, refresh_token: str | None,
                        original_command: str, user_timezone: str = "UTC"):
    """Execute a confirmed intent — lock session, inject timezone, route to handler."""
    from command_executor import execute_command

    service = (intent.get("service") or "").lower()
    action  = (intent.get("action")  or "").lower()
    _sessions[chat_id] = {"task": _detect_task(service, action), "service": service}
    intent.setdefault("parameters", {})["_timezone"] = user_timezone

    if service == "gmail" and action in ("send", "reply"):
        status_msg = await send_message(chat_id, "📧 Preparing email…")
        await _advance_email_send(chat_id, intent, user_id, original_command,
                                  status_message_id=(status_msg or {}).get("message_id"))
        return

    # Calendar delete — show events first, then ask user to confirm deletion
    if service == "calendar" and action in ("delete", "remove", "clear", "cancel"):
        await _handle_calendar_delete(chat_id, intent, user_id,
                                      access_token, refresh_token, user_timezone)
        return

    # For calendar creates, get precise timezone from Google Calendar API if profile only has UTC
    if service == "calendar" and action in ("create", "schedule", "add", "book"):
        if user_timezone in ("UTC", ""):
            try:
                from command_executor import _build_creds, _calendar_service
                loop_tz   = asyncio.get_event_loop()
                creds_tz  = await loop_tz.run_in_executor(
                    None, functools.partial(_build_creds, access_token, refresh_token)
                )
                svc_tz    = _calendar_service(creds_tz)
                setting   = await loop_tz.run_in_executor(
                    None, lambda: svc_tz.settings().get(setting="timezone").execute()
                )
                tz_val = setting.get("value", "")
                if tz_val:
                    user_timezone = tz_val
                    intent.setdefault("parameters", {})["_timezone"] = user_timezone
            except Exception:
                pass  # keep whatever timezone we have

    status_msg = await send_message(chat_id, "⏳ Processing…")
    try:
        loop   = asyncio.get_event_loop()
        result = await loop.run_in_executor(
            None,
            functools.partial(execute_command, intent, access_token, refresh_token, None, user_timezone),
        )
        logger.info("[Telegram] NL result for chat_id=%s type=%s",
                    chat_id, result.get("type") if isinstance(result, dict) else type(result))
        _sessions.pop(chat_id, None)
    except Exception as e:
        logger.exception("[Telegram] NL execution failed for chat_id=%s", chat_id)
        _sessions.pop(chat_id, None)
        await send_message(chat_id, "❌ Command failed. Please try again.")
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

    await _send_long(chat_id, _format_nl_result(result, user_timezone))


# ── NL command handler ────────────────────────────────────────────────────────

async def _handle_nl_command(chat_id: str, text: str, user_id: str,
                              access_token: str, refresh_token: str | None,
                              user_timezone: str = "UTC"):
    """
    Parse and execute a natural language command via the AI engine.
    Gmail Send → multi-step compose flow.
    Everything else → execute immediately and return formatted result.
    """
    from ai_engine import parse_command_intent
    from command_executor import execute_command

    status_msg = await send_message(chat_id, "⏳ Processing…")
    status_message_id = (status_msg or {}).get("message_id") if status_msg else None

    try:
        intent = await parse_command_intent(text, user_timezone=user_timezone)
    except Exception:
        logger.exception("[Telegram] Intent parsing failed for chat_id=%s", chat_id)
        if status_message_id:
            await edit_message_text(chat_id, status_message_id, "⚠️ AI service unavailable. Please try again.")
        else:
            await send_message(chat_id, "⚠️ AI service unavailable. Please try again.")
        return

    if not isinstance(intent, dict) or "service" not in intent:
        if status_message_id:
            await edit_message_text(chat_id, status_message_id, "🤔 I couldn't understand that. Try /help for examples.")
        else:
            await send_message(chat_id, "🤔 I couldn't understand that. Try /help for examples.")
        return

    # Apply rule-based overrides — action verb takes highest priority over AI
    # e.g. "download CV from drive" → Drive/search, NOT Gmail/send
    intent = _apply_intent_overrides(text, intent)

    service = (intent.get("service") or "").lower()
    action  = (intent.get("action")  or "").lower()

    # Handle unsupported commands — show GPT's helpful response, skip service picker
    if service == "unsupported":
        _sessions.pop(chat_id, None)
        msg = intent.get("response_message") or (
            "I'm not sure how to help with that using Google Workspace. "
            "Try searching your emails, calendar, or Drive files."
        )
        if status_message_id:
            await edit_message_text(chat_id, status_message_id, msg)
        else:
            await send_message(chat_id, msg)
        return

    # Validate service — catch "other" or unrecognized
    if service not in SUPPORTED_SERVICES:
        # Try rule-based detection before asking user to pick
        sniffed = _sniff_service(text)
        if sniffed:
            intent["service"] = sniffed
            service = sniffed
            # Fall through to intent confirmation below
        else:
            _conv[chat_id] = {
                "state":            "wait_service_pick",
                "intent":           intent,
                "user_id":          user_id,
                "original_command": text,
                "access_token":     access_token,
                "refresh_token":    refresh_token,
            }
            pick_text = (
                "🤔 I didn't catch which service you mean.\n"
                "Please choose one:"
            )
            if status_message_id:
                await edit_message_text(chat_id, status_message_id, pick_text, reply_markup=_SERVICE_KB)
            else:
                msg = await send_message(chat_id, pick_text, reply_markup=_SERVICE_KB)
                if msg:
                    _conv[chat_id]["status_message_id"] = msg.get("message_id")
            return

    # Execute directly — no confirmation step (email/event preview is the only confirmation needed)
    if status_message_id:
        await edit_message_text(chat_id, status_message_id, "⏳ Processing…")
    await _route_intent(chat_id, intent, user_id, access_token, refresh_token, text, user_timezone)


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
@limiter.limit("120/minute")
async def telegram_webhook(request: Request):
    """Receive and route Telegram Bot API updates."""
    # Verify the secret token Telegram sends in X-Telegram-Bot-Api-Secret-Token
    webhook_secret = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
    if webhook_secret:
        incoming = request.headers.get("X-Telegram-Bot-Api-Secret-Token", "")
        if not secrets.compare_digest(incoming, webhook_secret):
            return JSONResponse({"ok": False}, status_code=403)

    try:
        body = await request.json()
    except Exception:
        return JSONResponse({"ok": True})

    # ── Callback query (inline button press) ─────────────────────────────────
    if "callback_query" in body:
        cq          = body["callback_query"]
        cq_id       = cq.get("id", "")
        cq_data     = cq.get("data", "")
        cq_message  = cq.get("message") or {}
        chat_id     = str(cq_message.get("chat", {}).get("id", ""))
        message_id  = cq_message.get("message_id")

        await answer_callback_query(cq_id)

        if not chat_id:
            return JSONResponse({"ok": True})

        # Look up user
        supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(
                f"{supabase_url}/rest/v1/telegram_connections"
                f"?chat_id=eq.{chat_id}&verified_at=not.is.null&select=user_id",
                headers=_sb_headers(),
            )
            rows = resp.json() if resp.status_code == 200 else []

        if not rows:
            return JSONResponse({"ok": True})

        user_id       = rows[0]["user_id"]
        profile       = await _get_profile(user_id)
        access_token  = (profile or {}).get("google_access_token")
        refresh_token = (profile or {}).get("google_refresh_token")
        user_timezone = (profile or {}).get("timezone") or "UTC"

        # Silently drop callbacks from free/expired users (no spam)
        if not _is_pro_plan((profile or {}).get("plan") or "free"):
            return JSONResponse({"ok": True})

        conv = _conv.get(chat_id, {})
        intent  = conv.get("intent", {})
        params  = intent.setdefault("parameters", {}) if intent else {}
        orig_cmd = conv.get("original_command", "")

        # ── email: send / edit / cancel ───────────────────────────────────────
        if cq_data == "email:send":
            _conv.pop(chat_id, None)
            await _clear_kb(chat_id, message_id)
            await _execute_email_send(chat_id, intent, access_token, refresh_token, user_id)

        elif cq_data == "email:edit":
            _conv[chat_id] = {**conv, "state": "wait_edit_field"}
            await _clear_kb(chat_id, message_id)
            await send_message(chat_id,
                               "✏️ <b>What would you like to change?</b>",
                               reply_markup=_EDIT_FIELD_KB)

        elif cq_data == "email:cancel":
            _conv.pop(chat_id, None)
            _sessions.pop(chat_id, None)
            await _clear_kb(chat_id, message_id)
            await send_message(chat_id, "❌ Cancelled.")

        # ── drive:skip — send without Drive attachment ─────────────────────────
        elif cq_data == "drive:skip":
            # Remove drive_file from params so execute_command won't try to attach
            intent_skip = conv.get("intent", intent)
            (intent_skip.get("parameters") or {}).pop("drive_file", None)
            (intent_skip.get("parameters") or {}).pop("_drive_file_id", None)
            (intent_skip.get("parameters") or {}).pop("_drive_file_name", None)
            (intent_skip.get("parameters") or {}).pop("_drive_file_resolved", None)
            _conv.pop(chat_id, None)
            await _clear_kb(chat_id, message_id)
            await _execute_email_send(chat_id, intent_skip, access_token, refresh_token, user_id)

        # ── cal_delete: confirm / cancel ──────────────────────────────────────────
        elif cq_data == "cal_delete:confirm":
            stored_conv = _conv.pop(chat_id, {})
            events      = stored_conv.get("events", [])
            stored_tz   = stored_conv.get("user_timezone", user_timezone)
            await _clear_kb(chat_id, message_id)
            if not events:
                await send_message(chat_id, "No events to delete.")
                return JSONResponse({"ok": True})
            await send_message(chat_id, "🗑 Deleting events…")
            try:
                from command_executor import _build_creds, _calendar_service
                loop   = asyncio.get_event_loop()
                creds  = await loop.run_in_executor(
                    None, functools.partial(_build_creds, access_token, refresh_token)
                )
                svc    = _calendar_service(creds)
                deleted = 0
                for e in events:
                    try:
                        await loop.run_in_executor(
                            None,
                            lambda eid=e["id"]: svc.events().delete(calendarId="primary", eventId=eid).execute()
                        )
                        deleted += 1
                    except Exception:
                        pass
                _sessions.pop(chat_id, None)
                await send_message(chat_id, f"✅ Deleted <b>{deleted}</b> event{'s' if deleted != 1 else ''}.")
            except Exception as ex:
                _sessions.pop(chat_id, None)
                await send_message(chat_id, f"❌ Delete failed: {str(ex)[:200]}")

        elif cq_data == "cal_delete:cancel":
            _conv.pop(chat_id, None)
            _sessions.pop(chat_id, None)
            await _clear_kb(chat_id, message_id)
            await send_message(chat_id, "👋 Cancelled. No events were deleted.")

        # ── drive_file:N — user picks Drive file from disambiguation ──────────
        elif cq_data.startswith("drive_file:"):
            suffix = cq_data.split(":", 1)[1]
            if suffix.isdigit():
                drive_cands = conv.get("drive_candidates", [])
                idx = int(suffix)
                if 0 <= idx < len(drive_cands):
                    chosen_file   = drive_cands[idx]
                    after_pick    = conv.get("after_pick", "execute")
                    orig_cmd_df   = conv.get("original_command", "")
                    intent_df     = conv.get("intent", intent)
                    p_df          = intent_df.setdefault("parameters", {})
                    p_df["_drive_file_id"]       = chosen_file["id"]
                    p_df["_drive_file_name"]      = chosen_file["name"]
                    p_df["_drive_file_resolved"]  = True
                    _conv.pop(chat_id, None)
                    await _clear_kb(chat_id, message_id)
                    if after_pick == "generate_preview":
                        # File was picked during compose flow — generate email and show preview
                        status_msg2 = await send_message(chat_id, "📧 Preparing email…")
                        await _generate_and_preview(chat_id, intent_df, user_id, orig_cmd_df,
                                                     status_message_id=(status_msg2 or {}).get("message_id"))
                    else:
                        # File was picked during execution — execute directly
                        await _execute_email_send(chat_id, intent_df, access_token, refresh_token, user_id)

        elif cq_data == "email:edit_subject":
            _conv[chat_id] = {**conv, "state": "wait_edit_method", "edit_field": "subject"}
            await _clear_kb(chat_id, message_id)
            await send_message(chat_id,
                               "✏️ <b>How would you like to edit the subject?</b>",
                               reply_markup=_EDIT_METHOD_KB)

        elif cq_data == "email:edit_body":
            _conv[chat_id] = {**conv, "state": "wait_edit_method", "edit_field": "body"}
            await _clear_kb(chat_id, message_id)
            await send_message(chat_id,
                               "✏️ <b>How would you like to edit the body?</b>",
                               reply_markup=_EDIT_METHOD_KB)

        # ── recipient_confirm: yes / cancel ───────────────────────────────────
        elif cq_data == "recipient_confirm:yes":
            _conv.pop(chat_id, None)
            await _clear_kb(chat_id, message_id)
            status_msg = await send_message(chat_id, "📧 Preparing email…")
            status_msg_id = (status_msg or {}).get("message_id")
            await _generate_and_preview(chat_id, intent, user_id, orig_cmd,
                                         status_message_id=status_msg_id)

        elif cq_data == "recipient_confirm:cancel":
            _conv.pop(chat_id, None)
            _sessions.pop(chat_id, None)
            await _clear_kb(chat_id, message_id)
            await send_message(chat_id, "❌ Cancelled.")

        # ── recipient pick (inline button index) ─────────────────────────────
        elif cq_data.startswith("recipient:"):
            suffix = cq_data.split(":", 1)[1]
            if suffix == "cancel":
                _conv.pop(chat_id, None)
                _sessions.pop(chat_id, None)
                await _clear_kb(chat_id, message_id)
                await send_message(chat_id, "❌ Cancelled.")
            elif suffix.isdigit():
                candidates = conv.get("candidates", [])
                idx = int(suffix)
                if 0 <= idx < len(candidates):
                    chosen = candidates[idx]
                    params["to"] = chosen["email"]
                    params["_to_name"] = chosen.get("display_name", "")
                    _conv.pop(chat_id, None)
                    await _clear_kb(chat_id, message_id)
                    status_msg = await send_message(chat_id, "📧 Preparing email…")
                    status_msg_id = (status_msg or {}).get("message_id")
                    await _generate_and_preview(chat_id, intent, user_id, orig_cmd,
                                                 status_message_id=status_msg_id)

        # ── service pick ─────────────────────────────────────────────────────
        elif cq_data.startswith("service:"):
            chosen_service = cq_data.split(":", 1)[1]
            intent["service"] = chosen_service
            stored_access  = conv.get("access_token",  access_token)
            stored_refresh = conv.get("refresh_token", refresh_token)
            orig_cmd_svc   = conv.get("original_command", "")
            _conv.pop(chat_id, None)

            # Lock session for the chosen service
            _sessions[chat_id] = {
                "task":    _detect_task(chosen_service, (intent.get("action") or "")),
                "service": chosen_service,
            }

            action = (intent.get("action") or "").lower()
            # Inject user timezone for calendar commands
            intent.setdefault("parameters", {})["_timezone"] = user_timezone
            await _clear_kb(chat_id, message_id)
            if chosen_service == "gmail" and action in ("send", "reply"):
                status_msg = await send_message(chat_id, "📧 Preparing email…")
                status_msg_id = (status_msg or {}).get("message_id")
                await _advance_email_send(chat_id, intent, user_id, orig_cmd_svc,
                                           status_message_id=status_msg_id)
            else:
                status_msg = await send_message(chat_id, "⏳ Processing…")
                status_msg_id = (status_msg or {}).get("message_id")
                from command_executor import execute_command
                try:
                    loop   = asyncio.get_event_loop()
                    result = await loop.run_in_executor(
                        None,
                        functools.partial(execute_command, intent, stored_access, stored_refresh, None, user_timezone),
                    )
                    _sessions.pop(chat_id, None)
                    await _send_long(chat_id, _format_nl_result(result, user_timezone))
                except Exception as e:
                    _sessions.pop(chat_id, None)
                    await send_message(chat_id, "❌ Command failed. Please try again.")

        # ── flow: continue / cancel (off-topic warning response) ─────────────
        elif cq_data == "flow:continue":
            await _clear_kb(chat_id, message_id)
            current_conv   = _conv.get(chat_id, {})
            current_state  = current_conv.get("state", "")
            current_intent = current_conv.get("intent", {})
            current_user   = current_conv.get("user_id", user_id)
            if current_state == "wait_confirm":
                await _show_email_preview(chat_id, current_intent, current_user)
            elif current_state == "wait_edit_field":
                await send_message(chat_id, "✏️ <b>What would you like to change?</b>",
                                   reply_markup=_EDIT_FIELD_KB)
            else:
                await send_message(chat_id, "You're still in the middle of a task. Type /cancel to start over.")

        elif cq_data == "flow:cancel":
            _conv.pop(chat_id, None)
            _sessions.pop(chat_id, None)
            await _clear_kb(chat_id, message_id)
            await send_message(chat_id, "❌ Cancelled. Start a new request anytime.")

        # ── edit_method: ai / replace ─────────────────────────────────────────
        elif cq_data == "edit_method:ai":
            field = conv.get("edit_field", "body")
            _conv[chat_id] = {**conv, "state": "wait_ai_instruction"}
            await _clear_kb(chat_id, message_id)
            await send_message(chat_id,
                               f"🤖 Describe how you'd like to change the <b>{field}</b>:\n"
                               "<i>e.g. make it more formal, shorter, more rude, add a deadline</i>")

        elif cq_data == "edit_method:replace":
            field = conv.get("edit_field", "body")
            _conv[chat_id] = {**conv, "state": "wait_edit"}
            await _clear_kb(chat_id, message_id)
            await send_message(chat_id,
                               f"✍️ Type your new <b>{field}</b> and it will replace the current one:")

        # ── ai_edit: accept / retry ───────────────────────────────────────────
        elif cq_data == "ai_edit:accept":
            field     = conv.get("edit_field", "body")
            ai_result = conv.get("ai_result", "")
            if ai_result:
                params[field] = ai_result
            intent_to_show  = conv.get("intent", intent)
            user_id_to_show = conv.get("user_id", user_id)
            _conv.pop(chat_id, None)
            await _clear_kb(chat_id, message_id)
            await _show_email_preview(chat_id, intent_to_show, user_id_to_show)

        elif cq_data == "ai_edit:retry":
            field = conv.get("edit_field", "body")
            _conv[chat_id] = {**conv, "state": "wait_ai_instruction"}
            await _clear_kb(chat_id, message_id)
            await send_message(chat_id,
                               f"🔄 Give me a different instruction for the <b>{field}</b>:\n"
                               "<i>e.g. make it shorter, more professional, add urgency</i>")

        return JSONResponse({"ok": True})

    # ── Regular message ───────────────────────────────────────────────────────
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
            f"?verification_code=eq.{code}&verified_at=is.null&select=user_id,updated_at"
        )
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.get(url, headers=_sb_headers())
            rows = resp.json() if resp.status_code == 200 else []
        if not rows:
            await send_message(chat_id, "❌ Invalid or expired code. Generate a fresh one from your dashboard.")
            return JSONResponse({"ok": True})
        # Enforce 15-minute TTL on verification codes
        updated_at_str = rows[0].get("updated_at") or ""
        if updated_at_str:
            try:
                from datetime import timedelta
                issued_at = datetime.fromisoformat(updated_at_str.replace("Z", "+00:00"))
                if datetime.now(tz.utc) - issued_at > timedelta(minutes=15):
                    await send_message(chat_id, "❌ This code has expired. Generate a fresh one from your dashboard.")
                    return JSONResponse({"ok": True})
            except Exception:
                pass  # If parsing fails, allow the code through
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
    user_timezone = (profile or {}).get("timezone") or "UTC"

    # ── /cancel — clear any active conversation state ────────────────────────
    if command == "cancel":
        _conv.pop(chat_id, None)
        _sessions.pop(chat_id, None)
        await send_message(chat_id, "❌ Cancelled.")
        return JSONResponse({"ok": True})

    # ── Plan gate — block free/expired users from all Telegram features ───────
    user_plan = (profile or {}).get("plan") or "free"
    if not _is_pro_plan(user_plan):
        # /status is the one exception: always allowed on any plan
        if command == "status":
            await send_message(
                chat_id,
                "📊 <b>Your account</b>\n\n"
                "Plan: Free\n"
                "Telegram: Requires Pro plan\n\n"
                "👉 Upgrade: https://workspace-flow.vercel.app",
            )
            return JSONResponse({"ok": True})
        # All other messages/commands: warn once per hour, then stay silent
        now = datetime.now(tz.utc)
        last_warned = _plan_warning_sent.get(chat_id)
        if last_warned is None or (now - last_warned).total_seconds() > 3600:
            _plan_warning_sent[chat_id] = now
            await send_message(
                chat_id,
                "⚠️ Your Pro trial has ended.\n\n"
                "To continue using WorkspaceFlow on Telegram, upgrade to Pro:\n"
                "👉 https://workspace-flow.vercel.app/dashboard/settings\n\n"
                "Your account is still active — upgrade anytime to resume.",
            )
        return JSONResponse({"ok": True})

    # ── Conversation state machine (non-slash replies) ────────────────────────
    # Every step handles free text first — buttons are shortcuts, not walls.
    if not is_command and chat_id in _conv:
        state   = _conv[chat_id]["state"]
        intent  = _conv[chat_id]["intent"]
        params  = intent.setdefault("parameters", {})
        answer  = text.strip()
        upper   = answer.upper()

        # ── wait_service_pick ─────────────────────────────────────────────────
        if state == "wait_service_pick":
            if _is_cancel_text(answer):
                _conv.pop(chat_id, None)
                _sessions.pop(chat_id, None)
                await send_message(chat_id, "👋 Okay, cancelled!")
                return JSONResponse({"ok": True})
            sniffed        = _sniff_service(answer)
            stored_access  = _conv[chat_id].get("access_token",  access_token)
            stored_refresh = _conv[chat_id].get("refresh_token", refresh_token)
            stored_user_id = _conv[chat_id].get("user_id", user_id)
            orig_cmd       = _conv[chat_id].get("original_command", "")
            if sniffed:
                intent["service"] = sniffed
                _conv.pop(chat_id, None)
                await _route_intent(chat_id, intent, stored_user_id,
                                    stored_access, stored_refresh, orig_cmd, user_timezone)
            else:
                await send_message(chat_id,
                                   "I didn't quite get that. Please pick a service: 👇",
                                   reply_markup=_SERVICE_KB)
            return JSONResponse({"ok": True})

        # ── wait_recipient_confirm ────────────────────────────────────────────
        if state == "wait_recipient_confirm":
            orig_cmd = _conv[chat_id].get("original_command", "")
            if _is_cancel_text(answer) or upper in ("NO", "N"):
                _conv.pop(chat_id, None)
                _sessions.pop(chat_id, None)
                await send_message(chat_id, "👋 Okay, cancelled!")
            elif _is_confirm_text(answer) or upper in ("YES", "Y", "OK", "YEP", "SURE"):
                _conv.pop(chat_id, None)
                status_msg = await send_message(chat_id, "📧 Preparing email…")
                await _generate_and_preview(chat_id, intent, user_id, orig_cmd,
                                             status_message_id=(status_msg or {}).get("message_id"))
            else:
                kb = InlineKeyboardMarkup([[
                    InlineKeyboardButton("✅ Yes",    callback_data="recipient_confirm:yes"),
                    InlineKeyboardButton("❌ Cancel", callback_data="recipient_confirm:cancel"),
                ]])
                await send_message(chat_id,
                                   "I didn't quite get that. Is this the correct recipient? 👇",
                                   reply_markup=kb)
            return JSONResponse({"ok": True})

        # ── wait_recipient_pick ───────────────────────────────────────────────
        if state == "wait_recipient_pick":
            candidates = _conv[chat_id].get("candidates", [])
            orig_cmd   = _conv[chat_id].get("original_command", "")
            if _is_cancel_text(answer) or upper in ("NO", "N", "CANCEL"):
                _conv.pop(chat_id, None)
                _sessions.pop(chat_id, None)
                await send_message(chat_id, "👋 Okay, cancelled!")
            elif answer.isdigit() and 1 <= int(answer) <= len(candidates):
                chosen = candidates[int(answer) - 1]
                params["to"]      = chosen["email"]
                params["_to_name"] = chosen.get("display_name", "")
                _conv.pop(chat_id, None)
                status_msg = await send_message(chat_id, "📧 Preparing email…")
                await _generate_and_preview(chat_id, intent, user_id, orig_cmd,
                                             status_message_id=(status_msg or {}).get("message_id"))
            else:
                await send_message(chat_id,
                                   "I didn't quite get that. Please choose a recipient: 👇",
                                   reply_markup=_recipient_kb(candidates))
            return JSONResponse({"ok": True})

        # ── wait_confirm ──────────────────────────────────────────────────────
        if state == "wait_confirm":
            if _is_cancel_text(answer):
                _conv.pop(chat_id, None)
                _sessions.pop(chat_id, None)
                await send_message(chat_id, "👋 Okay, cancelled!")
            elif _is_confirm_text(answer) or upper in ("SEND", "CONFIRM"):
                _conv.pop(chat_id, None)
                await _execute_email_send(chat_id, intent, access_token, refresh_token, user_id)
            elif "edit" in answer.lower() or upper == "EDIT":
                _conv[chat_id] = {**_conv[chat_id], "state": "wait_edit_field"}
                await send_message(chat_id, "✏️ <b>What would you like to change?</b>",
                                   reply_markup=_EDIT_FIELD_KB)
            else:
                # Off-topic detection: if text mentions a different service, warn
                sniffed = _sniff_service(answer)
                session = _sessions.get(chat_id, {})
                if sniffed and sniffed != session.get("service", sniffed):
                    await send_message(chat_id, _session_warning(chat_id),
                                       reply_markup=_CONTINUE_CANCEL_KB)
                else:
                    await send_message(chat_id,
                                       "I didn't quite get that. Please choose an option below 👇",
                                       reply_markup=_CONFIRM_KB)
            return JSONResponse({"ok": True})

        # ── wait_edit_field ───────────────────────────────────────────────────
        if state == "wait_edit_field":
            if _is_cancel_text(answer):
                _conv.pop(chat_id, None)
                _sessions.pop(chat_id, None)
                await send_message(chat_id, "👋 Okay, cancelled!")
            elif "subject" in answer.lower():
                _conv[chat_id] = {**_conv[chat_id], "state": "wait_edit_method",
                                  "edit_field": "subject"}
                await send_message(chat_id,
                                   "✏️ <b>How would you like to edit the subject?</b>",
                                   reply_markup=_EDIT_METHOD_KB)
            elif "body" in answer.lower():
                _conv[chat_id] = {**_conv[chat_id], "state": "wait_edit_method",
                                  "edit_field": "body"}
                await send_message(chat_id,
                                   "✏️ <b>How would you like to edit the body?</b>",
                                   reply_markup=_EDIT_METHOD_KB)
            else:
                await send_message(chat_id,
                                   "I didn't quite get that. Please choose an option below 👇",
                                   reply_markup=_EDIT_FIELD_KB)
            return JSONResponse({"ok": True})

        # ── wait_edit ─────────────────────────────────────────────────────────
        if state == "wait_edit":
            if _is_cancel_text(answer):
                _conv.pop(chat_id, None)
                _sessions.pop(chat_id, None)
                await send_message(chat_id, "👋 Okay, cancelled!")
                return JSONResponse({"ok": True})
            edit_field = _conv[chat_id].get("edit_field")
            if edit_field == "subject":
                params["subject"] = answer
            elif edit_field == "body":
                params["body"] = answer
            else:
                # Legacy: parse SUBJECT:/BODY: keywords
                subject_match = re.search(r'(?im)^SUBJECT:\s*(.+?)(?=\nBODY:|$)', answer, re.DOTALL)
                body_match    = re.search(r'(?im)^BODY:\s*(.+)', answer, re.DOTALL)
                if subject_match:
                    params["subject"] = subject_match.group(1).strip()
                if body_match:
                    params["body"] = body_match.group(1).strip()
                if not subject_match and not body_match:
                    params["body"] = answer
            _conv.pop(chat_id, None)
            await _show_email_preview(chat_id, intent, user_id)
            return JSONResponse({"ok": True})

        # ── wait_edit_method ──────────────────────────────────────────────────
        if state == "wait_edit_method":
            field = _conv[chat_id].get("edit_field", "body")
            if _is_cancel_text(answer):
                _conv.pop(chat_id, None)
                _sessions.pop(chat_id, None)
                await send_message(chat_id, "👋 Okay, cancelled!")
            elif any(w in answer.lower() for w in ("ai", "modify", "smart", "rewrite", "auto")):
                _conv[chat_id] = {**_conv[chat_id], "state": "wait_ai_instruction"}
                await send_message(chat_id,
                                   f"🤖 Describe how you'd like to change the <b>{field}</b>:\n"
                                   "<i>e.g. make it more formal, shorter, more rude, add a deadline</i>")
            elif any(w in answer.lower() for w in ("replace", "type", "direct", "manual", "new", "write")):
                _conv[chat_id] = {**_conv[chat_id], "state": "wait_edit"}
                await send_message(chat_id, f"✍️ Type your new <b>{field}</b>:")
            else:
                await send_message(chat_id,
                                   f"I didn't quite get that. How would you like to edit the "
                                   f"<b>{field}</b>? 👇",
                                   reply_markup=_EDIT_METHOD_KB)
            return JSONResponse({"ok": True})

        # ── wait_ai_instruction ───────────────────────────────────────────────
        if state == "wait_ai_instruction":
            if _is_cancel_text(answer):
                _conv.pop(chat_id, None)
                _sessions.pop(chat_id, None)
                await send_message(chat_id, "👋 Okay, cancelled!")
                return JSONResponse({"ok": True})
            edit_field  = _conv[chat_id].get("edit_field", "body")
            current_val = (params.get("subject", "")
                           if edit_field == "subject" else _get_body(params))
            await send_message(chat_id, "🤖 Rewriting with AI…")
            from ai_engine import rewrite_email_field
            new_val    = await rewrite_email_field(edit_field, current_val, answer)
            ai_preview = new_val[:300] + ("…" if len(new_val) > 300 else "")
            _conv[chat_id] = {**_conv[chat_id], "state": "wait_ai_approve", "ai_result": new_val}
            await send_message(chat_id,
                               f"🤖 <b>AI suggestion for {edit_field}:</b>\n\n{ai_preview}",
                               reply_markup=_AI_RESULT_KB)
            return JSONResponse({"ok": True})

        # ── wait_drive_pick ───────────────────────────────────────────────────
        if state == "wait_drive_pick":
            drive_cands = _conv[chat_id].get("drive_candidates", [])
            if _is_cancel_text(answer):
                _conv.pop(chat_id, None)
                _sessions.pop(chat_id, None)
                await send_message(chat_id, "👋 Okay, cancelled!")
            elif answer.isdigit() and 1 <= int(answer) <= len(drive_cands):
                chosen      = drive_cands[int(answer) - 1]
                after_pick  = _conv[chat_id].get("after_pick", "execute")
                orig_cmd_dp = _conv[chat_id].get("original_command", "")
                params["_drive_file_id"]       = chosen["id"]
                params["_drive_file_name"]     = chosen["name"]
                params["_drive_file_resolved"] = True
                _conv.pop(chat_id, None)
                if after_pick == "generate_preview":
                    status_dp = await send_message(chat_id, "📧 Preparing email…")
                    await _generate_and_preview(chat_id, intent, user_id, orig_cmd_dp,
                                                 status_message_id=(status_dp or {}).get("message_id"))
                else:
                    profile_dw = await _get_profile(user_id)
                    at_dw  = (profile_dw or {}).get("google_access_token") or access_token
                    ar_dw  = (profile_dw or {}).get("google_refresh_token") or refresh_token
                    await _execute_email_send(chat_id, intent, at_dw, ar_dw, user_id)
            else:
                kb_rows = []
                for i, f in enumerate(drive_cands):
                    kb_rows.append([InlineKeyboardButton(
                        f"📄 {f.get('name', 'File')}", callback_data=f"drive_file:{i}"
                    )])
                kb_rows.append([InlineKeyboardButton("❌ Cancel", callback_data="email:cancel")])
                await send_message(chat_id,
                                   "Please pick a number or tap a button to choose the file:",
                                   reply_markup=InlineKeyboardMarkup(kb_rows))
            return JSONResponse({"ok": True})

        # ── wait_delete_confirm ───────────────────────────────────────────────
        if state == "wait_delete_confirm":
            events       = _conv[chat_id].get("events", [])
            stored_tz    = _conv[chat_id].get("user_timezone", user_timezone)
            if _is_cancel_text(answer) or upper in ("NO", "N"):
                _conv.pop(chat_id, None)
                _sessions.pop(chat_id, None)
                await send_message(chat_id, "👋 Okay, cancelled! No events were deleted.")
            elif _is_confirm_text(answer) or upper in ("YES", "Y", "DELETE", "DELETE ALL"):
                _conv.pop(chat_id, None)
                params  = intent.get("parameters", {})
                from command_executor import _build_creds, _calendar_service
                await send_message(chat_id, "🗑 Deleting events…")
                try:
                    loop   = asyncio.get_event_loop()
                    creds  = await loop.run_in_executor(
                        None, functools.partial(_build_creds, access_token, refresh_token)
                    )
                    svc    = _calendar_service(creds)
                    deleted = 0
                    for e in events:
                        try:
                            await loop.run_in_executor(
                                None,
                                lambda eid=e["id"]: svc.events().delete(calendarId="primary", eventId=eid).execute()
                            )
                            deleted += 1
                        except Exception:
                            pass
                    _sessions.pop(chat_id, None)
                    await send_message(chat_id, f"✅ Deleted <b>{deleted}</b> event{'s' if deleted != 1 else ''}.")
                except Exception as ex:
                    _sessions.pop(chat_id, None)
                    await send_message(chat_id, f"❌ Delete failed: {str(ex)[:200]}")
            else:
                del_kb = InlineKeyboardMarkup([[
                    InlineKeyboardButton("🗑 Yes, Delete All", callback_data="cal_delete:confirm"),
                    InlineKeyboardButton("❌ No, Cancel",      callback_data="cal_delete:cancel"),
                ]])
                await send_message(chat_id, "Please reply YES to delete or NO to cancel:", reply_markup=del_kb)
            return JSONResponse({"ok": True})

        # ── wait_ai_approve ───────────────────────────────────────────────────
        if state == "wait_ai_approve":
            edit_field = _conv[chat_id].get("edit_field", "body")
            ai_result  = _conv[chat_id].get("ai_result", "")
            if _is_cancel_text(answer):
                _conv.pop(chat_id, None)
                _sessions.pop(chat_id, None)
                await send_message(chat_id, "👋 Okay, cancelled!")
            elif (_is_confirm_text(answer)
                  or any(w in answer.lower() for w in ("use", "good", "this one", "accept", "apply"))):
                params[edit_field] = ai_result
                _conv.pop(chat_id, None)
                await _show_email_preview(chat_id, intent, user_id)
            elif any(w in answer.lower() for w in ("retry", "again", "different", "try again", "no")):
                _conv[chat_id] = {**_conv[chat_id], "state": "wait_ai_instruction"}
                await send_message(chat_id,
                                   f"🔄 Give me a different instruction for the <b>{edit_field}</b>:\n"
                                   "<i>e.g. make it shorter, more professional, add urgency</i>")
            else:
                ai_preview = ai_result[:300] + ("…" if len(ai_result) > 300 else "")
                await send_message(chat_id,
                                   f"I didn't quite get that. Use this version? 👇\n\n"
                                   f"<i>{ai_preview}</i>",
                                   reply_markup=_AI_RESULT_KB)
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
        google_ok  = bool(access_token)
        plan_label = user_plan.replace("_", " ").title()
        await send_message(
            chat_id,
            "<b>⚙️ Account Status</b>\n\n"
            f"Plan: {plan_label}\n"
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
            await _send_long(chat_id, format_briefing_telegram(briefing, raw_data))
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
