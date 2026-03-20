"""
command_executor.py
Executes parsed AI intents against real Google APIs.
Called by /api/command after AI parses the user's natural language command.
"""

import os
import re
import html
import datetime
import base64
import traceback
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

import httplib2
import google_auth_httplib2
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

COMMAND_SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/drive.readonly",
]


# ─── Credential helpers ────────────────────────────────────────────────────

def _build_creds(access_token, refresh_token):
    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        scopes=COMMAND_SCOPES,
    )
    if creds.refresh_token and (creds.expired or creds.expiry is None):
        creds.refresh(Request())
    return creds


def _authed_http(creds):
    http = httplib2.Http(timeout=20)
    return google_auth_httplib2.AuthorizedHttp(creds, http=http)


def _gmail_service(creds):
    return build("gmail", "v1", http=_authed_http(creds), cache_discovery=False)


def _calendar_service(creds):
    return build("calendar", "v3", http=_authed_http(creds), cache_discovery=False)


def _drive_service(creds):
    return build("drive", "v3", http=_authed_http(creds), cache_discovery=False)


# ─── HTML stripping ────────────────────────────────────────────────────────

def _strip_html(raw):
    """
    Convert HTML email body to clean readable plain text.
    - Decodes all HTML entities (&aacute; &ouml; &amp; &#8230; etc.)
    - Inserts newlines for block-level tags (<br>, <p>, <div>, <li>, <tr>)
    - Removes all remaining HTML tags
    - Collapses excessive whitespace
    """
    if not raw:
        return ""

    # 1. Remove entire <style>…</style> and <script>…</script> blocks (content + tags)
    text = re.sub(r'<style\b[^>]*>.*?</style>', '', raw, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r'<script\b[^>]*>.*?</script>', '', text, flags=re.IGNORECASE | re.DOTALL)
    text = re.sub(r'<head\b[^>]*>.*?</head>', '', text, flags=re.IGNORECASE | re.DOTALL)

    # 2. Decode HTML entities (handles named + numeric: &eacute; &#233; &#x00E9;)
    text = html.unescape(text)

    # 4. Replace block-level closing/self-closing tags with newlines before stripping
    text = re.sub(r'<br\s*/?>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</p\s*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</div\s*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</tr\s*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</li\s*>', '\n', text, flags=re.IGNORECASE)
    text = re.sub(r'</h[1-6]\s*>', '\n', text, flags=re.IGNORECASE)

    # 5. Strip all remaining tags
    text = re.sub(r'<[^>]+>', '', text)

    # 6. Decode entities again in case any were double-encoded
    text = html.unescape(text)

    # 7. Normalise whitespace: collapse blank lines, strip line padding
    lines = [line.strip() for line in text.splitlines()]
    # Remove runs of more than 2 blank lines
    cleaned = []
    blank_run = 0
    for line in lines:
        if line == "":
            blank_run += 1
            if blank_run <= 2:
                cleaned.append(line)
        else:
            blank_run = 0
            cleaned.append(line)

    return "\n".join(cleaned).strip()


# ─── Email body extraction ─────────────────────────────────────────────────

def _extract_body(payload, preferred_mime="text/plain"):
    """
    Recursively walk a Gmail message payload to find the body text.
    Returns (text: str, is_html: bool).
    Tries text/plain first; falls back to text/html.
    """
    mime = payload.get("mimeType", "")
    body_data = payload.get("body", {}).get("data", "")

    if mime == preferred_mime and body_data:
        decoded = base64.urlsafe_b64decode(body_data).decode("utf-8", errors="replace")
        return decoded, (preferred_mime == "text/html")

    for part in payload.get("parts", []):
        text, is_html = _extract_body(part, preferred_mime)
        if text:
            return text, is_html

    # Fallback: if we were looking for plain text and found nothing, try HTML
    if preferred_mime == "text/plain":
        return _extract_body(payload, "text/html")

    return "", False


def _parse_message(m):
    """Convert a raw Gmail API message into a clean display dict."""
    headers = {h["name"]: h["value"] for h in m.get("payload", {}).get("headers", [])}
    body_raw, is_html = _extract_body(m.get("payload", {}))

    # Strip HTML tags and decode entities if body came from an HTML part
    body = _strip_html(body_raw) if is_html else body_raw

    return {
        "id": m["id"],
        "subject": headers.get("Subject", "(No Subject)"),
        "from": headers.get("From", "Unknown Sender"),
        "to": headers.get("To", ""),
        "date": headers.get("Date", ""),
        "snippet": m.get("snippet", ""),
        "body": body[:3000] if body else m.get("snippet", ""),
    }


# ─── Recipient name → email resolution ────────────────────────────────────

def find_recipient_candidates(creds, name):
    """
    Search Gmail sent/received history for email addresses matching name.
    Runs ALL search strategies (no early break) so contacts found via different
    strategies (sent vs received, full name vs partial) are all merged.
    Returns list of {"email": ..., "display_name": ..., "count": ...} sorted by count desc.
    """
    svc = _gmail_service(creds)
    email_data = {}  # email -> {display_name, count}

    def parse_addresses(header_val):
        pairs = []
        for m in re.finditer(r'"?([^"<,]*?)"?\s*<([\w.+\-]+@[\w.\-]+\.[a-zA-Z]{2,})>', header_val or ""):
            pairs.append((m.group(1).strip(), m.group(2).strip()))
        found = {e for _, e in pairs}
        for m in re.finditer(r'\b([\w.+\-]+@[\w.\-]+\.[a-zA-Z]{2,})\b', header_val or ""):
            if m.group(1) not in found:
                pairs.append(("", m.group(1)))
        return pairs

    # Patterns that indicate automated/system senders — never suggest these
    _AUTO = (
        "noreply", "no-reply", "donotreply", "do-not-reply",
        "invitations@", "notifications@", "notification@",
        "mailer@", "bounce@", "automated@", "newsletter@",
        "reply@", "updates@", "alert@", "info@noreply",
        "@linkedin.com", "@facebookmail.com", "@twitter.com",
    )

    def _is_automated(email: str) -> bool:
        el = email.lower()
        return any(p in el for p in _AUTO)

    def collect(query, header_key):
        try:
            res = svc.users().messages().list(userId="me", q=query, maxResults=10).execute()
            for msg_ref in res.get("messages", []):
                m = svc.users().messages().get(
                    userId="me", id=msg_ref["id"],
                    format="metadata",
                    metadataHeaders=["To", "From"],
                ).execute()
                headers = {h["name"]: h["value"] for h in m.get("payload", {}).get("headers", [])}
                for disp, email in parse_addresses(headers.get(header_key, "")):
                    if _is_automated(email):
                        continue
                    if email not in email_data:
                        email_data[email] = {"display_name": disp or email, "count": 0}
                    email_data[email]["count"] += 1
                    if disp and not email_data[email]["display_name"]:
                        email_data[email]["display_name"] = disp
        except Exception:
            pass

    # Run ALL strategies — no early break so contacts from each source are merged
    collect(f'to:"{name}" in:sent', "To")
    collect(f'from:"{name}"', "From")
    collect(f'"{name}" in:inbox', "From")

    # Fallback: search word-by-word for partial name matches
    # e.g. "aslam khan" → also try to:aslam in:sent, to:khan in:sent
    if not email_data:
        words = [w for w in name.split() if len(w) >= 3]
        for word in words:
            collect(f'to:{word} in:sent', "To")
            collect(f'from:{word}', "From")

    return sorted(
        [{"email": e, "display_name": d["display_name"], "count": d["count"]} for e, d in email_data.items()],
        key=lambda x: x["count"],
        reverse=True,
    )


def find_file_candidates(creds, filename):
    """
    Search Drive for files matching filename.
    Returns list of file metadata dicts, ordered by modifiedTime desc.
    """
    svc = _drive_service(creds)
    safe = filename.replace("'", "\\'")
    seen_ids = set()
    results = []

    for q in [
        f"name = '{safe}' and trashed=false",
        f"name contains '{safe}' and trashed=false",
    ]:
        res = svc.files().list(
            q=q,
            pageSize=5,
            orderBy="modifiedTime desc",
            fields="files(id,name,mimeType,webViewLink,modifiedTime)",
        ).execute()
        for f in res.get("files", []):
            if f["id"] not in seen_ids:
                results.append(f)
                seen_ids.add(f["id"])

    return results[:5]


# ─── Gmail operations ──────────────────────────────────────────────────────

def gmail_search(access_token, refresh_token, query, max_results=10):
    creds = _build_creds(access_token, refresh_token)
    svc = _gmail_service(creds)

    list_result = svc.users().messages().list(
        userId="me", q=query, maxResults=max_results
    ).execute()

    messages = []
    for msg_ref in list_result.get("messages", []):
        m = svc.users().messages().get(
            userId="me", id=msg_ref["id"], format="full"
        ).execute()
        messages.append(_parse_message(m))

    return {
        "type": "gmail_search",
        "messages": messages,
        "count": len(messages),
        "query": query,
    }


def gmail_send(access_token, refresh_token, to, subject, body):
    creds = _build_creds(access_token, refresh_token)
    svc = _gmail_service(creds)

    message = MIMEText(body, "plain")
    message["to"] = to
    message["subject"] = subject

    raw = base64.urlsafe_b64encode(message.as_bytes()).decode()
    sent = svc.users().messages().send(
        userId="me", body={"raw": raw}
    ).execute()

    return {
        "type": "gmail_send",
        "sent": True,
        "message_id": sent.get("id"),
        "to": to,
        "subject": subject,
    }


def gmail_send_with_attachment(access_token, refresh_token, to, subject, body,
                                attachment_bytes, attachment_filename, attachment_content_type):
    """Send an email with a file attachment."""
    creds = _build_creds(access_token, refresh_token)
    svc = _gmail_service(creds)

    msg = MIMEMultipart()
    msg["to"] = to
    msg["subject"] = subject
    msg.attach(MIMEText(body, "plain"))

    part = MIMEBase(*attachment_content_type.split("/", 1))
    part.set_payload(attachment_bytes)
    encoders.encode_base64(part)
    part.add_header("Content-Disposition", "attachment", filename=attachment_filename)
    msg.attach(part)

    raw = base64.urlsafe_b64encode(msg.as_bytes()).decode()
    sent = svc.users().messages().send(
        userId="me", body={"raw": raw}
    ).execute()

    return {
        "type": "gmail_send",
        "sent": True,
        "message_id": sent.get("id"),
        "to": to,
        "subject": subject,
    }


def gmail_archive(access_token, refresh_token, query, max_results=25):
    creds = _build_creds(access_token, refresh_token)
    svc = _gmail_service(creds)

    list_result = svc.users().messages().list(
        userId="me", q=f"in:inbox {query}", maxResults=max_results
    ).execute()

    msgs = list_result.get("messages", [])
    archived = 0
    for msg in msgs:
        svc.users().messages().modify(
            userId="me",
            id=msg["id"],
            body={"removeLabelIds": ["INBOX"]},
        ).execute()
        archived += 1

    return {
        "type": "gmail_archive",
        "archived": archived,
        "query": query,
    }


# ─── Drive operations ────────────────────────────────────────────────────────

# Maps Google Workspace MIME types to export formats (for reading as text)
_GDRIVE_EXPORT_MIME = {
    "application/vnd.google-apps.document":     "text/plain",
    "application/vnd.google-apps.spreadsheet":  "text/csv",
    "application/vnd.google-apps.presentation": "text/plain",
}

# Maps Google Workspace MIME types to PDF export (for attachment)
_GDRIVE_PDF_EXPORTABLE = {
    "application/vnd.google-apps.document",
    "application/vnd.google-apps.spreadsheet",
    "application/vnd.google-apps.presentation",
}

_GDRIVE_TYPE_LABELS = {
    "application/vnd.google-apps.document":     "Google Doc",
    "application/vnd.google-apps.spreadsheet":  "Google Sheet",
    "application/vnd.google-apps.presentation": "Google Slides",
    "application/vnd.google-apps.folder":       "Folder",
    "application/pdf":                          "PDF",
}


def drive_read_file(creds, file_id, mime_type):
    """
    Read the content of a Drive file as plain text.
    - Google Docs/Sheets/Slides: exported via the Export API
    - Plain text files: downloaded directly
    - Binary files (PDF, images): returns None (can't inline)
    """
    svc = _drive_service(creds)

    if mime_type in _GDRIVE_EXPORT_MIME:
        export_mime = _GDRIVE_EXPORT_MIME[mime_type]
        content = svc.files().export(fileId=file_id, mimeType=export_mime).execute()
        if isinstance(content, bytes):
            return content.decode("utf-8", errors="replace")
        return str(content)

    if mime_type.startswith("text/"):
        content = svc.files().get_media(fileId=file_id).execute()
        if isinstance(content, bytes):
            return content.decode("utf-8", errors="replace")
        return str(content)

    # Binary file — cannot be inlined into email body
    return None


def drive_get_attachment(creds, file_id, mime_type, file_name):
    """
    Download a Drive file as bytes suitable for email attachment.
    - Native Google Workspace files (Docs/Sheets/Slides): no direct binary, export as PDF.
    - Everything else (PDF, DOCX, XLSX, CSV, PNG, ZIP, etc.): download original, zero conversion.
    Returns (bytes_data, attachment_filename, content_type).
    """
    svc = _drive_service(creds)

    if mime_type in _GDRIVE_PDF_EXPORTABLE:
        # Native Google file — no binary exists, must export
        content = svc.files().export(fileId=file_id, mimeType="application/pdf").execute()
        attachment_name = file_name if file_name.lower().endswith(".pdf") else file_name + ".pdf"
        return content if isinstance(content, bytes) else content.encode(), attachment_name, "application/pdf"

    # All other files: download the original binary as-is, no conversion
    content = svc.files().get_media(fileId=file_id).execute()
    return content if isinstance(content, bytes) else content.encode(), file_name, mime_type


def drive_find_and_read(access_token, refresh_token, filename):
    """
    Search Drive for a file by name and read its content.
    Tries exact match first, then 'contains' match.
    Returns a dict with 'found', 'file_name', 'content', etc.
    """
    creds = _build_creds(access_token, refresh_token)
    svc = _drive_service(creds)

    # Escape single quotes in filename for Drive query
    safe_name = filename.replace("'", "\\'")

    for drive_q in [
        f"name = '{safe_name}' and trashed=false",
        f"name contains '{safe_name}' and trashed=false",
    ]:
        result = svc.files().list(
            q=drive_q,
            pageSize=1,
            fields="files(id,name,mimeType,webViewLink)",
        ).execute()
        files = result.get("files", [])
        if files:
            f = files[0]
            content = drive_read_file(creds, f["id"], f["mimeType"])
            label = _GDRIVE_TYPE_LABELS.get(f["mimeType"], f["mimeType"].split("/")[-1])
            return {
                "found": True,
                "file_name": f["name"],
                "file_id": f["id"],
                "mime_type": f["mimeType"],
                "file_type": label,
                "link": f.get("webViewLink", ""),
                "content": content,
            }

    return {"found": False, "filename": filename}


def drive_search(access_token, refresh_token, query, max_results=10):
    """Search Google Drive for files matching the query."""
    creds = _build_creds(access_token, refresh_token)
    svc = _drive_service(creds)

    safe_q = query.replace("'", "\\'") if query else ""
    drive_q = f"fullText contains '{safe_q}' and trashed=false" if safe_q else "trashed=false"

    result = svc.files().list(
        q=drive_q,
        pageSize=max_results,
        fields="files(id,name,mimeType,modifiedTime,webViewLink)",
    ).execute()

    files = []
    for f in result.get("files", []):
        mime = f.get("mimeType", "")
        file_type = _GDRIVE_TYPE_LABELS.get(mime, mime.split("/")[-1])
        files.append({
            "id": f.get("id"),
            "name": f.get("name"),
            "type": file_type,
            "modified": f.get("modifiedTime", ""),
            "link": f.get("webViewLink", ""),
        })

    return {
        "type": "drive_search",
        "files": files,
        "count": len(files),
        "query": query,
    }


# ─── Calendar operations ────────────────────────────────────────────────────

def calendar_search(access_token, refresh_token, query, max_results=10):
    creds = _build_creds(access_token, refresh_token)
    svc = _calendar_service(creds)

    now = datetime.datetime.utcnow().isoformat() + "Z"
    result = svc.events().list(
        calendarId="primary",
        q=query,
        timeMin=now,
        maxResults=max_results,
        singleEvents=True,
        orderBy="startTime",
    ).execute()

    events = []
    for e in result.get("items", []):
        start = e.get("start", {})
        end = e.get("end", {})
        events.append({
            "id": e.get("id"),
            "title": e.get("summary", "(No title)"),
            "start": start.get("dateTime") or start.get("date", ""),
            "end": end.get("dateTime") or end.get("date", ""),
            "location": e.get("location", ""),
            "attendees": [a.get("email", "") for a in e.get("attendees", [])],
            "link": e.get("htmlLink", ""),
        })

    return {
        "type": "calendar_search",
        "events": events,
        "count": len(events),
        "query": query,
    }


def calendar_create(access_token, refresh_token, summary, start_iso, end_iso,
                    attendees=None, description="", user_timezone="UTC"):
    creds = _build_creds(access_token, refresh_token)
    svc = _calendar_service(creds)

    event_body = {
        "summary": summary,
        "description": description,
        "start": {"dateTime": start_iso, "timeZone": user_timezone},
        "end": {"dateTime": end_iso, "timeZone": user_timezone},
    }
    if attendees:
        # Filter empty/invalid entries — only real email addresses
        valid = [a.strip() for a in attendees if a.strip() and "@" in a]
        if valid:
            event_body["attendees"] = [{"email": a} for a in valid]

    created = svc.events().insert(
        calendarId="primary", body=event_body
    ).execute()

    return {
        "type": "calendar_create",
        "created": True,
        "event_id": created.get("id"),
        "title": created.get("summary"),
        "start": created.get("start", {}).get("dateTime", ""),
        "link": created.get("htmlLink", ""),
    }


# ─── Intent routing helpers ────────────────────────────────────────────────

def _build_gmail_query(params):
    parts = []
    if params.get("from") or params.get("sender"):
        parts.append(f"from:({params.get('from') or params.get('sender')})")
    if params.get("to"):
        parts.append(f"to:({params['to']})")
    if params.get("subject"):
        parts.append(f"subject:({params['subject']})")
    if params.get("query"):
        parts.append(params["query"])
    if params.get("label"):
        parts.append(f"label:{params['label']}")
    if params.get("is_unread"):
        parts.append("is:unread")
    return " ".join(parts) if parts else "in:inbox"


def _resolve_datetime(dt_str, offset_hours=0):
    """
    Parse an AI-supplied datetime string.
    Returns a naive ISO string (no Z / no UTC offset) so the caller can attach
    the user's local timezone via the Google Calendar API's `timeZone` field.
    Only the fallback default time uses UTC.
    """
    if not dt_str:
        base = datetime.datetime.utcnow() + datetime.timedelta(days=1)
        base = base.replace(hour=10, minute=0, second=0, microsecond=0)
        return (base + datetime.timedelta(hours=offset_hours)).isoformat()

    # Strip any timezone markers (Z, +HH:MM, -HH:MM) — the AI returns local time
    dt_str = str(dt_str).strip().replace(" ", "T")
    dt_str = re.sub(r'Z$', '', dt_str)
    dt_str = re.sub(r'[+-]\d{2}:?\d{2}$', '', dt_str)

    try:
        parsed = datetime.datetime.fromisoformat(dt_str)
        return (parsed + datetime.timedelta(hours=offset_hours)).isoformat()
    except ValueError:
        base = datetime.datetime.utcnow() + datetime.timedelta(days=1)
        base = base.replace(hour=10, minute=0, second=0, microsecond=0)
        return (base + datetime.timedelta(hours=offset_hours)).isoformat()


# ─── Main router ──────────────────────────────────────────────────────────

def execute_command(intent, access_token, refresh_token, overrides=None):
    """
    Route an AI-parsed intent to the correct Google API call.
    Returns a result dict with a 'type' key.
    Raises exceptions on hard failures — caller converts to HTTP errors.
    """
    service = (intent.get("service") or "").lower().strip()
    action  = (intent.get("action")  or "").lower().strip()
    params  = intent.get("parameters") or {}

    try:
        # ── Gmail ──────────────────────────────────────────────────────────
        if service == "gmail":

            if action in ("send", "reply"):
                to      = (params.get("to") or "").strip()
                subject = (params.get("subject") or "").strip()
                body    = (params.get("body") or params.get("message") or params.get("content") or "").strip()

                drive_filename = (
                    params.get("drive_file") or params.get("attachment") or
                    params.get("file") or params.get("filename") or ""
                ).strip()

                _overrides = overrides or {}
                creds = _build_creds(access_token, refresh_token)

                # Apply subject/body overrides from confirmed preview edits
                if _overrides.get("subject"):
                    subject = _overrides["subject"].strip()
                if _overrides.get("body"):
                    body = _overrides["body"].strip()

                # ── Step 1: Resolve recipient ────────────────────────────────
                if not to:
                    return {"type": "error", "error": "No recipient specified. Please say who to send the email to."}

                recipient_override = _overrides.get("recipient_email", "").strip()
                if recipient_override:
                    to = recipient_override
                elif "@" not in to:
                    # Name given — always disambiguate, never silently pick
                    candidates = find_recipient_candidates(creds, to)
                    if not candidates:
                        return {
                            "type": "error",
                            "error": f"No email address found for '{to}' in your Gmail history. Please use their email address directly.",
                        }
                    return {
                        "type": "needs_disambiguation",
                        "kind": "recipient",
                        "query": to,
                        "candidates": candidates,
                        "current_overrides": _overrides,
                    }

                # ── Step 2: Resolve Drive file ───────────────────────────────
                resolved_file_meta = None
                if drive_filename:
                    file_id_override = _overrides.get("file_id", "").strip()
                    if file_id_override:
                        svc = _drive_service(creds)
                        resolved_file_meta = svc.files().get(
                            fileId=file_id_override,
                            fields="id,name,mimeType,webViewLink",
                        ).execute()
                    else:
                        candidates = find_file_candidates(creds, drive_filename)
                        if not candidates:
                            return {
                                "type": "error",
                                "error": f"No file named '{drive_filename}' found in your Google Drive.",
                            }
                        if len(candidates) > 1:
                            return {
                                "type": "needs_disambiguation",
                                "kind": "file",
                                "query": drive_filename,
                                "candidates": [
                                    {
                                        "id": f["id"],
                                        "name": f["name"],
                                        "type": _GDRIVE_TYPE_LABELS.get(f["mimeType"], f["mimeType"].split("/")[-1]),
                                        "modified": f.get("modifiedTime", ""),
                                    }
                                    for f in candidates
                                ],
                                "current_overrides": {**_overrides, "recipient_email": to},
                            }
                        resolved_file_meta = candidates[0]

                # ── Step 3: Send with attachment or plain ────────────────────
                if resolved_file_meta:
                    att_bytes, att_filename, att_content_type = drive_get_attachment(
                        creds, resolved_file_meta["id"], resolved_file_meta["mimeType"], resolved_file_meta["name"]
                    )
                    if not subject:
                        subject = resolved_file_meta["name"]
                    email_body = body or f"Please find {resolved_file_meta['name']} attached."
                    result = gmail_send_with_attachment(
                        access_token, refresh_token, to, subject, email_body,
                        att_bytes, att_filename, att_content_type,
                    )
                    result["drive_file_used"] = resolved_file_meta["name"]
                    result["drive_file_link"] = resolved_file_meta.get("webViewLink", "")
                    result["attachment_filename"] = att_filename
                    return result

                if not subject:
                    subject = "(No Subject)"
                if not body:
                    body = f"Hi,\n\nJust wanted to send you a quick note regarding: {subject}.\n\nBest regards"
                return gmail_send(access_token, refresh_token, to, subject, body)

            elif action in ("search", "find", "fetch", "get", "summarize", "other"):
                query = _build_gmail_query(params)
                max_r = int(params.get("max_results", 10))
                return gmail_search(access_token, refresh_token, query, max_results=min(max_r, 20))

            elif action in ("archive", "delete", "move", "label"):
                q = _build_gmail_query(params)
                if q == "in:inbox":
                    return {"type": "error", "error": "Please specify which emails to archive (e.g. sender or subject)."}
                return gmail_archive(access_token, refresh_token, q)

            else:
                query = _build_gmail_query(params)
                return gmail_search(access_token, refresh_token, query)

        # ── Calendar ────────────────────────────────────────────────────────
        elif service == "calendar":
            if action in ("schedule", "create", "add", "book"):
                _ov = overrides or {}
                # _cal_* overrides come from the frontend preview modal edits
                user_tz = _ov.get("_timezone") or params.get("_timezone") or "UTC"

                summary = (
                    _ov.get("_cal_summary") or
                    params.get("summary") or params.get("title") or
                    params.get("event") or params.get("meeting") or "New Meeting"
                )
                start_raw = (
                    _ov.get("_cal_start_time") or
                    params.get("start_time") or params.get("start") or
                    params.get("datetime") or params.get("date")
                )
                end_raw = (
                    _ov.get("_cal_end_time") or
                    params.get("end_time") or params.get("end")
                )
                start_iso = _resolve_datetime(start_raw)
                if end_raw:
                    end_iso = _resolve_datetime(end_raw)
                else:
                    start_dt = datetime.datetime.fromisoformat(start_iso)
                    end_iso = (start_dt + datetime.timedelta(hours=1)).isoformat()

                if _ov.get("_cal_attendees") is not None:
                    attendees = _ov["_cal_attendees"]
                else:
                    attendees = params.get("attendees") or []
                    if isinstance(attendees, str):
                        attendees = [a.strip() for a in attendees.split(",")]
                    for key in ("attendee", "with"):
                        if params.get(key):
                            attendees.append(params[key])

                description = (
                    _ov.get("_cal_description") or
                    params.get("description") or params.get("notes") or ""
                )
                return calendar_create(
                    access_token, refresh_token,
                    summary, start_iso, end_iso, attendees, description,
                    user_timezone=user_tz,
                )

            elif action in ("search", "find", "list"):
                query = (
                    params.get("query") or params.get("title") or
                    params.get("summary") or params.get("event") or ""
                )
                return calendar_search(access_token, refresh_token, query)

            else:
                return calendar_search(
                    access_token, refresh_token,
                    params.get("query") or params.get("title") or "",
                )

        # ── Drive ─────────────────────────────────────────────────────────
        elif service == "drive":
            query = (
                params.get("query") or params.get("filename") or
                params.get("name") or params.get("file") or ""
            )
            return drive_search(access_token, refresh_token, query)

        else:
            return {"type": "error", "error": f"Unknown service '{service}'. Supported: Gmail, Calendar, Drive."}

    except Exception as e:
        print(f"[CommandExecutor] {service}/{action} failed:\n{traceback.format_exc()}")
        raise
