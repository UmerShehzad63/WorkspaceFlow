"""
Daily morning briefing scheduler — Telegram delivery.

Uses APScheduler to run a job every 5 minutes that checks which users
are due for their briefing (based on their configured time + timezone),
generates the briefing, and sends it via Telegram.

Usage:
    from jobs.scheduler import start_scheduler, stop_scheduler
    start_scheduler()   # call once at FastAPI startup
    stop_scheduler()    # call on shutdown
"""
import asyncio
import functools
import logging
import os
from datetime import datetime, timezone as tz

import httpx
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

logger    = logging.getLogger(__name__)
scheduler = AsyncIOScheduler()

# In-memory set of user_ids that have already received the "plan expired"
# notification. Resets on restart, but that's acceptable — at worst a user
# gets the message once more after a deploy. Prevents spamming it daily.
_expiry_notified: set = set()


# ── Supabase helpers ────────────────────────────────────────────────────────

def _sb_headers() -> dict:
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    return {"Authorization": f"Bearer {key}", "apikey": key}


async def _fetch_telegram_users() -> list:
    """
    Return all verified telegram connections with enough data to send a briefing.
    Two-step: fetch connections, then fetch profiles for Google tokens.
    """
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")

    # Step 1 — get verified telegram connections
    url = (
        f"{supabase_url}/rest/v1/telegram_connections"
        f"?verified_at=not.is.null"
        f"&chat_id=not.is.null"
        f"&select=user_id,chat_id,last_briefing_sent"
    )
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp        = await client.get(url, headers=_sb_headers())
            connections = resp.json() if resp.status_code == 200 else []
    except Exception:
        logger.exception("[Scheduler] Failed to fetch telegram connections")
        return []

    if not connections:
        return []

    # Step 2 — fetch profiles for these users (Google tokens + briefing prefs)
    # Fetch ALL plans — the job itself decides whether to send or notify of expiry.
    user_ids     = [c["user_id"] for c in connections]
    id_list      = ",".join(user_ids)
    profile_url  = (
        f"{supabase_url}/rest/v1/profiles"
        f"?id=in.({id_list})"
        f"&google_access_token=not.is.null"
        f"&select=id,plan,google_access_token,google_refresh_token,briefing_time,timezone"
    )
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp     = await client.get(profile_url, headers=_sb_headers())
            profiles = resp.json() if resp.status_code == 200 else []
    except Exception:
        logger.exception("[Scheduler] Failed to fetch profiles")
        return []

    profile_map = {p["id"]: p for p in profiles}

    # Merge connection + profile data
    results = []
    for conn in connections:
        uid = conn["user_id"]
        if uid in profile_map:
            results.append({**profile_map[uid], **conn})
    return results


async def _mark_briefing_sent(user_id: str):
    supabase_url = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
    key          = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    url          = f"{supabase_url}/rest/v1/telegram_connections?user_id=eq.{user_id}"
    headers      = {
        "Authorization": f"Bearer {key}",
        "apikey":        key,
        "Content-Type":  "application/json",
        "Prefer":        "return=minimal",
    }
    now = datetime.now(tz.utc).isoformat()
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.patch(url, json={"last_briefing_sent": now}, headers=headers)


# ── Time-window check ───────────────────────────────────────────────────────

def _is_due(user: dict, now_utc: datetime) -> bool:
    """
    Return True if the user's briefing_time falls within the current 5-minute
    window and they haven't already received one today in their timezone.
    """
    from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

    user_tz_str = user.get("timezone") or "UTC"
    brief_time  = user.get("briefing_time") or "08:00"
    last_sent   = user.get("last_briefing_sent")

    try:
        local_tz  = ZoneInfo(user_tz_str)
        local_now = now_utc.astimezone(local_tz)
    except ZoneInfoNotFoundError:
        local_now = now_utc.astimezone(ZoneInfo("UTC"))

    try:
        h, m = [int(x) for x in brief_time.split(":")]
    except ValueError:
        return False

    if not (local_now.hour == h and abs(local_now.minute - m) <= 2):
        return False

    if last_sent:
        try:
            last_dt = datetime.fromisoformat(last_sent).astimezone(ZoneInfo(user_tz_str))
            if last_dt.date() == local_now.date():
                return False    # already sent today
        except Exception:
            pass

    return True


# ── Main job ────────────────────────────────────────────────────────────────

async def send_daily_briefings() -> dict:
    """
    Called every 5 minutes by APScheduler, and also by the /api/briefing/send-daily cron endpoint.
    Sends briefings to Pro/Pro Plus users whose configured time is in this window.
    Returns {"sent": N, "skipped": M, "errors": P}.
    """
    now_utc = datetime.now(tz.utc)
    print(f"[Scheduler] Briefing job running at {now_utc.strftime('%H:%M UTC')}")
    users   = await _fetch_telegram_users()

    sent = skipped = errors = 0

    if not users:
        return {"sent": 0, "skipped": 0, "errors": 0}

    from services.telegram import format_briefing_telegram, send_message

    for user in users:
        if not _is_due(user, now_utc):
            skipped += 1
            continue

        user_id = user["user_id"]
        chat_id = user["chat_id"]
        plan    = (user.get("plan") or "free").lower()

        # ── Subscription check (once per day at briefing time) ─────────────
        if plan not in ("pro", "pro_plus", "trialing", "pro_trial", "active"):
            # User had Telegram connected but is no longer on a paid plan.
            # Send ONE expiry notification, then stay silent forever.
            if user_id not in _expiry_notified and user.get("last_briefing_sent"):
                try:
                    await send_message(
                        chat_id,
                        "⚠️ <b>Your Pro subscription has ended.</b>\n\n"
                        "Upgrade to continue receiving daily Telegram briefings:\n"
                        "https://workspace-flow.vercel.app/pricing",
                    )
                    _expiry_notified.add(user_id)
                    logger.info("[Scheduler] Expiry notification sent to user %s", user_id)
                except Exception:
                    logger.exception("[Scheduler] Failed to send expiry notification to user %s", user_id)
            # Either way — skip the briefing
            skipped += 1
            continue

        # ── Active pro/pro_plus user — send briefing ──────────────────────
        # If they re-subscribed, clear any previous expiry notification record
        _expiry_notified.discard(user_id)

        access_token  = user["google_access_token"]
        refresh_token = user.get("google_refresh_token")

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
                logger.error("[Scheduler] Briefing generation failed for user %s", user_id)
                errors += 1
                continue

            print(f"[Scheduler] Sending daily briefing to user {user_id} via Telegram (chat_id={chat_id})")
            await send_message(chat_id, format_briefing_telegram(briefing))
            await _mark_briefing_sent(user_id)
            logger.info("[Scheduler] Briefing sent to user %s (chat_id=%s)", user_id, chat_id)
            print(f"[Scheduler] Daily briefing sent successfully to user {user_id}")
            sent += 1

        except Exception:
            logger.exception("[Scheduler] Failed to send briefing for user %s", user_id)
            errors += 1

    return {"sent": sent, "skipped": skipped, "errors": errors}


# ── Lifecycle ────────────────────────────────────────────────────────────────

async def _keepalive_ping():
    """Ping the backend health endpoint every 10 min to prevent Render free tier from sleeping."""
    backend_url = os.getenv("RENDER_EXTERNAL_URL") or os.getenv("NEXT_PUBLIC_BACKEND_URL") or "http://localhost:8000"
    try:
        async with httpx.AsyncClient(timeout=8.0) as client:
            await client.get(f"{backend_url}/health")
    except Exception:
        pass  # keepalive is best-effort


def start_scheduler():
    """Start the scheduler. Call once at FastAPI startup."""
    scheduler.add_job(
        send_daily_briefings,
        CronTrigger(minute="*/5"),   # fires every 5 min; job checks timing per user
        id="daily_briefings",
        replace_existing=True,
        misfire_grace_time=120,
    )
    scheduler.add_job(
        _keepalive_ping,
        CronTrigger(minute="*/10"),  # every 10 min — prevents Render free tier sleep
        id="keepalive",
        replace_existing=True,
        misfire_grace_time=60,
    )
    scheduler.start()
    job_count = len(scheduler.get_jobs())
    logger.info("[Scheduler] Started — %d job(s) registered, checking every 5 minutes", job_count)
    print(f"[Scheduler] Started — {job_count} job(s) registered, checking every 5 minutes")


def stop_scheduler():
    """Stop the scheduler gracefully. Call at FastAPI shutdown."""
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("[Scheduler] Stopped")
