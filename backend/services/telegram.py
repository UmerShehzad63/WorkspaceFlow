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
    """Register the webhook URL with the Telegram Bot API."""
    _ensure_configured()
    async with Bot(token=TELEGRAM_BOT_TOKEN) as bot:
        await bot.set_webhook(url=url)
    logger.info("[Telegram] Webhook registered: %s", url)


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
        "/summary — inbox summary\n"
        "/tasks — priority items\n"
        "/status — account status\n"
        "/help — all commands",
    )


def generate_verification_code() -> str:
    """Return a cryptographically random 6-digit code."""
    return str(secrets.randbelow(900_000) + 100_000)


def format_briefing_telegram(briefing: dict) -> str:
    """
    Format a briefing dict as an HTML Telegram message.
    Shows 3–4 email bullets with a prompt to send /briefing for the full view.
    """
    lines = ["<b>📋 WorkspaceFlow — Morning Briefing</b>\n"]

    schedule = briefing.get("schedule") or []
    if schedule:
        lines.append("<b>📅 Today's Schedule</b>")
        for ev in schedule[:5]:
            lines.append(f"  • {ev.get('time', 'All Day')} — {ev.get('title', 'Event')}")
        lines.append("")

    last_24h = briefing.get("last_24h") or {}
    urgent   = last_24h.get("urgent_items") or []
    if urgent:
        lines.append("<b>⚡ Priority Items</b>")
        for item in urgent[:4]:
            lines.append(f"  • {item}")
        if len(urgent) > 4:
            lines.append(f"\nSend /briefing to see all {len(urgent)} items.")
        lines.append("")

    summary = (last_24h.get("summary") or "").strip()
    if summary:
        lines.append("<b>📫 Inbox Summary</b>")
        lines.append(summary[:500])

    return "\n".join(lines)
