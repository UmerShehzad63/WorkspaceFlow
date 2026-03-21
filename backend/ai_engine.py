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

    today      = datetime.utcnow()
    today_iso  = today.strftime("%Y-%m-%d")
    tomorrow   = (today + timedelta(days=1)).strftime("%Y-%m-%d")

    # Compute this-week and next-week boundaries (Monday–Sunday)
    days_since_monday  = today.weekday()                          # 0=Mon
    days_until_monday  = (7 - days_since_monday) % 7 or 7        # days to NEXT Mon
    this_monday  = (today - timedelta(days=days_since_monday)).strftime("%Y-%m-%d")
    this_sunday  = (today - timedelta(days=days_since_monday) + timedelta(days=6)).strftime("%Y-%m-%d")
    next_monday  = (today + timedelta(days=days_until_monday)).strftime("%Y-%m-%d")
    next_sunday  = (today + timedelta(days=days_until_monday + 6)).strftime("%Y-%m-%d")

    prompt = f"""You are an AI assistant for WorkspaceFlow, a Google Workspace automation tool.
Parse the user command and return a structured JSON action plan.

TODAY: {today_iso} ({today.strftime('%A')})
USER_TIMEZONE: {user_timezone}
DATE ANCHORS (use these exactly):
  today      = {today_iso}
  tomorrow   = {tomorrow}
  this week  = {this_monday} to {this_sunday}
  next week  = {next_monday} to {next_sunday}

Command: "{command}"

Return ONLY a valid JSON object with these exact keys:
{{
  "service": "Gmail" | "Calendar" | "Drive" | "Unsupported",
  "action":  "Send" | "Reply" | "Search" | "Archive" | "Create" | "List" | "None",
  "parameters": {{
    // Gmail Send/Reply:       "to", "subject" (optional), "body" (optional), "drive_file" (optional filename)
    // Gmail Search/Archive:   "from", "subject", "query", "label", "max_results"
    // Calendar Create:        "summary", "start_time" (ISO, no Z), "end_time" (ISO, no Z), "attendees", "description"
    // Calendar List (date):   "date_range_start" (YYYY-MM-DDTHH:MM:SS), "date_range_end" (YYYY-MM-DDTHH:MM:SS), "query": null
    // Calendar Search (word): "query" (keyword only, no date_range keys)
    // Drive Search:           "query", "filename"
    // Unsupported:            {{}}
  }},
  "human_description": "One sentence: exactly what this command will do",
  "response_message": "For Unsupported only: helpful message suggesting what CAN be done instead. null otherwise."
}}

ROUTING RULES — follow in strict priority order:

1. ACTION VERB beats everything else:
   - download / get [file from drive] / grab / retrieve → Unsupported
   - send / email / mail / write email to → Gmail / Send
   - find emails / search inbox / what did X say / read emails → Gmail / Search
   - schedule / book / create meeting / add event / set up a call → Calendar / Create
   - remind me / add reminder → Calendar / Create (create an event as reminder)
   - how many events/meetings / what's on my calendar / list my events / do I have anything → Calendar / List
   - find keyword on calendar → Calendar / Search (keyword query, no date range)
   - find file / search drive / look for document → Drive / Search
   - archive / delete emails → Gmail / Archive

2. CALENDAR LIST with date range — always resolve using DATE ANCHORS above:
   - "next week" → date_range_start="{next_monday}T00:00:00", date_range_end="{next_sunday}T23:59:59"
   - "this week" → date_range_start="{this_monday}T00:00:00", date_range_end="{this_sunday}T23:59:59"
   - "today"     → date_range_start="{today_iso}T00:00:00",   date_range_end="{today_iso}T23:59:59"
   - "tomorrow"  → date_range_start="{tomorrow}T00:00:00",    date_range_end="{tomorrow}T23:59:59"
   - Other dates: compute ISO from TODAY={today_iso}
   - When using date range, set "query" to null (do NOT filter by keyword like "meetings")

3. GMAIL SEND rules:
   - "to" = name or email exactly as given (system resolves names to emails)
   - "drive_file" = filename when user says "send/email [file] to [person]"
   - NEVER invent body or subject — omit if not specified in command
   - NEVER put file content in body

4. UNSUPPORTED friendly messages (use these exact formats):
   - download/get file → "I can't download files directly, but I can search for it in Google Drive or email it to someone. What would you like to do?"
   - phone call → "I can't make calls, but I can send an email or schedule a meeting instead."
   - browse web → "I can't browse the web, but I can search your Gmail, Calendar, or Drive."
   - other → explain what IS possible with Gmail / Calendar / Drive

5. IMPORTANT EXAMPLES:
   "how many meetings do I have next week" → Calendar/List, date_range_start="{next_monday}T00:00:00", date_range_end="{next_sunday}T23:59:59", query=null
   "what's on my calendar today"           → Calendar/List, date_range_start="{today_iso}T00:00:00", date_range_end="{today_iso}T23:59:59"
   "find emails from sarah about project"  → Gmail/Search, from="sarah", query="project"
   "download my cv"                        → Unsupported, helpful response_message
   "send my cv to john"                    → Gmail/Send, to="john", drive_file="cv"
   "schedule standup tomorrow 9am"         → Calendar/Create, summary="Standup", start_time="{tomorrow}T09:00:00"
   "remind me about the budget review at 3pm" → Calendar/Create, summary="Budget review reminder", start_time="{today_iso}T15:00:00"
   "archive all newsletters"               → Gmail/Archive, query="newsletter"
"""

    messages = [
        {
            "role": "system",
            "content": "You are a workspace command parser. Return valid JSON only. Never include explanatory text outside the JSON object.",
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
