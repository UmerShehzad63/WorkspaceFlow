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


async def parse_command_intent(command: str):
    prompt = f"""Parse this natural language workspace command into a structured action.

Command: "{command}"

Return ONLY a valid JSON object with these exact keys:
{{
  "service": "Gmail" | "Calendar" | "Drive",
  "action": "Send" | "Search" | "Fetch" | "Archive" | "Reply" | "Schedule" | "Create" | "Find" | "Other",
  "parameters": {{
    // For Gmail Send:   "to" (name OR email), "subject" (optional), "body" (optional), "drive_file" (optional filename)
    // For Gmail Search/Fetch: "from", "subject", "query", "label", "max_results"
    // For Gmail Archive: "from", "subject", "query"
    // For Calendar Create/Schedule: "summary", "start_time" (ISO 8601), "end_time" (ISO 8601), "attendees" (list), "description"
    // For Calendar Search/Find: "query", "title"
    // For Drive Search/Find: "query", "filename"
    // Include only relevant params, omit the rest
  }},
  "human_description": "One sentence: exactly what this command will do"
}}

Rules:
- For Calendar events, always output start_time and end_time in ISO 8601 format (e.g. "2026-03-20T14:00:00Z"). Convert relative times like "tomorrow 2pm" to real ISO datetimes using today's date 2026-03-19.
- For Gmail Send, the "to" field can be a person's full name (e.g. "Muhammad Aslam Khan") — do NOT try to guess their email address; the system will resolve it from Gmail history.
- For Gmail Send, "body" and "subject" are optional — omit them if not specified in the command; the system will auto-generate them.
- For Gmail Search, build the most specific query possible (from:, subject:, label:, etc.).
- CRITICAL RULE — Drive file sends: If the command mentions sending/emailing a file, document, or anything that could be a filename (transcript, proposal, report, invoice, spreadsheet, etc.) use service=Gmail, action=Send, and set "drive_file" to the filename or document description. NEVER put file content in "body". NEVER invent a body for Drive file sends — leave "body" omitted.
  Examples:
  - "send transcript to john@example.com" → {{service: "Gmail", action: "Send", parameters: {{to: "john@example.com", drive_file: "transcript"}}}}
  - "email the proposal to Muhammad Aslam Khan" → {{service: "Gmail", action: "Send", parameters: {{to: "Muhammad Aslam Khan", drive_file: "proposal"}}}}
  - "send Q1 report from my drive to sarah@example.com" → {{service: "Gmail", action: "Send", parameters: {{to: "sarah@example.com", drive_file: "Q1 report"}}}}"""

    messages = [
        {"role": "system", "content": "You are a workspace command parser. Return valid JSON only. Never include explanatory text outside the JSON object."},
        {"role": "user", "content": prompt},
    ]

    return await _call_openai(messages)
