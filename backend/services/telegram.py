"""
Telegram Bot delivery via python-telegram-bot.

Required env vars:
    TELEGRAM_BOT_TOKEN — from @BotFather on Telegram
"""
import logging
import os
import secrets

from telegram import Bot
from telegram.error import TelegramError

logger = logging.getLogger(__name__)

TELEGRAM_BOT_TOKEN = os.getenv("TELEGRAM_BOT_TOKEN", "")


def _ensure_configured():
    if not TELEGRAM_BOT_TOKEN:
        raise RuntimeError(
            "Telegram not configured. Set TELEGRAM_BOT_TOKEN in your .env file."
        )


async def set_webhook(url: str) -> None:
    """Register the webhook URL with the Telegram Bot API, including a secret token."""
    _ensure_configured()
    webhook_secret = os.getenv("TELEGRAM_WEBHOOK_SECRET", "")
    if not webhook_secret:
        raise RuntimeError(
            "TELEGRAM_WEBHOOK_SECRET is not set. "
            "Generate a random secret and set it in your environment variables."
        )
    async with Bot(token=TELEGRAM_BOT_TOKEN) as bot:
        await bot.set_webhook(url=url, secret_token=webhook_secret)
    logger.info("[Telegram] Webhook registered with secret: %s", url)


async def send_message(chat_id: str | int, text: str, reply_markup=None) -> dict | None:
    """Send a Telegram HTML message (async). Returns the sent message dict."""
    _ensure_configured()
    async with Bot(token=TELEGRAM_BOT_TOKEN) as bot:
        msg = await bot.send_message(
            chat_id=chat_id,
            text=text,
            parse_mode="HTML",
            reply_markup=reply_markup,
        )
        return msg.to_dict() if msg else None


async def edit_message_text(chat_id: str | int, message_id: int, text: str, reply_markup=None) -> None:
    """Edit an existing Telegram message."""
    _ensure_configured()
    async with Bot(token=TELEGRAM_BOT_TOKEN) as bot:
        try:
            await bot.edit_message_text(
                chat_id=chat_id,
                message_id=message_id,
                text=text,
                parse_mode="HTML",
                reply_markup=reply_markup,
            )
        except Exception as e:
            logger.warning("[Telegram] edit_message_text failed: %s", e)


async def edit_message_reply_markup(chat_id: str | int, message_id: int, reply_markup=None) -> None:
    """Remove or replace the inline keyboard of a message without changing its text."""
    _ensure_configured()
    async with Bot(token=TELEGRAM_BOT_TOKEN) as bot:
        try:
            await bot.edit_message_reply_markup(
                chat_id=chat_id,
                message_id=message_id,
                reply_markup=reply_markup,
            )
        except Exception as e:
            logger.warning("[Telegram] edit_message_reply_markup failed: %s", e)


async def answer_callback_query(callback_query_id: str, text: str = "") -> None:
    """Acknowledge a callback query (removes loading spinner)."""
    _ensure_configured()
    async with Bot(token=TELEGRAM_BOT_TOKEN) as bot:
        try:
            await bot.answer_callback_query(callback_query_id=callback_query_id, text=text)
        except Exception as e:
            logger.warning("[Telegram] answer_callback_query failed: %s", e)


async def send_test_message(chat_id: str | int) -> None:
    """Send a test message to verify the connection works."""
    await send_message(
        chat_id,
        "✅ <b>WorkspaceFlow — connection verified!</b>\n\n"
        "Your daily morning briefing will arrive here at your configured time.\n\n"
        "<b>Available commands:</b>\n"
        "/briefing — full morning briefing\n"
        "/tasks — priority items\n"
        "/status — account status\n"
        "/help — all commands",
    )


def generate_verification_code() -> str:
    """Return a cryptographically random 6-digit code."""
    return str(secrets.randbelow(900_000) + 100_000)


def _format_sender(from_str: str) -> str:
    """Extract display name from 'Name <email>' format."""
    if not from_str:
        return "Unknown"
    import re
    match = re.match(r'^"?([^"<]+?)"?\s*<[^>]+>$', from_str)
    return match.group(1).strip() if match else from_str.replace("<", "").replace(">", "").strip() or from_str


def format_briefing_telegram(briefing: dict, raw_data: dict | None = None) -> str:
    """
    Format a briefing dict as an HTML Telegram message matching the dashboard layout:
    - Today's Schedule
    - Last 24 Hours (emails + inbox summary)
    - Older (emails + inbox summary)
    """
    today = __import__("datetime").date.today().strftime("%A, %B %-d")
    lines = [f"<b>📋 WorkspaceFlow — {today}</b>"]

    # ── Today's Schedule ────────────────────────────────────────────────────
    schedule = briefing.get("schedule") or []
    lines.append("\n<b>TODAY'S SCHEDULE</b>")
    if schedule:
        for ev in schedule:
            time_str = ev.get("time") or "All Day"
            title    = ev.get("title") or "Event"
            lines.append(f"  {time_str} — {title}")
    else:
        lines.append("  No meetings scheduled today.")

    # ── Helper to render an email section ───────────────────────────────────
    def _email_section(label: str, section_data: dict, emails: list) -> None:
        lines.append(f"\n<b>{label.upper()}</b>")
        if emails:
            for email in emails[:5]:
                sender  = _format_sender(email.get("from", ""))
                subject = email.get("subject", "(no subject)")
                lines.append(f"  📧 <b>{sender}</b> — \"{subject}\"")
        else:
            lines.append("  No emails.")

        lines.append("")
        summary = (section_data.get("summary") or "").strip()
        lines.append(f"<b>📫 Inbox Summary</b>")
        lines.append(summary if summary else "No summary available.")

        urgent = section_data.get("urgent_items") or []
        if urgent:
            lines.append("")
            lines.append("<b>⚡ Action Items</b>")
            for item in urgent:
                lines.append(f"  • {item}")

    last_24h        = briefing.get("last_24h") or {}
    older           = briefing.get("older") or {}
    last_24h_emails = (raw_data or {}).get("last_24h_emails") or []
    older_emails    = (raw_data or {}).get("older_emails") or []

    _email_section("Last 24 Hours", last_24h, last_24h_emails)
    _email_section("Older", older, older_emails)

    return "\n".join(lines)
