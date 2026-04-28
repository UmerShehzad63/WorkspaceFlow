"""
gmail_push.py
Gmail push notifications via Google Cloud Pub/Sub.

Setup (one-time in GCP):
  1. Create a Pub/Sub topic, e.g. projects/MY_PROJECT/topics/gmail-push
  2. Grant gmail-api-push@system.gserviceaccount.com the "Pub/Sub Publisher" role on that topic
  3. Create a push subscription pointing to:
       https://workspaceflow-backend.onrender.com/api/gmail/webhook
  4. Set env var  GMAIL_PUBSUB_TOPIC=projects/MY_PROJECT/topics/gmail-push

When a new email arrives in INBOX, Google pushes a Pub/Sub message to the webhook.
The webhook decodes it, fetches the changed messages via history.list(), and runs
every active "on new email" automation for that user immediately — no polling delay.
"""

import asyncio
import base64
import functools
import json
import logging
import os
from datetime import datetime, timezone as tz, timedelta

import httpx

logger = logging.getLogger(__name__)

# ── Supabase helpers ──────────────────────────────────────────────────────────

def _sb_headers() -> dict:
    key = os.getenv("SUPABASE_SERVICE_ROLE_KEY", "")
    return {"Authorization": f"Bearer {key}", "apikey": key}


def _sb_url() -> str:
    return os.getenv("NEXT_PUBLIC_SUPABASE_URL", "")


# ── Watch registration ────────────────────────────────────────────────────────

async def register_gmail_watch(user_id: str, access_token: str,
                                refresh_token: str | None) -> dict:
    """
    Register (or renew) a Gmail push watch for this user.
    Stores the returned historyId and expiration in the profiles table.
    Returns the watch response dict, or {"error": reason} on failure.
    """
    topic_name = os.getenv("GMAIL_PUBSUB_TOPIC")
    if not topic_name:
        return {"error": "GMAIL_PUBSUB_TOPIC not configured — Gmail push disabled"}

    def _watch():
        from command_executor import _build_creds, _gmail_service
        creds = _build_creds(access_token, refresh_token)
        svc   = _gmail_service(creds)
        return svc.users().watch(
            userId="me",
            body={"labelIds": ["INBOX"], "topicName": topic_name},
        ).execute()

    try:
        loop   = asyncio.get_event_loop()
        result = await loop.run_in_executor(None, _watch)
    except Exception as exc:
        logger.exception("[GmailPush] watch() failed for user %s", user_id)
        return {"error": str(exc)}

    history_id = str(result.get("historyId", ""))
    expiry_ms  = int(result.get("expiration", 0))
    expiry_iso = datetime.fromtimestamp(expiry_ms / 1000, tz=tz.utc).isoformat() if expiry_ms else None

    # Persist historyId + expiry so we know where to resume after a push
    patch = {"gmail_history_id": history_id}
    if expiry_iso:
        patch["gmail_watch_expiry"] = expiry_iso

    sb_headers = {**_sb_headers(), "Content-Type": "application/json", "Prefer": "return=minimal"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.patch(
            f"{_sb_url()}/rest/v1/profiles?id=eq.{user_id}",
            json=patch,
            headers=sb_headers,
        )

    logger.info("[GmailPush] Watch registered for user %s, historyId=%s, expires=%s",
                user_id, history_id, expiry_iso)
    return result


async def renew_expiring_watches() -> None:
    """
    Called once per day to renew Gmail watches expiring within 24 hours.
    Registered as a daily APScheduler job in scheduler.py.
    """
    topic_name = os.getenv("GMAIL_PUBSUB_TOPIC")
    if not topic_name:
        return

    cutoff = (datetime.now(tz.utc) + timedelta(hours=24)).isoformat()
    url = (
        f"{_sb_url()}/rest/v1/profiles"
        f"?gmail_watch_expiry=lt.{cutoff}"
        f"&google_access_token=not.is.null"
        f"&select=id,google_access_token,google_refresh_token"
    )
    async with httpx.AsyncClient(timeout=15.0) as client:
        resp     = await client.get(url, headers=_sb_headers())
        profiles = resp.json() if resp.status_code == 200 else []

    for p in profiles:
        await register_gmail_watch(p["id"], p["google_access_token"], p.get("google_refresh_token"))


# ── User lookup by Gmail address ──────────────────────────────────────────────

async def _find_user_id_by_email(gmail_address: str) -> str | None:
    """Return the Supabase user_id for the given Gmail address, or None."""
    # Query auth.users via the admin API
    async with httpx.AsyncClient(timeout=10.0) as client:
        resp = await client.get(
            f"{_sb_url()}/auth/v1/admin/users",
            params={"email": gmail_address, "per_page": 1},
            headers={**_sb_headers(), "apikey": os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY", "")},
        )
    if resp.status_code != 200:
        logger.warning("[GmailPush] admin/users lookup failed: %s %s", resp.status_code, resp.text[:200])
        return None
    data  = resp.json()
    users = data.get("users", [])
    return users[0]["id"] if users else None


# ── Fetch history since last historyId ───────────────────────────────────────

def _fetch_new_messages(access_token: str, refresh_token: str | None,
                         start_history_id: str) -> list[dict]:
    """
    Synchronous: use Gmail history.list to get messages added to INBOX since
    start_history_id.  Returns a list of parsed message dicts.
    """
    from command_executor import _build_creds, _gmail_service, _parse_message
    creds = _build_creds(access_token, refresh_token)
    svc   = _gmail_service(creds)

    try:
        history_response = svc.users().history().list(
            userId="me",
            startHistoryId=start_history_id,
            historyTypes=["messageAdded"],
            labelId="INBOX",
        ).execute()
    except Exception as exc:
        # historyId too old or no history available
        logger.warning("[GmailPush] history.list failed (historyId=%s): %s", start_history_id, exc)
        return []

    messages = []
    seen_ids: set[str] = set()
    for record in history_response.get("history", []):
        for msg_added in record.get("messagesAdded", []):
            msg_ref = msg_added.get("message", {})
            msg_id  = msg_ref.get("id")
            if not msg_id or msg_id in seen_ids:
                continue
            seen_ids.add(msg_id)
            try:
                full_msg = svc.users().messages().get(
                    userId="me", id=msg_id, format="full"
                ).execute()
                messages.append(_parse_message(full_msg))
            except Exception:
                pass
    return messages


# ── Update historyId ──────────────────────────────────────────────────────────

async def _update_history_id(user_id: str, history_id: str) -> None:
    sb_headers = {**_sb_headers(), "Content-Type": "application/json", "Prefer": "return=minimal"}
    async with httpx.AsyncClient(timeout=10.0) as client:
        await client.patch(
            f"{_sb_url()}/rest/v1/profiles?id=eq.{user_id}",
            json={"gmail_history_id": history_id},
            headers=sb_headers,
        )


# ── Main webhook processor ────────────────────────────────────────────────────

async def process_push_notification(raw_pubsub_body: dict) -> dict:
    """
    Entry point for POST /api/gmail/webhook.

    raw_pubsub_body is the decoded Pub/Sub push message body:
      {
        "message": {
          "data": "<base64url({emailAddress, historyId})>",
          "messageId": "...",
          "publishTime": "..."
        },
        "subscription": "..."
      }

    Returns {"processed": N} or {"skipped": reason} or {"error": reason}.
    """
    message_block = raw_pubsub_body.get("message", {})
    encoded_data  = message_block.get("data", "")

    if not encoded_data:
        return {"error": "No data in Pub/Sub message"}

    try:
        decoded      = base64.urlsafe_b64decode(encoded_data + "==").decode("utf-8")
        notification = json.loads(decoded)
    except Exception as exc:
        return {"error": f"Failed to decode notification: {exc}"}

    gmail_address  = notification.get("emailAddress")
    new_history_id = str(notification.get("historyId", ""))

    if not gmail_address or not new_history_id:
        return {"error": "Missing emailAddress or historyId"}

    logger.info("[GmailPush] Notification for %s, historyId=%s", gmail_address, new_history_id)

    # ── Look up user ─────────────────────────────────────────────────────────
    user_id = await _find_user_id_by_email(gmail_address)
    if not user_id:
        return {"skipped": f"No user found for {gmail_address}"}

    # ── Fetch profile (tokens + last historyId) ───────────────────────────────
    async with httpx.AsyncClient(timeout=10.0) as client:
        presp = await client.get(
            f"{_sb_url()}/rest/v1/profiles"
            f"?id=eq.{user_id}"
            f"&select=google_access_token,google_refresh_token,gmail_history_id,plan",
            headers=_sb_headers(),
        )
    profiles = presp.json() if presp.status_code == 200 else []
    if not profiles:
        return {"skipped": "Profile not found"}

    profile        = profiles[0]
    access_token   = profile.get("google_access_token")
    refresh_token  = profile.get("google_refresh_token")
    last_history_id = profile.get("gmail_history_id") or new_history_id

    if not access_token:
        return {"skipped": "No Google tokens"}

    # ── Fetch new messages since last historyId ───────────────────────────────
    loop        = asyncio.get_event_loop()
    new_messages = await loop.run_in_executor(
        None,
        functools.partial(_fetch_new_messages, access_token, refresh_token, last_history_id),
    )

    # Always update historyId so we don't re-process on next notification
    await _update_history_id(user_id, new_history_id)

    if not new_messages:
        return {"processed": 0}

    # ── Fetch active "on new email" automations for this user ─────────────────
    async with httpx.AsyncClient(timeout=10.0) as client:
        aresp = await client.get(
            f"{_sb_url()}/rest/v1/automations"
            f"?user_id=eq.{user_id}&is_active=eq.true&select=*",
            headers=_sb_headers(),
        )
    automations = aresp.json() if aresp.status_code == 200 else []

    on_new_email = [
        a for a in automations
        if "on new email" in (a.get("schedule") or "").lower()
    ]

    if not on_new_email:
        return {"processed": 0}

    # ── Execute automations against each new message ──────────────────────────
    from jobs.automation_executor import execute_automation_on_message

    processed = 0
    for msg in new_messages:
        for auto in on_new_email:
            try:
                result = await loop.run_in_executor(
                    None,
                    functools.partial(
                        execute_automation_on_message,
                        auto, msg, access_token, refresh_token,
                    ),
                )
                if result.get("items", 0) > 0:
                    processed += 1
                    logger.info("[GmailPush] Automation %s triggered: %s",
                                auto["id"], result.get("message"))

                    # Log result to automation_logs
                    sb_headers = {**_sb_headers(), "Content-Type": "application/json", "Prefer": "return=minimal"}
                    async with httpx.AsyncClient(timeout=8.0) as client:
                        await client.post(
                            f"{_sb_url()}/rest/v1/automation_logs",
                            json={
                                "automation_id":   auto["id"],
                                "user_id":         user_id,
                                "status":          result.get("status", "success"),
                                "items_processed": result.get("items", 0),
                                "message":         result.get("message", ""),
                            },
                            headers=sb_headers,
                        )
                        await client.patch(
                            f"{_sb_url()}/rest/v1/automations?id=eq.{auto['id']}",
                            json={"last_run_at": datetime.now(tz.utc).isoformat()},
                            headers=sb_headers,
                        )
            except Exception:
                logger.exception("[GmailPush] Error running automation %s on message %s",
                                 auto.get("id"), msg.get("id"))

    return {"processed": processed}
