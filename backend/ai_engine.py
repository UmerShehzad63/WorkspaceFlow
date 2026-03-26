import os
import httpx
import json

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY", "")
OPENAI_MODEL = "gpt-4o-mini"
OPENAI_BASE_URL = "https://api.openai.com/v1/chat/completions"


async def _call_openai(messages: list):
    """Call OpenAI chat completions API."""
    if not OPENAI_API_KEY:
        return {"error": "OPENAI_API_KEY not configured"}

    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                OPENAI_BASE_URL,
                json={
                    "model": OPENAI_MODEL,
                    "messages": messages,
                    "response_format": {"type": "json_object"},
                    "temperature": 0.3,
                    "max_tokens": 2048,
                },
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
            )

            if response.status_code == 429:
                return {"error": "OpenAI rate limit hit. Try again shortly."}

            response.raise_for_status()

            try:
                result = response.json()
                content = result["choices"][0]["message"]["content"]
            except (json.JSONDecodeError, KeyError, IndexError) as e:
                return {"raw": response.text, "error": f"Unexpected OpenAI response format: {e}"}

            try:
                return json.loads(content)
            except json.JSONDecodeError:
                return {"raw": content, "error": "OpenAI returned non-JSON content"}

    except httpx.HTTPStatusError as e:
        print(f"[OpenAI] HTTP error: {e.response.status_code}")
        return {"error": f"OpenAI HTTP {e.response.status_code}"}
    except Exception as e:
        print(f"[OpenAI] Error: {e}")
        return {"error": str(e)}


async def generate_briefing_summary(data):
    events           = data.get('events', [])
    last_24h_emails  = data.get('last_24h_emails', [])
    older_emails     = data.get('older_emails', [])

    # Limit to 5 high-signal emails per window to keep prompt short and fast
    recent = last_24h_emails[:5]
    old    = older_emails[:5]

    prompt = f"""You are an executive assistant. Summarize this workspace data as JSON.

Return ONLY this JSON structure (no other text):
{{
  "schedule": [{{"time": "HH:MM AM/PM", "title": "event name"}}],
  "last_24h": {{"summary": "2 sentences about recent emails.", "urgent_items": ["action item"]}},
  "older":    {{"summary": "2 sentences about older emails.",  "urgent_items": ["action item"]}}
}}

Rules:
- schedule: parse calendar start times into 12h format.
- urgent_items: only real action items; [] if none.
- last_24h covers only the LAST 24H emails; older covers only OLDER emails.
- If a section has no emails, write the appropriate "No new emails" sentence.

CALENDAR ({len(events)} events): {json.dumps([e.get('summary','?') + ' @ ' + (e.get('start',{}).get('dateTime') or e.get('start',{}).get('date','')) for e in events[:8]])}

LAST 24H EMAILS ({len(recent)}): {json.dumps([{'from': e['from'], 'subject': e['subject'], 'snippet': e['snippet'][:80]} for e in recent])}

OLDER EMAILS ({len(old)}): {json.dumps([{'from': e['from'], 'subject': e['subject'], 'snippet': e['snippet'][:80]} for e in old])}
"""

    messages = [
        {"role": "system", "content": "You are a helpful executive assistant. Always respond with valid JSON only."},
        {"role": "user", "content": prompt},
    ]

    return await _call_openai(messages)


async def generate_email_content(
    command: str,
    to: str,
    context: str = "",
    sender_name: str = "",
    to_name: str = "",
) -> dict:
    """
    Generate a complete professional email (subject + body) from the user's
    natural language command.

    sender_name: the sender's real name for sign-off (from Google/Supabase profile).
    to_name: recipient's display name (used in greeting).
    context: optional workspace context (calendar events, email snippets, etc.).
    """
    from datetime import datetime
    today = datetime.now().strftime("%A, %B %d, %Y")

    context_block = f"\n\nWorkspace context (use this data in the email — do NOT invent details):\n{context}" if context else ""

    # Build greeting — use first name if we have it
    if to_name:
        first_name = to_name.strip().split()[0]
        greeting = f"Hi {first_name},"
    else:
        greeting = "Hi,"

    sign_off = f"Best regards,\n{sender_name}" if sender_name else "Best regards"
    sender_first = sender_name.strip().split()[0] if sender_name else ""

    prompt = f"""Generate a complete, professional email based on the request below.

REQUEST: {command}
RECIPIENT EMAIL: {to}
RECIPIENT NAME: {to_name or "(unknown)"}
SENDER NAME: {sender_name or "(unknown)"}
TODAY: {today}{context_block}

Return ONLY this JSON (no markdown, no extra text):
{{
  "subject": "Specific, action-oriented subject line (not generic)",
  "body": "Full email body as described below"
}}

EMAIL BODY REQUIREMENTS:
1. Start with exactly: "{greeting}"
2. Write 3–5 sentences that are substantive and specific to the request. Do NOT write one-liners.
3. If workspace context was provided (calendar events, emails, files), reference the ACTUAL data — times, names, titles — don't be vague.
4. If the request involves scheduling, include the specific time/date from context or ask for availability if unknown.
5. End with exactly: "{sign_off}"
6. Use plain text only — no markdown, no bullet points unless the request explicitly calls for a list.

ABSOLUTE RULES:
- NEVER use any bracket placeholders: [Your Name], [Name], [Position], [Date], [Time], [Details], [Your Contact], or any [bracketed text] whatsoever.
- Sign with the actual sender name "{sender_first or 'the sender'}" — never a placeholder.
- Do NOT add a P.S. or postscript unless the request asks for one.
- Do NOT invent facts, meeting details, or file contents that are not in the context.
"""

    messages = [
        {
            "role": "system",
            "content": (
                "You are a senior executive assistant drafting emails on behalf of busy professionals. "
                "You write complete, specific, ready-to-send emails — never skeleton templates. "
                "You NEVER use bracket placeholders like [Your Name] or [Details]. "
                "Return valid JSON only."
            ),
        },
        {"role": "user", "content": prompt},
    ]
    return await _call_openai(messages)


async def parse_command_intent(command: str, user_timezone: str = "UTC"):
    """
    Classify a workspace command into a structured intent using GPT.
    Two-step AI pipeline: classify intent + extract entities.
    Returns {service, action, parameters, human_description, response_message}.
    """
    from datetime import datetime, timedelta

    # Compute date anchors in the user's local timezone so "today/next week" matches what they see
    try:
        from zoneinfo import ZoneInfo
        _user_tz = ZoneInfo(user_timezone)
        today = datetime.now(_user_tz)
    except Exception:
        today = datetime.utcnow()

    today_iso  = today.strftime("%Y-%m-%d")
    tomorrow   = (today + timedelta(days=1)).strftime("%Y-%m-%d")

    # Compute this-week and next-week boundaries in user's timezone (Monday–Sunday)
    days_since_monday  = today.weekday()                          # 0=Mon
    days_until_monday  = (7 - days_since_monday) % 7 or 7        # days to NEXT Mon
    this_monday  = (today - timedelta(days=days_since_monday)).strftime("%Y-%m-%d")
    this_sunday  = (today - timedelta(days=days_since_monday) + timedelta(days=6)).strftime("%Y-%m-%d")
    next_monday  = (today + timedelta(days=days_until_monday)).strftime("%Y-%m-%d")
    next_sunday  = (today + timedelta(days=days_until_monday + 6)).strftime("%Y-%m-%d")

    prompt = f"""You are the intent parser for CouchMail, a Google Workspace AI assistant.
The user can control Gmail, Google Calendar, and Google Drive using natural language.

TODAY: {today_iso} ({today.strftime('%A')})  |  USER TIMEZONE: {user_timezone}
DATE ANCHORS:
  today     = {today_iso}
  tomorrow  = {tomorrow}
  this week = {this_monday} to {this_sunday}
  next week = {next_monday} to {next_sunday}

═══════════════════════════════════════════════════════
WHAT COUCHMAIL CAN DO (all available capabilities):
═══════════════════════════════════════════════════════
GMAIL:
  • Send email to anyone (with or without Drive file attachment)
  • Reply to an email thread
  • Search inbox by sender, subject, keyword, date, label
  • Archive emails by label or keyword

CALENDAR:
  • Create/schedule meetings, events, reminders
  • List/view events for a date range (today, tomorrow, this week, next week, any date)
  • Delete/cancel/clear events for a date range or by keyword
  • Search for a specific meeting by name or attendee

DRIVE:
  • Search for files by name or keyword
  • Attach any Drive file to an email (PDF, Sheets, Docs, etc.)

═══════════════════════════════════════════════════════
USER COMMAND: "{command}"
═══════════════════════════════════════════════════════

Return ONLY this JSON (no markdown, no extra text):
{{
  "service": "Gmail" | "Calendar" | "Drive" | "Unsupported",
  "action": "Send" | "Reply" | "Search" | "Archive" | "Create" | "List" | "Delete" | "None",
  "parameters": {{
    /* Gmail Send/Reply  → to, subject (opt), body (opt), drive_file (opt - filename to attach) */
    /* Gmail Search      → from (opt), subject (opt), query (opt), label (opt), max_results (opt) */
    /* Gmail Archive     → query */
    /* Calendar Create   → summary, start_time (ISO YYYY-MM-DDTHH:MM:SS, no Z), end_time (opt), attendees (opt array), description (opt) */
    /* Calendar List     → date_range_start (ISO), date_range_end (ISO), query: null */
    /* Calendar Delete   → date_range_start (ISO, opt), date_range_end (ISO, opt), query (opt) */
    /* Calendar Search   → query */
    /* Drive Search      → query, filename (opt) */
    /* Unsupported       → {{}} */
  }},
  "human_description": "One sentence describing exactly what will happen",
  "response_message": "For Unsupported only: friendly message explaining what CAN be done. null for all other services."
}}

═══════════════════════════════════════════════════════
PARSING RULES (strict priority order)
═══════════════════════════════════════════════════════

RULE 1 — GMAIL SEND: DOCUMENT NOUNS = DRIVE ATTACHMENT
  When user says "send/email [NOUN] to [PERSON]" and the noun is a document type,
  the noun is a DRIVE FILE to attach — not the email body.
  DOCUMENT NOUNS that always trigger drive_file:
    transcript, resume, cv, report, invoice, proposal, contract, document, doc,
    file, pdf, presentation, slides, deck, spreadsheet, sheet, form, certificate,
    letter, portfolio, assignment, homework, application, brief, memo, statement
  Examples:
    "send transcript to umer"        → to="umer", drive_file="transcript"
    "send my transcript to umer"     → to="umer", drive_file="transcript"
    "email resume to sarah"          → to="sarah", drive_file="resume"
    "send the report to john"        → to="john", drive_file="report"
    "send invoice to client@x.com"   → to="client@x.com", drive_file="invoice"
    "email cv to recruiter"          → to="recruiter", drive_file="cv"
    "send proposal to team"          → to="team", drive_file="proposal"
    "send my assignment to professor" → to="professor", drive_file="assignment"
  Counter-examples (NO drive_file — message content, not a file):
    "email john the meeting is at 3pm" → to="john", NO drive_file
    "tell sarah the proposal is ready" → to="sarah", NO drive_file
    "write to mark about the project"  → to="mark", NO drive_file

RULE 2 — CALENDAR DATE RANGES: use DATE ANCHORS exactly
  List/Delete with time words:
    today     → {today_iso}T00:00:00 to {today_iso}T23:59:59
    tomorrow  → {tomorrow}T00:00:00 to {tomorrow}T23:59:59
    this week → {this_monday}T00:00:00 to {this_sunday}T23:59:59
    next week → {next_monday}T00:00:00 to {next_sunday}T23:59:59
  When using date range, always set query=null (don't filter by word like "meetings").
  "cancel my 3pm today" → date_range_start={today_iso}T15:00:00, date_range_end={today_iso}T16:00:00, query="3pm"

RULE 3 — INTENT SIGNALS
  send/email/mail/write to           → Gmail / Send
  reply/respond to                   → Gmail / Reply
  find email/what did X say/search   → Gmail / Search
  archive/clean up emails            → Gmail / Archive
  schedule/book/create meeting/event → Calendar / Create
  remind me / set reminder           → Calendar / Create
  what's on my calendar/do I have    → Calendar / List
  delete/remove/clear/cancel meeting → Calendar / Delete
  find file/search drive/look for doc → Drive / Search
  download/save locally              → Unsupported

RULE 4 — UNSUPPORTED: be helpful, explain alternatives
  "I can't [do that], but I can [alternative using Gmail/Calendar/Drive]."

═══════════════════════════════════════════════════════
MORE EXAMPLES
═══════════════════════════════════════════════════════
"who sent me rejection mail today"        → Gmail/Search, query="rejection", (date filter today if possible)
"did anyone email me about the interview" → Gmail/Search, query="interview"
"find emails from boss about salary"      → Gmail/Search, from="boss", query="salary"
"what's on my calendar today"            → Calendar/List, range=today
"how many meetings next week"            → Calendar/List, range=next week
"schedule standup tomorrow 9am"          → Calendar/Create, summary="Standup", start={tomorrow}T09:00:00
"book a call with sarah friday 2pm"      → Calendar/Create, summary="Call with Sarah", attendees=["sarah"], start=friday 14:00
"remind me dentist appointment monday 10am" → Calendar/Create, summary="Dentist appointment", start=monday 10:00
"cancel all meetings tomorrow"           → Calendar/Delete, range=tomorrow
"clear my friday"                        → Calendar/Delete, range=friday
"find my contract in drive"              → Drive/Search, filename="contract"
"search for project proposal document"  → Drive/Search, query="project proposal"
"archive all promotions"                 → Gmail/Archive, query="promotions"
"""

    messages = [
        {
            "role": "system",
            "content": (
                "You are the intent parser for CouchMail, a Google Workspace AI assistant. "
                "Your ONLY job is to parse user commands into structured JSON. "
                "CouchMail can send emails, attach Drive files to emails, search Gmail, "
                "create/list/delete calendar events, and search Google Drive. "
                "Return valid JSON only — no markdown fences, no explanations outside the JSON."
            ),
        },
        {"role": "user", "content": prompt},
    ]

    return await _call_openai(messages)


async def _call_openai_text(messages: list) -> str:
    """Call OpenAI without JSON response format enforcement. Returns raw text."""
    if not OPENAI_API_KEY:
        return ""
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(
                OPENAI_BASE_URL,
                json={
                    "model": OPENAI_MODEL,
                    "messages": messages,
                    "temperature": 0.7,
                    "max_tokens": 1024,
                },
                headers={
                    "Authorization": f"Bearer {OPENAI_API_KEY}",
                    "Content-Type": "application/json",
                },
            )
            response.raise_for_status()
            result = response.json()
            return result["choices"][0]["message"]["content"].strip()
    except Exception as e:
        print(f"[OpenAI Text] Error: {e}")
        return ""


async def rewrite_email_field(field: str, current_value: str, instruction: str) -> str:
    """Rewrite an email subject or body based on a user instruction."""
    messages = [
        {
            "role": "system",
            "content": (
                f"You are an email assistant. Rewrite the email {field} as instructed. "
                "Return only the rewritten text — no quotes, no labels, no explanation."
            ),
        },
        {
            "role": "user",
            "content": (
                f'Rewrite the following email {field} based on this instruction: "{instruction}"\n\n'
                f"Original {field}:\n{current_value}\n\n"
                f"Return only the rewritten {field} text, nothing else."
            ),
        },
    ]
    result = await _call_openai_text(messages)
    return result if result else current_value
