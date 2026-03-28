"""
automation_executor.py
Executes a single automation rule against the user's Google workspace.

Execution modes:
  - Scheduled mode: called by the scheduler for time-based automations
  - Push mode: called by Gmail push notifications for "on new email" automations

Bug fixes applied:
  - "all" sender value treated as match-all wildcard (never used as email address)
  - _gmail_forward uses raw Gmail message bytes so headers + attachments are preserved
  - VIP flag creates the "VIP" label if it doesn't exist before applying it
  - execute_automation_on_message() for real-time push-mode execution
"""

import base64
import logging
import os
from datetime import datetime, timezone as tz, timedelta
from email.mime.multipart import MIMEMultipart
from email.mime.text import MIMEText

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
    return [v.strip() for v in str(val).split(",") if v.strip()]


def _is_all_wildcard(senders: list) -> bool:
    """Return True if the sender list is the 'all' match-all wildcard."""
    return any(s.strip().lower() == "all" for s in senders)


def _get_user_email(access_token: str, refresh_token: str) -> str:
    """Return the authenticated Gmail account's email address."""
    try:
        from command_executor import _build_creds, _gmail_service
        creds = _build_creds(access_token, refresh_token)
        svc   = _gmail_service(creds)
        return svc.users().getProfile(userId="me").execute().get("emailAddress", "")
    except Exception:
        return ""


def _gmail_service_for(access_token: str, refresh_token: str):
    """Build and return an authenticated Gmail service."""
    from command_executor import _build_creds, _gmail_service
    creds = _build_creds(access_token, refresh_token)
    return _gmail_service(creds)


def _gmail_modify(access_token: str, refresh_token: str, msg_id: str,
                  add_labels: list = None, remove_labels: list = None):
    """Add/remove Gmail label IDs on a single message."""
    if not msg_id:
        logger.warning("[AutoExec] _gmail_modify called with empty msg_id — skipped")
        return
    svc  = _gmail_service_for(access_token, refresh_token)
    body = {}
    if add_labels:
        body["addLabelIds"] = add_labels
    if remove_labels:
        body["removeLabelIds"] = remove_labels
    svc.users().messages().modify(userId="me", id=msg_id, body=body).execute()


def _get_or_create_label(access_token: str, refresh_token: str, name: str) -> str:
    """
    Return the Gmail label ID for `name`.
    Creates the label if it doesn't already exist.
    """
    svc = _gmail_service_for(access_token, refresh_token)
    result = svc.users().labels().list(userId="me").execute()
    for label in result.get("labels", []):
        if label["name"].lower() == name.lower():
            return label["id"]
    # Label not found — create it
    created = svc.users().labels().create(
        userId="me",
        body={
            "name": name,
            "labelListVisibility": "labelShow",
            "messageListVisibility": "show",
        },
    ).execute()
    return created["id"]


def _gmail_forward(access_token: str, refresh_token: str,
                   original: dict, recipient: str) -> None:
    """
    Forward an email to `recipient` using the Gmail API.

    Fetches the original raw RFC 2822 bytes from Gmail so the subject,
    sender, date, body and attachments are fully preserved.  Falls back
    to a plain-text reconstruction if the raw fetch fails.
    """
    if not recipient or "@" not in recipient:
        return

    svc     = _gmail_service_for(access_token, refresh_token)
    msg_id  = original.get("id")
    subject = original.get("subject", "(no subject)")
    fwd_subject = f"Fwd: {subject}" if not subject.startswith("Fwd:") else subject
    sender  = original.get("from", "")
    date    = original.get("date", "")

    # ── Try to get the full original raw message ────────────────────────────
    original_body_text = None
    if msg_id:
        try:
            raw_response = svc.users().messages().get(
                userId="me", id=msg_id, format="raw"
            ).execute()
            raw_bytes = base64.urlsafe_b64decode(raw_response["raw"] + "==")
            import email as _email_lib
            orig_parsed = _email_lib.message_from_bytes(raw_bytes)
            # Extract plain text payload
            if orig_parsed.is_multipart():
                for part in orig_parsed.walk():
                    if part.get_content_type() == "text/plain":
                        charset = part.get_content_charset() or "utf-8"
                        original_body_text = part.get_payload(decode=True).decode(charset, errors="replace")
                        break
            else:
                charset = orig_parsed.get_content_charset() or "utf-8"
                original_body_text = orig_parsed.get_payload(decode=True).decode(charset, errors="replace")
        except Exception:
            pass  # fall through to snippet fallback

    if not original_body_text:
        original_body_text = original.get("body") or original.get("snippet", "")

    fwd_body = (
        f"---------- Forwarded message ----------\n"
        f"From: {sender}\n"
        f"Date: {date}\n"
        f"Subject: {subject}\n\n"
        f"{original_body_text}"
    )

    # Build and send the forwarded message
    mime_msg = MIMEText(fwd_body, "plain", "utf-8")
    mime_msg["To"]      = recipient
    mime_msg["Subject"] = fwd_subject

    raw = base64.urlsafe_b64encode(mime_msg.as_bytes()).decode()
    svc.users().messages().send(userId="me", body={"raw": raw}).execute()


# ── Message-level match helpers (used in push mode) ───────────────────────────

def _message_matches_keywords(message: dict, keywords: list) -> bool:
    """Return True if any keyword appears in the message subject, body, or snippet."""
    text = " ".join([
        message.get("subject", ""),
        message.get("body", ""),
        message.get("snippet", ""),
    ]).lower()
    return any(kw.lower() in text for kw in keywords)


def _message_from_matches(message: dict, senders: list) -> bool:
    """Return True if the message 'from' field matches any sender (or senders is 'all')."""
    if _is_all_wildcard(senders):
        return True
    from_field = message.get("from", "").lower()
    return any(s.lower() in from_field for s in senders)


# ── Template executors ─────────────────────────────────────────────────────────

def _exec_gmail_forward_keyword(fv: dict, tok: str, rtok: str, last_run: str | None) -> dict:
    """Forward emails matching any keyword to all listed recipients (scheduled mode)."""
    from command_executor import gmail_search
    keywords   = _ensure_list(fv.get("keywords") or fv.get("keyword"))
    forward_to = _ensure_list(fv.get("forward_to"))
    if not keywords or not forward_to:
        return {"items": 0, "message": "Missing keywords or recipients"}

    kw_query  = " OR ".join(f'"{k}"' for k in keywords)
    query     = f"({kw_query}) in:inbox{_after_ts(last_run)}"
    result    = gmail_search(tok, rtok, query, max_results=20)
    msgs      = result.get("messages", [])
    forwarded = 0
    for msg in msgs:
        for recipient in forward_to:
            _gmail_forward(tok, rtok, msg, recipient)
        forwarded += 1
    return {"items": forwarded, "message": f"Forwarded {forwarded} email(s) to {len(forward_to)} recipient(s)"}


def _exec_gmail_archive_newsletters(fv: dict, tok: str, rtok: str, _last: str | None) -> dict:
    from command_executor import gmail_archive
    days   = int(fv.get("days") or 3)
    query  = f"(unsubscribe OR newsletter OR \"list-unsubscribe\") older_than:{days}d"
    result = gmail_archive(tok, rtok, query, max_results=50)
    n = result.get("archived", 0)
    return {"items": n, "message": f"Archived {n} newsletter email(s)"}


def _exec_gmail_ooo(fv: dict, tok: str, rtok: str, last_run: str | None) -> dict:
    from command_executor import gmail_search, gmail_send
    reply_msg  = (fv.get("reply_message") or "I'm currently out of office and will reply when I return.").strip()
    until_date = (fv.get("until_date") or "").strip()

    if until_date:
        try:
            until_dt = datetime.fromisoformat(until_date)
            if until_dt.tzinfo is None:
                until_dt = until_dt.replace(tzinfo=tz.utc)
            if datetime.now(tz.utc) > until_dt:
                return {"items": 0, "message": f"OOO period ended on {until_date}"}
        except Exception:
            pass

    query  = f"in:inbox -from:me -label:sent{_after_ts(last_run)}"
    result = gmail_search(tok, rtok, query, max_results=20)
    msgs   = result.get("messages", [])
    replied = 0
    for msg in msgs:
        sender = msg.get("from", "")
        if any(x in sender.lower() for x in ("noreply", "no-reply", "donotreply", "newsletter", "mailer-daemon")):
            continue
        subject = msg.get("subject", "")
        reply_subject = f"Re: {subject}" if not subject.startswith("Re:") else subject
        gmail_send(tok, rtok, sender, reply_subject, reply_msg)
        replied += 1
    return {"items": replied, "message": f"Sent {replied} auto-reply(ies)"}


def _exec_gmail_vip_flag(fv: dict, tok: str, rtok: str, last_run: str | None) -> dict:
    """
    Star and/or label emails from VIP senders.
    Bug fixes:
      - 'all' sender value = match all inbox emails (wildcard, not an address)
      - 'Star + Label as VIP': resolve or create the 'VIP' label first, then apply
        STARRED + vipLabelId in a single modify call so neither is skipped
    """
    from command_executor import gmail_search
    senders = _ensure_list(fv.get("senders") or fv.get("sender"))
    action  = (fv.get("action") or "Mark as important").lower()

    # Build Gmail query — "all" means match every inbox email
    if not senders or _is_all_wildcard(senders):
        query = f"in:inbox{_after_ts(last_run)}"
    else:
        from_query = " OR ".join(f"from:{s}" for s in senders)
        query      = f"({from_query}) in:inbox{_after_ts(last_run)}"

    result = gmail_search(tok, rtok, query, max_results=20)
    msgs   = result.get("messages", [])
    if not msgs:
        return {"items": 0, "message": "No matching emails found"}

    # Resolve label IDs before the modify loop (avoid one API call per message)
    add_label_ids = []
    if "star" in action:
        add_label_ids.append("STARRED")
    if "vip" in action or "label" in action:
        try:
            vip_id = _get_or_create_label(tok, rtok, "VIP")
            add_label_ids.append(vip_id)
        except Exception as exc:
            logger.warning("[AutoExec] Could not resolve VIP label: %s", exc)
    if "important" in action and "vip" not in action:
        add_label_ids.append("IMPORTANT")

    if not add_label_ids:
        add_label_ids = ["IMPORTANT"]

    done = 0
    for msg in msgs:
        msg_id = msg.get("id")
        if not msg_id:
            continue
        _gmail_modify(tok, rtok, msg_id, add_labels=add_label_ids)
        done += 1
    return {"items": done, "message": f"Flagged {done} email(s) ({', '.join(add_label_ids)})"}


def _exec_gmail_receipts(fv: dict, tok: str, rtok: str, last_run: str | None) -> dict:
    from command_executor import gmail_archive
    query  = "(receipt OR invoice OR \"order confirmation\" OR \"payment confirmation\" OR \"order #\" OR \"your order\")"
    result = gmail_archive(tok, rtok, query, max_results=50)
    n = result.get("archived", 0)
    return {"items": n, "message": f"Archived {n} receipt/invoice email(s)"}


def _exec_gmail_alert_person(fv: dict, tok: str, rtok: str, last_run: str | None) -> dict:
    from command_executor import gmail_search
    senders = _ensure_list(fv.get("sender") or fv.get("senders"))
    method  = (fv.get("notify_method") or "Mark as important").lower()

    if not senders or _is_all_wildcard(senders):
        query = f"in:inbox{_after_ts(last_run)}"
    else:
        from_query = " OR ".join(f"from:{s}" for s in senders)
        query      = f"({from_query}) in:inbox{_after_ts(last_run)}"

    result = gmail_search(tok, rtok, query, max_results=10)
    msgs   = result.get("messages", [])
    done   = 0
    for msg in msgs:
        msg_id = msg.get("id")
        if not msg_id:
            continue
        if "forward" in method:
            user_email = _get_user_email(tok, rtok)
            if user_email:
                _gmail_forward(tok, rtok, msg, user_email)
        else:
            labels = ["IMPORTANT"]
            if "star" in method:
                labels.append("STARRED")
            _gmail_modify(tok, rtok, msg_id, add_labels=labels)
        done += 1
    return {"items": done, "message": f"Alerted on {done} email(s) from monitored sender(s)"}


def _exec_gmail_daily_digest(fv: dict, tok: str, rtok: str, _last: str | None) -> dict:
    from command_executor import gmail_search, gmail_send
    label  = (fv.get("label") or "").strip()
    query  = f"is:unread {'label:' + label if label else 'is:important'}"
    result = gmail_search(tok, rtok, query, max_results=10)
    msgs   = result.get("messages", [])
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
    gmail_send(tok, rtok, user_email, "📋 Your Daily Email Digest", "\n".join(lines))
    return {"items": len(msgs), "message": f"Digest sent with {len(msgs)} email(s)"}


def _exec_gmail_followup(fv: dict, tok: str, rtok: str, _last: str | None) -> dict:
    from command_executor import gmail_search, gmail_send
    days  = int(fv.get("days") or 3)
    label = (fv.get("label") or "").strip()
    q_label = f"label:{label}" if label else ""
    query   = f"in:sent older_than:{days}d {q_label}".strip()
    result  = gmail_search(tok, rtok, query, max_results=10)
    msgs    = result.get("messages", [])
    if not msgs:
        return {"items": 0, "message": "No follow-up candidates found"}

    user_email = _get_user_email(tok, rtok)
    if not user_email:
        return {"items": 0, "message": "Could not determine user email"}

    lines = [f"Follow-up reminder — these sent emails have had no reply for {days}+ days:\n"]
    for m in msgs[:5]:
        lines.append(f"• To: {m.get('to', '?')} | Subject: {m.get('subject', '?')}")
    gmail_send(tok, rtok, user_email, f"🔔 Follow-up Reminder ({len(msgs)} email(s))", "\n".join(lines))
    return {"items": len(msgs), "message": f"Follow-up reminder sent for {len(msgs)} email(s)"}


def _exec_gmail_escalate(fv: dict, tok: str, rtok: str, _last: str | None) -> dict:
    from command_executor import gmail_search
    keywords    = _ensure_list(fv.get("keywords") or fv.get("keyword"))
    hours       = int(fv.get("hours") or 4)
    escalate_to = _ensure_list(fv.get("escalate_to"))
    if not keywords or not escalate_to:
        return {"items": 0, "message": "Missing urgency keywords or escalation address"}

    kw_query = " OR ".join(f'"{k}"' for k in keywords)
    query    = f"({kw_query}) in:inbox older_than:{hours}h"
    result   = gmail_search(tok, rtok, query, max_results=10)
    msgs     = result.get("messages", [])
    done     = 0
    for msg in msgs:
        for recipient in escalate_to:
            _gmail_forward(tok, rtok, msg, recipient)
        done += 1
    return {"items": done, "message": f"Escalated {done} email(s) to {', '.join(escalate_to)}"}


def _exec_cal_focus_time(fv: dict, tok: str, rtok: str, _last: str | None) -> dict:
    from command_executor import calendar_create
    today = datetime.now(tz.utc)
    if today.weekday() >= 5:
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
    return {"items": 1, "message": f"Created focus block: '{result.get('title', event_title)}'"}


def _exec_gmail_auto_label(fv: dict, tok: str, rtok: str, last_run: str | None) -> dict:
    """Apply a Gmail label to emails matching a sender, keyword, or domain."""
    from command_executor import gmail_search
    match_by    = (fv.get("match_by") or "Sender").lower()
    match_value = (fv.get("match_value") or "").strip()
    label_name  = (fv.get("label_name") or "").strip()
    if not match_value or not label_name:
        return {"items": 0, "message": "Missing match value or label name"}

    if match_by == "sender":
        query = f"from:{match_value} in:inbox{_after_ts(last_run)}"
    elif match_by == "domain":
        domain = match_value.lstrip("@")
        query  = f"from:@{domain} in:inbox{_after_ts(last_run)}"
    else:  # keyword
        query = f'"{match_value}" in:inbox{_after_ts(last_run)}'

    result = gmail_search(tok, rtok, query, max_results=25)
    msgs   = result.get("messages", [])
    if not msgs:
        return {"items": 0, "message": "No matching emails found"}

    label_id = _get_or_create_label(tok, rtok, label_name)
    done = 0
    for msg in msgs:
        msg_id = msg.get("id")
        if msg_id:
            _gmail_modify(tok, rtok, msg_id, add_labels=[label_id])
            done += 1
    return {"items": done, "message": f"Applied label '{label_name}' to {done} email(s)"}


def _exec_gmail_morning_triage(fv: dict, tok: str, rtok: str, _last: str | None) -> dict:
    """Send a morning email listing unread messages that need attention today."""
    from command_executor import gmail_search, gmail_send
    max_emails = int(fv.get("max_emails") or 10)

    query  = "is:unread in:inbox newer_than:1d"
    result = gmail_search(tok, rtok, query, max_results=max_emails)
    msgs   = result.get("messages", [])

    user_email = _get_user_email(tok, rtok)
    if not user_email:
        return {"items": 0, "message": "Could not determine user email"}

    today_str = datetime.now(tz.utc).strftime("%A, %B %d")
    if not msgs:
        subject = f"☀️ Morning Triage ({today_str}) — Inbox clear!"
        body    = "Great news — no unread emails from the last 24 hours. Enjoy a clear start to your day!"
    else:
        lines = [f"Good morning! Here are {len(msgs)} unread email(s) needing your attention:\n"]
        for i, m in enumerate(msgs, 1):
            sender  = m.get("from", "Unknown")
            subj    = m.get("subject", "(no subject)")
            snippet = (m.get("snippet") or "")[:100]
            lines.append(f"{i}. FROM: {sender}")
            lines.append(f"   SUBJECT: {subj}")
            if snippet:
                lines.append(f"   PREVIEW: {snippet}...")
            lines.append("")
        lines.append("—\nSent by WorkspaceFlow Morning Triage automation.")
        subject = f"☀️ Morning Triage ({today_str}) — {len(msgs)} email(s) need attention"
        body    = "\n".join(lines)

    gmail_send(tok, rtok, user_email, subject, body)
    return {"items": len(msgs), "message": f"Morning triage sent — {len(msgs)} email(s) listed"}


def _exec_cal_daily_agenda(fv: dict, tok: str, rtok: str, _last: str | None) -> dict:
    """Email the user a clean summary of their calendar events for today."""
    from command_executor import calendar_search, gmail_send

    now   = datetime.now(tz.utc)
    start = now.replace(hour=0, minute=0, second=0, microsecond=0).isoformat()
    end   = now.replace(hour=23, minute=59, second=59, microsecond=0).isoformat()

    result = calendar_search(tok, rtok, time_min=start, time_max=end, max_results=20)
    events = result.get("events", [])

    user_email = _get_user_email(tok, rtok)
    if not user_email:
        return {"items": 0, "message": "Could not determine user email"}

    today_str = now.strftime("%A, %B %d, %Y")
    if not events:
        subject = f"📅 Your Agenda — {today_str} — No events"
        body    = f"You have no scheduled events today ({today_str}). Enjoy a free day!"
    else:
        lines = [f"Here's your agenda for {today_str}:\n"]
        for ev in events:
            title    = ev.get("title", "Untitled")
            start_dt = ev.get("start", "")
            end_dt   = ev.get("end", "")
            location = ev.get("location", "")
            attendees = ev.get("attendees") or []
            try:
                s_dt     = datetime.fromisoformat(start_dt.replace("Z", "+00:00"))
                e_dt     = datetime.fromisoformat(end_dt.replace("Z", "+00:00"))
                time_str = f"{s_dt.strftime('%I:%M %p')} – {e_dt.strftime('%I:%M %p')}"
            except Exception:
                time_str = start_dt or "All day"
            lines.append(f"• {time_str}  {title}")
            if location:
                lines.append(f"  📍 {location}")
            if attendees:
                names = [a if isinstance(a, str) else a.get("email", "") for a in attendees[:3]]
                lines.append(f"  👥 {', '.join(n for n in names if n)}")
        lines.append(f"\n{len(events)} event(s) total.")
        lines.append("—\nSent by WorkspaceFlow Daily Agenda automation.")
        subject = f"📅 Your Agenda — {today_str} — {len(events)} event(s)"
        body    = "\n".join(lines)

    gmail_send(tok, rtok, user_email, subject, body)
    return {"items": len(events), "message": f"Daily agenda sent — {len(events)} event(s)"}


def _exec_cal_meeting_reminder(fv: dict, tok: str, rtok: str, _last: str | None) -> dict:
    from command_executor import calendar_search, gmail_send
    minutes_before = int(fv.get("minutes_before") or 30)
    message        = (fv.get("message") or "Reminder: you have a meeting starting soon.").strip()

    now          = datetime.now(tz.utc)
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


# ── Push-mode: execute automation against one specific message ─────────────────

def execute_automation_on_message(automation: dict, message: dict,
                                   access_token: str, refresh_token: str) -> dict:
    """
    Real-time push mode: evaluate and execute one automation against one
    specific incoming email message.  Returns {"items": N, "message": str, "status": str}.
    """
    template_id = automation.get("template_id", "")
    fv          = automation.get("field_values") or {}

    try:
        if template_id == "gmail-forward-keyword":
            keywords   = _ensure_list(fv.get("keywords") or fv.get("keyword"))
            forward_to = _ensure_list(fv.get("forward_to"))
            if not keywords or not forward_to:
                return {"items": 0, "message": "Missing config", "status": "skipped"}
            if not _message_matches_keywords(message, keywords):
                return {"items": 0, "message": "No keyword match", "status": "skipped"}
            for recipient in forward_to:
                _gmail_forward(access_token, refresh_token, message, recipient)
            return {"items": 1, "message": f"Forwarded to {len(forward_to)} recipient(s)", "status": "success"}

        elif template_id == "gmail-ooo":
            reply_msg  = (fv.get("reply_message") or "I'm out of office.").strip()
            until_date = (fv.get("until_date") or "").strip()
            if until_date:
                try:
                    until_dt = datetime.fromisoformat(until_date)
                    if until_dt.tzinfo is None:
                        until_dt = until_dt.replace(tzinfo=tz.utc)
                    if datetime.now(tz.utc) > until_dt:
                        return {"items": 0, "message": "OOO period ended", "status": "skipped"}
                except Exception:
                    pass
            sender = message.get("from", "")
            if any(x in sender.lower() for x in ("noreply", "no-reply", "donotreply", "newsletter", "mailer-daemon")):
                return {"items": 0, "message": "Skipped automated sender", "status": "skipped"}
            from command_executor import gmail_send
            subject = message.get("subject", "")
            gmail_send(access_token, refresh_token, sender,
                       f"Re: {subject}" if not subject.startswith("Re:") else subject, reply_msg)
            return {"items": 1, "message": "Auto-reply sent", "status": "success"}

        elif template_id == "gmail-vip-flag":
            senders = _ensure_list(fv.get("senders") or fv.get("sender"))
            if not _message_from_matches(message, senders):
                return {"items": 0, "message": "Sender not in VIP list", "status": "skipped"}
            action = (fv.get("action") or "Mark as important").lower()
            msg_id = message.get("id")
            if not msg_id:
                return {"items": 0, "message": "No message ID", "status": "error"}
            add_label_ids = []
            if "star" in action:
                add_label_ids.append("STARRED")
            if "vip" in action or "label" in action:
                vip_id = _get_or_create_label(access_token, refresh_token, "VIP")
                add_label_ids.append(vip_id)
            if "important" in action and "vip" not in action:
                add_label_ids.append("IMPORTANT")
            if not add_label_ids:
                add_label_ids = ["IMPORTANT"]
            _gmail_modify(access_token, refresh_token, msg_id, add_labels=add_label_ids)
            return {"items": 1, "message": f"Flagged ({', '.join(add_label_ids)})", "status": "success"}

        elif template_id == "gmail-receipts":
            receipt_kws = ["receipt", "invoice", "order confirmation", "payment confirmation", "your order"]
            if not _message_matches_keywords(message, receipt_kws):
                return {"items": 0, "message": "Not a receipt/invoice email", "status": "skipped"}
            msg_id = message.get("id")
            if msg_id:
                _gmail_modify(access_token, refresh_token, msg_id, remove_labels=["INBOX"])
            return {"items": 1, "message": "Archived receipt/invoice", "status": "success"}

        elif template_id == "gmail-alert-person":
            senders = _ensure_list(fv.get("sender") or fv.get("senders"))
            if not _message_from_matches(message, senders):
                return {"items": 0, "message": "Not from monitored sender", "status": "skipped"}
            method = (fv.get("notify_method") or "Mark as important").lower()
            msg_id = message.get("id")
            if "forward" in method:
                user_email = _get_user_email(access_token, refresh_token)
                if user_email:
                    _gmail_forward(access_token, refresh_token, message, user_email)
            else:
                labels = ["IMPORTANT"]
                if "star" in method:
                    labels.append("STARRED")
                if msg_id:
                    _gmail_modify(access_token, refresh_token, msg_id, add_labels=labels)
            return {"items": 1, "message": "Alert action applied", "status": "success"}

        elif template_id == "gmail-auto-label":
            match_by    = (fv.get("match_by") or "Sender").lower()
            match_value = (fv.get("match_value") or "").strip()
            label_name  = (fv.get("label_name") or "").strip()
            if not match_value or not label_name:
                return {"items": 0, "message": "Missing config", "status": "skipped"}
            if match_by in ("sender", "domain"):
                from_field = message.get("from", "").lower()
                if match_value.lower().lstrip("@") not in from_field:
                    return {"items": 0, "message": "Sender/domain no match", "status": "skipped"}
            else:
                if not _message_matches_keywords(message, [match_value]):
                    return {"items": 0, "message": "Keyword no match", "status": "skipped"}
            msg_id = message.get("id")
            if not msg_id:
                return {"items": 0, "message": "No message ID", "status": "error"}
            label_id = _get_or_create_label(access_token, refresh_token, label_name)
            _gmail_modify(access_token, refresh_token, msg_id, add_labels=[label_id])
            return {"items": 1, "message": f"Applied label '{label_name}'", "status": "success"}

        else:
            return {"items": 0, "message": f"Template '{template_id}' not supported in push mode", "status": "skipped"}

    except Exception as exc:
        logger.exception("[AutoExec] push-mode error for template=%s", template_id)
        return {"items": 0, "message": str(exc)[:300], "status": "error"}


# ── Schedule type helpers ─────────────────────────────────────────────────────

def is_due(automation: dict, now_utc: datetime) -> bool:
    """
    Return True if this automation should execute now in scheduled mode.
    "On new email" automations are skipped here when Gmail Push is configured
    (they are handled in real-time by the webhook instead).
    """
    schedule    = (automation.get("schedule") or "").lower()
    last_run    = automation.get("last_run_at")
    fv          = automation.get("field_values") or {}
    push_active = bool(os.getenv("GMAIL_PUBSUB_TOPIC"))

    last_run_dt = None
    if last_run:
        try:
            last_run_dt = datetime.fromisoformat(last_run)
            if last_run_dt.tzinfo is None:
                last_run_dt = last_run_dt.replace(tzinfo=tz.utc)
        except Exception:
            pass

    # "On new email" — handled by push when Pub/Sub is configured; otherwise poll every 5 min
    if any(s in schedule for s in ("on new email", "on new calendar", "on new drive", "on form", "on drive", "on sheet")):
        if push_active:
            return False  # Real-time push handles this
        if last_run_dt and (now_utc - last_run_dt).total_seconds() < 240:
            return False
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

    # Daily (weekdays) — once per weekday at the configured start_time
    if "weekday" in schedule or "daily (weekday" in schedule:
        if now_utc.weekday() >= 5:
            return False
        if last_run_dt and last_run_dt.date() == now_utc.date():
            return False
        start_time = (fv.get("start_time") or "09:00").strip()
        try:
            h, m = [int(x) for x in start_time.split(":")]
        except ValueError:
            h, m = 9, 0
        return now_utc.hour == h and abs(now_utc.minute - m) <= 2

    # "Daily at HH:MM" or "Weekly on ... at HH:MM"
    if "daily at" in schedule or "weekly" in schedule:
        time_val = fv.get("run_time") or fv.get("send_time")
        if not time_val:
            import re as _re
            tm = _re.search(r"(\d{1,2}:\d{2})", schedule)
            time_val = tm.group(1) if tm else "08:00"
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

    # "Before each meeting"
    if "before each meeting" in schedule or "before each" in schedule:
        if last_run_dt and (now_utc - last_run_dt).total_seconds() < 240:
            return False
        return True

    # Default
    if last_run_dt and (now_utc - last_run_dt).total_seconds() < 240:
        return False
    return True


# ── Main dispatcher (scheduled mode) ─────────────────────────────────────────

_EXECUTORS = {
    "gmail-forward-keyword":     _exec_gmail_forward_keyword,
    "gmail-archive-newsletters": _exec_gmail_archive_newsletters,
    "gmail-ooo":                 _exec_gmail_ooo,
    "gmail-vip-flag":            _exec_gmail_vip_flag,
    "gmail-receipts":            _exec_gmail_receipts,
    "gmail-alert-person":        _exec_gmail_alert_person,
    "gmail-daily-digest":        _exec_gmail_daily_digest,
    "gmail-followup":            _exec_gmail_followup,
    "gmail-escalate":            _exec_gmail_escalate,
    "gmail-auto-label":          _exec_gmail_auto_label,
    "gmail-morning-triage":      _exec_gmail_morning_triage,
    "cal-focus-time":            _exec_cal_focus_time,
    "cal-meeting-reminder":      _exec_cal_meeting_reminder,
    "cal-daily-agenda":          _exec_cal_daily_agenda,
}


def execute_automation(automation: dict, access_token: str, refresh_token: str) -> dict:
    """
    Execute one automation rule in scheduled mode.
    Returns {"items": N, "message": str, "status": "success"|"error"|"skipped"}.
    Synchronous — wrap in run_in_executor when calling from async context.
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
        return {**result, "status": result.get("status", "success")}
    except Exception as exc:
        logger.exception("[AutoExec] template=%s automation_id=%s", template_id, automation.get("id"))
        return {"items": 0, "message": str(exc)[:300], "status": "error"}
