"""
Telegram API routes.

Endpoints:
    POST /api/telegram/connect     — generate verification code (Pro/Team only)
    POST /api/telegram/disconnect  — unlink account
    GET  /api/telegram/status      — connection status
    POST /api/telegram/webhook     — receive updates from Telegram Bot API
    POST /api/telegram/test        — send test message to connected chat
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


async def _require_pro(request: Request):
    """Authenticate and enforce Pro/Team plan. Returns (user, profile)."""
    user    = await _require_auth(request)
    profile = await _get_profile(user["id"])
    if not profile:
        raise HTTPException(status_code=404, detail="User profile not found")
    plan = (profile.get("plan") or "free").lower()
    if plan not in ("pro", "team"):
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


# ── Routes ──────────────────────────────────────────────────────────────────

@router.post("/connect")
async def telegram_connect(request: Request):
    """
    Generate a 6-digit verification code.
    The user must then open Telegram and send: /verify CODE
    """
    user, _ = await _require_pro(request)
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
    user, _ = await _require_pro(request)
    await _delete_connection(user["id"])
    return {"success": True}


@router.get("/status")
async def telegram_status(request: Request):
    """Return the Telegram connection status for the authenticated user."""
    user, _ = await _require_pro(request)
    conn    = await _get_connection(user["id"])

    if not conn:
        return {"connected": False, "pending": False, "username": None}
    if conn.get("verified_at"):
        return {"connected": True, "pending": False, "username": conn.get("username")}
    # Code generated but not yet verified
    return {"connected": False, "pending": True, "username": None}


@router.post("/test")
async def telegram_test(request: Request):
    """Send a test message to the verified Telegram connection."""
    user, _ = await _require_pro(request)
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
    """
    Receive JSON updates from the Telegram Bot API.
    Register this URL via:
        https://api.telegram.org/bot{TOKEN}/setWebhook?url=https://your-app.fly.dev/api/telegram/webhook
    """
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

    # Strip leading slash, bot suffix (e.g. /help@MyBot → help)
    raw_cmd = text.split()[0].lstrip("/").lower()
    command = raw_cmd.split("@")[0]

    # ── /start ─────────────────────────────────────────────────────────────
    if command == "start":
        await send_message(
            chat_id,
            "👋 <b>Welcome to WorkspaceFlow!</b>\n\n"
            "To connect your account:\n"
            "1. Open your WorkspaceFlow dashboard\n"
            "2. Click <b>Connect Telegram</b>\n"
            "3. Send the code shown: <code>/verify YOUR_CODE</code>",
        )
        return JSONResponse({"ok": True})

    # ── /verify CODE ───────────────────────────────────────────────────────
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
                "❌ Invalid or expired verification code.\n\n"
                "Generate a fresh code from the WorkspaceFlow dashboard.",
            )
            return JSONResponse({"ok": True})

        user_id = rows[0]["user_id"]
        now_iso = datetime.now(tz.utc).isoformat()
        await _set_connection(user_id, {
            "chat_id":           chat_id,
            "username":          username,
            "verified_at":       now_iso,
            "verification_code": None,    # consume the code
        })
        await send_message(
            chat_id,
            f"✅ <b>Connected!</b> Hi {username}!\n\n"
            "Your daily briefing will arrive here at your configured time.\n\n"
            "/briefing — full morning briefing\n"
            "/summary — inbox summary\n"
            "/tasks — priority items\n"
            "/help — all commands",
        )
        return JSONResponse({"ok": True})

    # ── All other commands — look up user by chat_id ───────────────────────
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    url = (
        f"{supabase_url}/rest/v1/telegram_connections"
        f"?chat_id=eq.{chat_id}"
        f"&verified_at=not.is.null"
        f"&select=user_id"
    )
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(url, headers=_sb_headers())
        rows = resp.json() if resp.status_code == 200 else []

    if not rows:
        await send_message(
            chat_id,
            "👋 This Telegram account isn't linked to WorkspaceFlow.\n\n"
            "Get a code from your dashboard, then send:\n"
            "<code>/verify YOUR_CODE</code>",
        )
        return JSONResponse({"ok": True})

    user_id  = rows[0]["user_id"]
    profile  = await _get_profile(user_id)
    access_token  = (profile or {}).get("google_access_token")
    refresh_token = (profile or {}).get("google_refresh_token")

    # ── /help ──────────────────────────────────────────────────────────────
    if command == "help":
        await send_message(
            chat_id,
            "<b>📋 WorkspaceFlow Commands</b>\n\n"
            "/briefing — full morning briefing\n"
            "/summary — inbox summary only\n"
            "/tasks — priority items only\n"
            "/status — account &amp; connection info\n"
            "/help — this list",
        )

    # ── /status ────────────────────────────────────────────────────────────
    elif command == "status":
        google_ok = bool(access_token)
        plan      = (profile or {}).get("plan", "free").title()
        await send_message(
            chat_id,
            "<b>⚙️ Account Status</b>\n\n"
            f"Plan: {plan}\n"
            f"Google account: {'✅ connected' if google_ok else '❌ not connected'}\n"
            "Telegram: ✅ connected",
        )

    # ── /briefing, /summary, /tasks ────────────────────────────────────────
    elif command in ("briefing", "summary", "tasks"):
        if not access_token:
            await send_message(
                chat_id,
                "⚠️ Your Google account isn't connected.\n"
                "Please reconnect at workspaceflow.io.",
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

            if command == "tasks":
                urgent = (briefing.get("last_24h") or {}).get("urgent_items") or []
                msg    = (
                    "<b>⚡ Priority Items</b>\n\n" + "\n".join(f"• {it}" for it in urgent)
                    if urgent else "✅ No urgent priority items right now."
                )
                await send_message(chat_id, msg)

            elif command == "summary":
                summary = ((briefing.get("last_24h") or {}).get("summary") or "No summary available.").strip()
                await send_message(chat_id, f"<b>📫 Inbox Summary</b>\n\n{summary[:800]}")

            else:  # /briefing — full
                await send_message(chat_id, format_briefing_telegram(briefing))

        except Exception:
            logger.exception("[Telegram] Briefing failed for chat_id=%s", chat_id)
            await send_message(chat_id, "⚠️ Something went wrong. Please try again in a moment.")

    else:
        await send_message(
            chat_id,
            f"Unknown command: <code>{text[:50]}</code>\n\nSend /help for a list of commands.",
        )

    return JSONResponse({"ok": True})
