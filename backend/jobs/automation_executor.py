"""
automation_executor.py
Executes a single automation rule against the user's Google workspace.
Called by the scheduler every 5 minutes for due automations, and by the
/api/automations/{id}/run endpoint for manual test runs.
"""

import logging
from datetime import datetime, timezone as tz, timedelta

logger = logging.getLogger(__name__)


# ── Helpers ───────────────────────────────────────────────────────────────────

def _after_ts(last_run_at: str | None) -> str:
    """Return a Gmail `after:` fragment based on last_run_at, or 1 hour ago."""
    if last_run_at:
        try:
            dt = datetime.fromisoformat(last_run_at)
            return f" after:{int(dt.timestamp())}"
        except Exception:
            pass
    fallback = datetime.now(tz.utc) - timedelta(hours=1)
    return f" after:{int(fallback.timestamp())}"


def _ensure_list(val) -> list:
    """Normalize a field value to a list (handles string, comma-sep, or array)."""
    if not val:
        return []
    if isinstance(val, list):
        return [v.strip() for v in val if str(v).strip()]
    # comma-separated string
    return [v.strip() for v in str(val).split(",") if v.strip()]


def _get_user_email(access_token: str, refresh_token: str) -> str:
    """Return the authenticated Gmail account's email address."""
    try:
        from command_executor import _build_creds, _gmail_service
        creds = _build_creds(access_token, refresh_token)
        svc   = _gmail_service(creds)
        return svc.users().getProfile(userId="me").execute().get("emailAddress", "")
    except Exception:
        return ""


def _gmail_modify(access_token: str, refresh_token: str, msg_id: str,
                  add_labels: list = None, remove_labels: list = None):
    """Add/remove Gmail labels on a single message."""
    from command_executor import _build_creds, _gmail_service
    creds = _build_creds(access_token, refresh_token)
    svc   = _gmail_service(creds)
    body  = {}
    if add_labels:
        body["addLabelIds"] = add_labels
    if remove_labels:
        body["removeLabelIds"] = remove_labels
    svc.users().messages().modify(userId="me", id=msg_id, body=body).execute()


def _gmail_forward(access_token: str, refresh_token: str,
                   original: dict, recipient: str) -> None:
    """Forward an email to recipient by sending a new email."""
    from command_executor import gmail_send
    subject = original.get("subject", "(no subject)")
    fwd_subject = f"Fwd: {subject}" if not subject.startswith("Fwd:") else subject
    sender  = original.get("from", "")
    date    = original.get("date", "")
    body    = original.get("body") or original.get("snippet", "")
    fwd_body = (
        f"---------- Forwarded message ----------\n"
        f"From: {sender}\n"
        f"Date: {date}\n"
        f"Subject: {subject}\n\n"
        f"{body}"
    )
    gmail_send(access_token, refresh_token, recipient, fwd_subject, fwd_body)


# ── Template executors ────────────────────────────────────────────────────────

def _exec_gmail_forward_keyword(fv: dict, tok: str, rtok: str, last_run: str | None) -> dict:
    """Forward emails matching any keyword to all listed recipients."""
    from command_executor import gmail_search
    keywords    = _ensure_list(fv.get("keywords") or fv.get("keyword"))
    forward_to  = _ensure_list(fv.get("forward_to"))
    if not keywords or not forward_to:
        return {"items": 0, "message": "Missing keywords or recipients"}

    kw_query = " OR ".join(f'"{k}"' for k in keywords)
    query    = f"({kw_query}) in:inbox{_after_ts(last_run)}"
    result   = gmail_search(tok, rtok, query, max_results=20)
    msgs     = result.get("messages", [])
    forwarded = 0
    for msg in msgs:
        for recipient in forward_to:
            _gmail_forward(tok, rtok, msg, recipient)
        forwarded += 1
    return {"items": forwarded, "message": f"Forwarded {forwarded} email(s) to {len(forward_to)} recipient(s)"}


def _exec_gmail_archive_newsletters(fv: dict, tok: str, rtok: str, _last: str | None) -> dict:
    """Archive newsletter emails older than X days."""
    from command_executor import gmail_archive
    days  = int(fv.get("days") or 3)
    query = f"(unsubscribe OR newsletter OR \"list-unsubscribe\") older_than:{days}d"
    result = gmail_archive(tok, rtok, query, max_results=50)
    n = result.get("archived", 0)
    return {"items": n, "message": f"Archived {n} newsletter email(s)"}


def _exec_gmail_ooo(fv: dict, tok: str, rtok: str, last_run: str | None) -> dict:
    """Send auto-reply to all new incoming emails if before until_date."""
    from command_executor import gmail_search, gmail_send
    reply_msg  = (fv.get("reply_message") or "I'm currently out of office and will reply when I return.").strip()
    until_date = (fv.get("until_date") or "").strip()

    # Check if OOO period has ended
    if until_date:
        try:
            until_dt = datetime.fromisoformat(until_date)
            if until_dt.tzinfo is None:
                until_dt = until_dt.replace(tzinfo=tz.utc)
            if datetime.now(tz.utc) > until_dt:
                return {"items": 0, "message": f"OOO period ended on {until_date} — no replies sent"}
        except Exception:
            pass

    query  = f"in:inbox -from:me -label:sent{_after_ts(last_run)}"
    result = gmail_search(tok, rtok, query, max_results=20)
    msgs   = result.get("messages", [])
    replied = 0
    for msg in msgs:
        sender = msg.get("from", "")
        # Skip mailing lists and no-reply addresses
        if any(x in sender.lower() for x in ("noreply", "no-reply", "donotreply", "newsletter", "mailer-daemon")):
            continue
        subject = msg.get("subject", "")
        reply_subject = f"Re: {subject}" if not subject.startswith("Re:") else subject
        gmail_send(tok, rtok, sender, reply_subject, reply_msg)
        replied += 1
    return {"items": replied, "message": f"Sent {replied} auto-reply(ies)"}


def _exec_gmail_vip_flag(fv: dict, tok: str, rtok: str, last_run: str | None) -> dict:
    """Star or mark-important emails from VIP senders."""
    from command_executor import gmail_search
    senders = _ensure_list(fv.get("senders") or fv.get("sender"))
    action  = (fv.get("action") or "Mark as important").lower()
    if not senders:
        return {"items": 0, "message": "No VIP senders configured"}

    from_query = " OR ".join(f"from:{s}" for s in senders)
    query  = f"({from_query}) in:inbox{_after_ts(last_run)}"
    result = gmail_search(tok, rtok, query, max_results=20)
    msgs   = result.get("messages", [])
    done   = 0
    for msg in msgs:
        add_labels = []
        if "star" in action:
            add_labels.append("STARRED")
        if "important" in action or "vip" in action:
            add_labels.append("IMPORTANT")
        if add_labels:
            _gmail_modify(tok, rtok, msg["id"], add_labels=add_labels)
        done += 1
    return {"items": done, "message": f"Flagged {done} email(s) from VIP senders"}


def _exec_gmail_receipts(fv: dict, tok: str, rtok: str, last_run: str | None) -> dict:
    """Archive receipt and invoice emails."""
    from command_executor import gmail_archive
    query = "(receipt OR invoice OR \"order confirmation\" OR \"payment confirmation\" OR \"order #\" OR \"your order\")"
    result = gmail_archive(tok, rtok, query, max_results=50)
    n = result.get("archived", 0)
    return {"items": n, "message": f"Archived {n} receipt/invoice email(s)"}


def _exec_gmail_alert_person(fv: dict, tok: str, rtok: str, last_run: str | None) -> dict:
    """Notify (mark important / forward) when a specific sender emails."""
    from command_executor import gmail_search, gmail_send
    senders = _ensure_list(fv.get("sender") or fv.get("senders"))
    method  = (fv.get("notify_method") or "Mark as important").lower()
    if not senders:
        return {"items": 0, "message": "No sender configured"}

    from_query = " OR ".join(f"from:{s}" for s in senders)
    query  = f"({from_query}) in:inbox{_after_ts(last_run)}"
    result = gmail_search(tok, rtok, query, max_results=10)
    msgs   = result.get("messages", [])
    done   = 0
    for msg in msgs:
        if "forward" in method:
            user_email = _get_user_email(tok, rtok)
            if user_email:
                _gmail_forward(tok, rtok, msg, user_email)
        else:
            labels = ["IMPORTANT"]
            if "star" in method:
                labels.append("STARRED")
            _gmail_modify(tok, rtok, msg["id"], add_labels=labels)
        done += 1
    return {"items": done, "message": f"Alerted on {done} email(s) from monitored sender(s)"}


def _exec_gmail_daily_digest(fv: dict, tok: str, rtok: str, _last: str | None) -> dict:
    """Compile unread important emails and send a digest to the user."""
    from command_executor import gmail_search, gmail_send
    label      = (fv.get("label") or "").strip()
    query      = f"is:unread {'label:' + label if label else 'is:important'}"
    result     = gmail_search(tok, rtok, query, max_results=10)
    msgs       = result.get("messages", [])
    if not msgs:
        return {"items": 0, "message": "No unread important emails — digest skipped"}

    user_email = _get_user_email(tok, rtok)
    if not user_email:
        return {"items": 0, "message": "Could not determine user email for digest delivery"}

    lines = ["Here's your daily email digest:\n"]
    for i, m in enumerate(msgs, 1):
        lines.append(f"{i}. From: {m.get('from', '?')}")
        lines.append(f"   Subject: {m.get('subject', '?')}")
        lines.append(f"   Preview: {m.get('snippet', '')[:120]}")
        lines.append("")
    body = "\n".join(lines)
    gmail_send(tok, rtok, user_email, "📋 Your Daily Email Digest", body)
    return {"items": len(msgs), "message": f"Digest sent with {len(msgs)} email(s)"}


def _exec_gmail_followup(fv: dict, tok: str, rtok: str, _last: str | None) -> dict:
    """Find sent emails with no reply after X days and send a reminder."""
    from command_executor import gmail_search, gmail_send
    days  = int(fv.get("days") or 3)
    label = (fv.get("label") or "").strip()

    # Search sent emails older than X days that haven't been replied to
    q_label = f"label:{label}" if label else ""
    query   = f"in:sent older_than:{days}d {q_label}".strip()
    result  = gmail_search(tok, rtok, query, max_results=10)
    msgs    = result.get("messages", [])
    if not msgs:
        return {"items": 0, "message": "No follow-up candidates found"}

    user_email = _get_user_email(tok, rtok)
    if not user_email:
        return {"items": 0, "message": "Could not determine user email for reminder delivery"}

    lines = [f"Follow-up reminder — the following sent emails have had no reply for {days}+ days:\n"]
    for m in msgs[:5]:
        lines.append(f"• To: {m.get('to', '?')} | Subject: {m.get('subject', '?')} | Sent: {m.get('date', '?')}")
    body = "\n".join(lines)
    gmail_send(tok, rtok, user_email, f"🔔 Follow-up Reminder ({len(msgs)} email(s))", body)
    return {"items": len(msgs), "message": f"Follow-up reminder sent for {len(msgs)} email(s)"}


def _exec_gmail_escalate(fv: dict, tok: str, rtok: str, _last: str | None) -> dict:
    """Forward urgent unreplied emails after X hours to escalation address."""
    from command_executor import gmail_search
    keywords    = _ensure_list(fv.get("keywords") or fv.get("keyword"))
    hours       = int(fv.get("hours") or 4)
    escalate_to = _ensure_list(fv.get("escalate_to"))
    if not keywords or not escalate_to:
        return {"items": 0, "message": "Missing urgency keywords or escalation address"}

    kw_query = " OR ".join(f'"{k}"' for k in keywords)
    # Find emails older than X hours with the urgency keyword
    query  = f"({kw_query}) in:inbox older_than:{hours}h"
    result = gmail_search(tok, rtok, query, max_results=10)
    msgs   = result.get("messages", [])
    done   = 0
    for msg in msgs:
        for recipient in escalate_to:
            _gmail_forward(tok, rtok, msg, recipient)
        done += 1
    return {"items": done, "message": f"Escalated {done} email(s) to {', '.join(escalate_to)}"}


def _exec_cal_focus_time(fv: dict, tok: str, rtok: str, _last: str | None) -> dict:
    """Create a focus-time calendar event for today (weekdays only)."""
    from command_executor import calendar_create
    today = datetime.now(tz.utc)
    if today.weekday() >= 5:  # Saturday=5, Sunday=6
        return {"items": 0, "message": "Skipped — today is a weekend"}

    start_time  = (fv.get("start_time") or "09:00").strip()
    duration    = float(fv.get("duration") or 2)
    event_title = (fv.get("event_title") or "Focus Time").strip()

    try:
        h, m = [int(x) for x in start_time.split(":")]
    except ValueError:
        h, m = 9, 0

    start_dt = today.replace(hour=h, minute=m, second=0, microsecond=0)
    end_dt   = start_dt + timedelta(hours=duration)
    result   = calendar_create(
        tok, rtok,
        summary=event_title,
        start_iso=start_dt.isoformat(),
        end_iso=end_dt.isoformat(),
        attendees=[],
        description="Created automatically by WorkspaceFlow automations.",
    )
    created = result.get("title") or event_title
    return {"items": 1, "message": f"Created focus block: '{created}'"}


def _exec_cal_meeting_reminder(fv: dict, tok: str, rtok: str, _last: str | None) -> dict:
    """Send reminder emails to attendees of meetings starting soon."""
    from command_executor import calendar_search, gmail_send
    minutes_before = int(fv.get("minutes_before") or 30)
    message        = (fv.get("message") or "Reminder: you have a meeting starting soon.").strip()

    now     = datetime.now(tz.utc)
    window_start = now.isoformat()
    window_end   = (now + timedelta(minutes=minutes_before + 5)).isoformat()

    result = calendar_search(tok, rtok, time_min=window_start, time_max=window_end, max_results=10)
    events = result.get("events", [])
    sent   = 0
    for ev in events:
        attendees = ev.get("attendees") or []
        for att in attendees:
            email = att if isinstance(att, str) else att.get("email", "")
            if email and "@" in email:
                subject = f"⏰ Reminder: {ev.get('title', 'Meeting')} in {minutes_before} minutes"
                gmail_send(tok, rtok, email, subject, message)
                sent += 1
    return {"items": sent, "message": f"Sent {sent} reminder(s) for {len(events)} upcoming meeting(s)"}


# ── Schedule type helpers ─────────────────────────────────────────────────────

def is_due(automation: dict, now_utc: datetime) -> bool:
    """Return True if this automation should execute now."""
    schedule   = (automation.get("schedule") or "").lower()
    last_run   = automation.get("last_run_at")
    fv         = automation.get("field_values") or {}

    # Parse last_run_at
    last_run_dt = None
    if last_run:
        try:
            last_run_dt = datetime.fromisoformat(last_run)
            if last_run_dt.tzinfo is None:
                last_run_dt = last_run_dt.replace(tzinfo=tz.utc)
        except Exception:
            pass

    # Event-triggered — run every 5 minutes (poll for new items)
    if any(s in schedule for s in ("on new email", "on new calendar", "on new drive", "on form", "on drive", "on sheet")):
        if last_run_dt and (now_utc - last_run_dt).total_seconds() < 240:
            return False  # ran less than 4 min ago
        return True

    # Hourly check
    if "hourly" in schedule:
        if last_run_dt and (now_utc - last_run_dt).total_seconds() < 3500:
            return False
        return True

    # Daily check (no specific time)
    if schedule == "daily check":
        if last_run_dt and last_run_dt.date() == now_utc.date():
            return False
        return True

    # Daily (weekdays) — run once per weekday at the configured time
    if "weekday" in schedule or "daily (weekday" in schedule:
        if now_utc.weekday() >= 5:
            return False
        # If already ran today, skip
        if last_run_dt and last_run_dt.date() == now_utc.date():
            return False
        start_time = (fv.get("start_time") or "09:00").strip()
        try:
            h, m = [int(x) for x in start_time.split(":")]
        except ValueError:
            h, m = 9, 0
        # Run within 5 minutes of the configured time
        return now_utc.hour == h and abs(now_utc.minute - m) <= 2

    # "Daily at HH:MM" or "Weekly on ... at HH:MM"
    if "daily at" in schedule or "weekly" in schedule:
        # Extract time from schedule string e.g. "Daily at 08:00" or field values
        time_val = fv.get("run_time") or fv.get("send_time")
        if not time_val:
            # Try to extract from schedule string
            import re
            m = re.search(r"(\d{1,2}:\d{2})", schedule)
            time_val = m.group(1) if m else "08:00"
        try:
            h, mn = [int(x) for x in time_val.split(":")]
        except ValueError:
            h, mn = 8, 0

        if last_run_dt and last_run_dt.date() == now_utc.date():
            return False

        if "weekly" in schedule:
            day_names = {"monday": 0, "tuesday": 1, "wednesday": 2,
                         "thursday": 3, "friday": 4, "saturday": 5, "sunday": 6}
            for day_name, day_num in day_names.items():
                if day_name in schedule:
                    if now_utc.weekday() != day_num:
                        return False
                    break

        return now_utc.hour == h and abs(now_utc.minute - mn) <= 2

    # "Before each meeting" — run every 5 min
    if "before each meeting" in schedule or "before each" in schedule:
        if last_run_dt and (now_utc - last_run_dt).total_seconds() < 240:
            return False
        return True

    # Default: run every 5 minutes if no specific schedule
    if last_run_dt and (now_utc - last_run_dt).total_seconds() < 240:
        return False
    return True


# ── Main dispatcher ───────────────────────────────────────────────────────────

_EXECUTORS = {
    "gmail-forward-keyword":    _exec_gmail_forward_keyword,
    "gmail-archive-newsletters": _exec_gmail_archive_newsletters,
    "gmail-ooo":                _exec_gmail_ooo,
    "gmail-vip-flag":           _exec_gmail_vip_flag,
    "gmail-receipts":           _exec_gmail_receipts,
    "gmail-alert-person":       _exec_gmail_alert_person,
    "gmail-daily-digest":       _exec_gmail_daily_digest,
    "gmail-followup":           _exec_gmail_followup,
    "gmail-escalate":           _exec_gmail_escalate,
    "cal-focus-time":           _exec_cal_focus_time,
    "cal-meeting-reminder":     _exec_cal_meeting_reminder,
}


def execute_automation(automation: dict, access_token: str, refresh_token: str) -> dict:
    """
    Execute one automation rule. Returns {"items": N, "message": str, "status": "success"|"error"}.
    This is synchronous — wrap in run_in_executor when calling from async context.
    """
    template_id = automation.get("template_id", "")
    fv          = automation.get("field_values") or {}
    last_run    = automation.get("last_run_at")

    executor = _EXECUTORS.get(template_id)
    if not executor:
        return {
            "items":   0,
            "message": f"Template '{template_id}' is not yet supported for automated execution.",
            "status":  "skipped",
        }

    try:
        result = executor(fv, access_token, refresh_token, last_run)
        return {**result, "status": "success"}
    except Exception as exc:
        logger.exception("[AutomationExecutor] template=%s automation_id=%s",
                         template_id, automation.get("id"))
        return {"items": 0, "message": str(exc)[:300], "status": "error"}
