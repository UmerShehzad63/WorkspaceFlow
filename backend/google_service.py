import os
import time
import datetime as dt
import concurrent.futures
import httplib2
import google_auth_httplib2
from googleapiclient.discovery import build
from google.oauth2.credentials import Credentials
from google.auth.transport.requests import Request

_SCOPES = [
    "https://www.googleapis.com/auth/gmail.modify",
    "https://www.googleapis.com/auth/gmail.send",
    "https://www.googleapis.com/auth/calendar.events",
    "https://www.googleapis.com/auth/drive.readonly",
]


def _build_authed_http(access_token, refresh_token, timeout=20):
    """Build a per-thread authenticated HTTP client with credential refresh."""
    creds = Credentials(
        token=access_token,
        refresh_token=refresh_token,
        token_uri="https://oauth2.googleapis.com/token",
        client_id=os.getenv("GOOGLE_CLIENT_ID"),
        client_secret=os.getenv("GOOGLE_CLIENT_SECRET"),
        scopes=_SCOPES,
    )
    if creds.refresh_token and (creds.expired or creds.expiry is None):
        creds.refresh(Request())
    http = httplib2.Http(timeout=timeout)
    return google_auth_httplib2.AuthorizedHttp(creds, http=http)


def _format_event_time(ev):
    """Return a human-readable time string for a calendar event (cross-platform)."""
    start = ev.get('start', {})
    start_str = start.get('dateTime', '')
    if not start_str:
        return 'All Day'
    try:
        d = dt.datetime.fromisoformat(start_str.replace('Z', '+00:00'))
        period = 'AM' if d.hour < 12 else 'PM'
        hour12 = d.hour % 12 or 12
        return f"{hour12}:{d.minute:02d} {period}"
    except (ValueError, TypeError):
        return 'All Day'


def fetch_schedule_only(access_token, refresh_token):
    """Fast path: only fetch today's calendar events — no Gmail, no AI."""
    authed_http = _build_authed_http(access_token, refresh_token, timeout=10)
    calendar_service = build('calendar', 'v3', http=authed_http, cache_discovery=False)

    now      = dt.datetime.utcnow().isoformat() + 'Z'
    end_day  = (dt.datetime.utcnow() + dt.timedelta(hours=24)).isoformat() + 'Z'
    result   = calendar_service.events().list(
        calendarId='primary', timeMin=now, timeMax=end_day,
        singleEvents=True, orderBy='startTime', maxResults=10,
    ).execute()

    return [
        {'time': _format_event_time(ev), 'title': ev.get('summary', 'Untitled Event')}
        for ev in result.get('items', [])
    ]


def _fetch_calendar_events(access_token, refresh_token):
    """Thread worker: fetch today's calendar events with its own HTTP client."""
    authed_http = _build_authed_http(access_token, refresh_token, timeout=20)
    cal = build('calendar', 'v3', http=authed_http, cache_discovery=False)
    now     = dt.datetime.utcnow().isoformat() + 'Z'
    end_day = (dt.datetime.utcnow() + dt.timedelta(hours=24)).isoformat() + 'Z'
    return cal.events().list(
        calendarId='primary', timeMin=now, timeMax=end_day,
        singleEvents=True, orderBy='startTime',
    ).execute().get('items', [])


def _fetch_emails_batched(access_token, refresh_token, cutoff_ms):
    """Thread worker: fetch unread emails using a batch request for details.

    Uses Gmail batch API to retrieve all message details in a single HTTP
    round-trip instead of N sequential calls — typically 5-10× faster.
    """
    authed_http  = _build_authed_http(access_token, refresh_token, timeout=30)
    gmail        = build('gmail', 'v1', http=authed_http, cache_discovery=False)

    # Exclude promotions, social, updates, forums — primary inbox only
    msgs_result  = gmail.users().messages().list(
        userId='me',
        q='is:unread -category:promotions -category:social -category:updates -category:forums',
        maxResults=20,
    ).execute()
    messages = msgs_result.get('messages', [])

    if not messages:
        return [], []

    # ── Batch fetch all message details in one HTTP round-trip ───────────────
    fetched = {}

    def _callback(req_id, response, exception):
        if exception is None and response:
            fetched[req_id] = response

    batch = gmail.new_batch_http_request(callback=_callback)
    for msg in messages:
        batch.add(
            gmail.users().messages().get(userId='me', id=msg['id']),
            request_id=msg['id'],
        )
    batch.execute()

    # ── Split by 24-hour cutoff ───────────────────────────────────────────────
    last_24h_emails, older_emails = [], []
    for msg_id, m in fetched.items():
        headers = m.get('payload', {}).get('headers', [])
        subject = next((h['value'] for h in headers if h['name'] == 'Subject'), '(No Subject)')
        sender  = next((h['value'] for h in headers if h['name'] == 'From'),    'Unknown Sender')
        record  = {
            'id':           msg_id,
            'subject':      subject,
            'from':         sender,
            'snippet':      m.get('snippet', ''),
            'internalDate': m.get('internalDate', '0'),
        }
        try:
            ts_ms = int(m.get('internalDate', '0'))
        except (ValueError, TypeError):
            ts_ms = 0
        (last_24h_emails if ts_ms >= cutoff_ms else older_emails).append(record)

    return last_24h_emails, older_emails


def fetch_morning_briefing_data(access_token, refresh_token):
    """Full briefing: calendar events + split unread emails (last 24h vs older).

    Optimizations vs. sequential implementation:
      - Calendar + Gmail fetches run in PARALLEL (2 threads)
      - Individual message details fetched via Gmail BATCH API (1 HTTP call)
    """
    cutoff_ms = int((time.time() - 86400) * 1000)

    with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
        cal_future   = executor.submit(_fetch_calendar_events, access_token, refresh_token)
        email_future = executor.submit(_fetch_emails_batched,  access_token, refresh_token, cutoff_ms)

        events                        = cal_future.result()
        last_24h_emails, older_emails = email_future.result()

    return {
        'events':          events,
        'last_24h_emails': last_24h_emails,
        'older_emails':    older_emails,
    }
