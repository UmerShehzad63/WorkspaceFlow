import os
import smtplib
from email.mime.text import MIMEText
from email.mime.multipart import MIMEMultipart
from email.mime.base import MIMEBase
from email import encoders

ADMIN_EMAIL   = os.getenv("ADMIN_EMAIL",   "")
SMTP_EMAIL    = os.getenv("SMTP_EMAIL",    "")
# Gmail App Passwords are shown with spaces (e.g. "mvpq cucp uhxu lozd") but
# smtplib.login() requires the raw 16-character token with no spaces.
SMTP_PASSWORD = os.getenv("SMTP_PASSWORD", "").replace(" ", "")


def send_automation_request_email(
    requester_name: str,
    requester_email: str,
    title: str,
    description: str,
    trigger_app: str,
    action_app: str,
    timestamp: str,
):
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        raise RuntimeError(
            "SMTP credentials not configured. "
            "Set SMTP_EMAIL and SMTP_PASSWORD (Gmail App Password) in your .env file."
        )
    if not ADMIN_EMAIL:
        raise RuntimeError(
            "ADMIN_EMAIL not configured. "
            "Set ADMIN_EMAIL in your .env file."
        )

    subject = f"New Automation Request from {requester_name or requester_email}"

    # ── Plain-text version ───────────────────────────────────────────────
    plain = f"""\
New Automation Request
======================

User:         {requester_name or 'N/A'} ({requester_email})
Title:        {title or '(untitled)'}
Trigger App:  {trigger_app or 'Not specified'}
Action App:   {action_app  or 'Not specified'}
Timestamp:    {timestamp}

Description:
{description}
"""

    # ── HTML version ─────────────────────────────────────────────────────
    def row(label, value, bg='#ffffff'):
        return (
            f'<tr style="background:{bg}">'
            f'<td style="padding:10px 14px;font-weight:600;color:#555;white-space:nowrap;width:140px">{label}</td>'
            f'<td style="padding:10px 14px;color:#111">{value}</td>'
            f'</tr>'
        )

    html = f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="max-width:620px;margin:32px auto;background:#fff;border-radius:10px;
                border:1px solid #e0e0e0;overflow:hidden">
    <tr>
      <td style="background:#4f7df9;padding:22px 28px">
        <h2 style="margin:0;color:#fff;font-size:18px">New Automation Request</h2>
      </td>
    </tr>
    <tr>
      <td style="padding:0">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          {row('User',        f'{requester_name or "N/A"} ({requester_email})')}
          {row('Title',       title or '(untitled)',        '#f9f9f9')}
          {row('Trigger App', trigger_app or 'Not specified')}
          {row('Action App',  action_app  or 'Not specified', '#f9f9f9')}
          {row('Timestamp',   timestamp)}
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px;border-top:1px solid #eee">
        <p style="margin:0 0 8px;font-weight:600;color:#555">Description</p>
        <p style="margin:0;color:#222;line-height:1.6;white-space:pre-wrap">{description}</p>
      </td>
    </tr>
    <tr>
      <td style="padding:14px 28px;background:#f9f9f9;border-top:1px solid #eee">
        <p style="margin:0;font-size:12px;color:#999">
          Sent by WorkspaceFlow · {timestamp}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = SMTP_EMAIL
    msg['To']      = ADMIN_EMAIL
    msg.attach(MIMEText(plain, 'plain'))
    msg.attach(MIMEText(html,  'html'))

    # Use STARTTLS on port 587 (works with all standard Gmail accounts)
    with smtplib.SMTP('smtp.gmail.com', 587) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(SMTP_EMAIL, SMTP_PASSWORD)
        smtp.sendmail(SMTP_EMAIL, ADMIN_EMAIL, msg.as_string())


def send_preview_email(user_email: str, user_name: str, briefing: dict, note: str = None):
    """Send a formatted morning briefing preview to the user's own email address."""
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        raise RuntimeError(
            "SMTP credentials not configured. "
            "Set SMTP_EMAIL and SMTP_PASSWORD in your .env file."
        )

    subject = "📋 Your WorkspaceFlow Morning Briefing Preview"

    schedule    = briefing.get("schedule", [])
    last_24h    = briefing.get("last_24h") or {}
    older       = briefing.get("older")    or {}
    urgent_24h  = last_24h.get("urgent_items") or []
    summary_24h = (last_24h.get("summary") or "No summary available.").strip()
    urgent_old  = older.get("urgent_items") or []
    summary_old = (older.get("summary") or "").strip()

    def li(items):
        return "".join(
            f'<li style="margin-bottom:6px;line-height:1.5">{i}</li>'
            for i in items
        )

    schedule_rows = "".join(
        f'<tr><td style="padding:6px 10px;color:#4f7df9;font-weight:600;white-space:nowrap;width:80px">{ev.get("time","All Day")}</td>'
        f'<td style="padding:6px 10px;color:#222">{ev.get("title","Event")}</td></tr>'
        for ev in schedule[:5]
    ) or '<tr><td colspan="2" style="padding:10px;color:#888;font-style:italic">No meetings today.</td></tr>'

    note_block = ""
    if note:
        note_block = (
            f'<tr><td style="padding:16px 28px;background:#f0f4ff;border-bottom:1px solid #e0e8ff">'
            f'<p style="margin:0;font-size:14px;color:#1e3a8a;line-height:1.6">'
            f'📝 {note}</p></td></tr>'
        )

    html = f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="max-width:600px;margin:32px auto;background:#fff;border-radius:10px;
                border:1px solid #e0e0e0;overflow:hidden">
    <tr>
      <td style="background:#0a0a0f;padding:22px 28px">
        <h2 style="margin:0;color:#fff;font-size:18px">⚡ WorkspaceFlow · Morning Briefing</h2>
        <p style="margin:4px 0 0;color:#888;font-size:13px">Hi {user_name or user_email} — here&apos;s your preview</p>
      </td>
    </tr>
    {note_block}

    <!-- Schedule -->
    <tr>
      <td style="padding:20px 28px 0">
        <h3 style="margin:0 0 12px;font-size:14px;color:#4f7df9;text-transform:uppercase;letter-spacing:.06em">📅 Today&apos;s Schedule</h3>
        <table width="100%" cellpadding="0" cellspacing="0"
               style="background:#f9f9f9;border-radius:8px;border:1px solid #eee;border-collapse:collapse">
          {schedule_rows}
        </table>
      </td>
    </tr>

    <!-- Last 24h Priority -->
    {"" if not urgent_24h else f'''
    <tr>
      <td style="padding:20px 28px 0">
        <h3 style="margin:0 0 10px;font-size:14px;color:#f97316;text-transform:uppercase;letter-spacing:.06em">⚡ Priority Items · Last 24h</h3>
        <ul style="margin:0;padding:0 0 0 18px;color:#222">{li(urgent_24h[:5])}</ul>
      </td>
    </tr>'''}

    <!-- Inbox Summary 24h -->
    <tr>
      <td style="padding:16px 28px 0">
        <h3 style="margin:0 0 8px;font-size:14px;color:#555;text-transform:uppercase;letter-spacing:.06em">📫 Inbox Summary · Last 24h</h3>
        <p style="margin:0;color:#333;line-height:1.6;font-size:14px">{summary_24h}</p>
      </td>
    </tr>

    {"" if not urgent_old else f'''
    <!-- Older Priority -->
    <tr>
      <td style="padding:16px 28px 0">
        <h3 style="margin:0 0 10px;font-size:14px;color:#555;text-transform:uppercase;letter-spacing:.06em">📌 Older Priorities</h3>
        <ul style="margin:0;padding:0 0 0 18px;color:#222">{li(urgent_old[:3])}</ul>
      </td>
    </tr>'''}

    {"" if not summary_old else f'''
    <tr>
      <td style="padding:12px 28px 0">
        <p style="margin:0;color:#555;line-height:1.6;font-size:14px">{summary_old}</p>
      </td>
    </tr>'''}

    <!-- Footer -->
    <tr>
      <td style="padding:20px 28px;border-top:1px solid #eee;margin-top:16px;background:#f9f9f9">
        <p style="margin:0;font-size:12px;color:#999">
          Sent by <strong>WorkspaceFlow</strong> · Your AI-powered workspace briefing
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    plain = f"WorkspaceFlow Morning Briefing\n\nSchedule: {len(schedule)} event(s)\n\n{summary_24h}"

    msg = MIMEMultipart('alternative')
    msg['Subject'] = subject
    msg['From']    = SMTP_EMAIL
    msg['To']      = user_email
    msg.attach(MIMEText(plain, 'plain'))
    msg.attach(MIMEText(html,  'html'))

    with smtplib.SMTP('smtp.gmail.com', 587) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(SMTP_EMAIL, SMTP_PASSWORD)
        smtp.sendmail(SMTP_EMAIL, user_email, msg.as_string())


def send_support_email(
    user_name: str,
    user_email: str,
    subject_type: str,
    description: str,
    attachments: list,  # list of (filename, bytes, mime_type)
    timestamp: str,
):
    if not SMTP_EMAIL or not SMTP_PASSWORD:
        raise RuntimeError(
            "SMTP credentials not configured. "
            "Set SMTP_EMAIL and SMTP_PASSWORD in your .env file."
        )
    if not ADMIN_EMAIL:
        raise RuntimeError(
            "ADMIN_EMAIL not configured. "
            "Set ADMIN_EMAIL in your .env file."
        )

    email_subject = f"[WorkspaceFlow Support] {subject_type} from {user_name or user_email}"

    plain = f"""\
Support Request
===============

User:         {user_name or 'N/A'} ({user_email})
Subject:      {subject_type}
Timestamp:    {timestamp}

Message:
{description}
"""

    html = f"""\
<!DOCTYPE html>
<html>
<body style="margin:0;padding:0;font-family:Arial,sans-serif;background:#f4f4f4">
  <table width="100%" cellpadding="0" cellspacing="0"
         style="max-width:620px;margin:32px auto;background:#fff;border-radius:10px;
                border:1px solid #e0e0e0;overflow:hidden">
    <tr>
      <td style="background:#4f7df9;padding:22px 28px">
        <h2 style="margin:0;color:#fff;font-size:18px">Support Request: {subject_type}</h2>
      </td>
    </tr>
    <tr>
      <td style="padding:20px 28px 0">
        <table width="100%" cellpadding="0" cellspacing="0" style="border-collapse:collapse">
          <tr>
            <td style="padding:8px 0;font-weight:600;color:#555;width:100px">User:</td>
            <td style="padding:8px 0;color:#111">{user_name or 'N/A'} ({user_email})</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:600;color:#555">Type:</td>
            <td style="padding:8px 0;color:#111">{subject_type}</td>
          </tr>
          <tr>
            <td style="padding:8px 0;font-weight:600;color:#555">Sent:</td>
            <td style="padding:8px 0;color:#111">{timestamp}</td>
          </tr>
        </table>
      </td>
    </tr>
    <tr>
      <td style="padding:18px 28px;border-top:1px solid #eee;margin-top:16px">
        <p style="margin:0 0 8px;font-weight:600;color:#555">Message</p>
        <p style="margin:0;color:#222;line-height:1.6;white-space:pre-wrap">{description}</p>
      </td>
    </tr>
    {'<tr><td style="padding:12px 28px;border-top:1px solid #eee"><p style="margin:0;font-size:12px;color:#999">📎 ' + str(len(attachments)) + ' attachment(s) included</p></td></tr>' if attachments else ''}
    <tr>
      <td style="padding:14px 28px;background:#f9f9f9;border-top:1px solid #eee">
        <p style="margin:0;font-size:12px;color:#999">
          Sent by WorkspaceFlow · {timestamp}
        </p>
      </td>
    </tr>
  </table>
</body>
</html>
"""

    msg = MIMEMultipart('mixed')
    msg['Subject'] = email_subject
    msg['From']    = SMTP_EMAIL
    msg['To']      = ADMIN_EMAIL

    alt_part = MIMEMultipart('alternative')
    alt_part.attach(MIMEText(plain, 'plain'))
    alt_part.attach(MIMEText(html, 'html'))
    msg.attach(alt_part)

    for filename, data, mime_type in attachments:
        main_type, sub_type = mime_type.split('/', 1) if '/' in mime_type else ('application', 'octet-stream')
        part = MIMEBase(main_type, sub_type)
        part.set_payload(data)
        encoders.encode_base64(part)
        part.add_header('Content-Disposition', 'attachment', filename=filename)
        msg.attach(part)

    with smtplib.SMTP('smtp.gmail.com', 587) as smtp:
        smtp.ehlo()
        smtp.starttls()
        smtp.login(SMTP_EMAIL, SMTP_PASSWORD)
        smtp.sendmail(SMTP_EMAIL, ADMIN_EMAIL, msg.as_string())
