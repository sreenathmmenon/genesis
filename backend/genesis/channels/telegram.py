from __future__ import annotations

import asyncio
from typing import Any

from telegram import InlineKeyboardButton, InlineKeyboardMarkup, Update
from telegram.ext import (
    Application,
    CallbackQueryHandler,
    CommandHandler,
    ContextTypes,
    MessageHandler,
    filters,
)

from genesis.channels.base import ChannelBridge
from genesis.config import settings
from genesis.utils.logger import get_logger
from genesis.utils.redis_client import BUILD_PROGRESS, SYSTEM_EVENTS, redis_client

logger = get_logger("genesis.telegram")


class TelegramBridge(ChannelBridge):
    def __init__(self) -> None:
        self._app: Application | None = None
        self._running = False

    # ── Lifecycle ──────────────────────────────────────────────────────────────

    async def setup(self) -> None:
        if not settings.telegram_bot_token:
            logger.warning("TELEGRAM_BOT_TOKEN not set — Telegram bridge disabled")
            return

        self._app = (
            Application.builder()
            .token(settings.telegram_bot_token)
            .build()
        )

        self._app.add_handler(CommandHandler("start", self._cmd_start))
        self._app.add_handler(CommandHandler("status", self._cmd_status))
        self._app.add_handler(CallbackQueryHandler(self._handle_callback))
        self._app.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND, self._handle_text)
        )

        await self._app.initialize()
        await self._app.start()
        await self._app.updater.start_polling(drop_pending_updates=True)
        self._running = True
        logger.info("Telegram bridge started (polling)")

    async def teardown(self) -> None:
        if self._app and self._running:
            await self._app.updater.stop()
            await self._app.stop()
            await self._app.shutdown()
            self._running = False
            logger.info("Telegram bridge stopped")

    # ── Send helpers ───────────────────────────────────────────────────────────

    async def send_message(self, text: str, **kwargs: Any) -> None:
        if not self._app or not settings.telegram_chat_id:
            logger.debug("Telegram send skipped (not configured): %s", text[:80])
            return
        try:
            await self._app.bot.send_message(
                chat_id=settings.telegram_chat_id,
                text=text,
                parse_mode="Markdown",
                **kwargs,
            )
        except Exception as exc:
            logger.error("Telegram send_message failed: %s", exc)

    async def send_approval_request(self, build_id: str, message: str) -> None:
        if not self._app or not settings.telegram_chat_id:
            logger.warning("Telegram not configured — approval request skipped for build %s", build_id)
            return

        keyboard = InlineKeyboardMarkup([
            [
                InlineKeyboardButton("✅ Deploy", callback_data=f"deploy:{build_id}"),
                InlineKeyboardButton("❌ Cancel", callback_data=f"cancel:{build_id}"),
            ],
            [
                InlineKeyboardButton("🔍 View Details", callback_data=f"details:{build_id}"),
            ],
        ])

        try:
            await self._app.bot.send_message(
                chat_id=settings.telegram_chat_id,
                text=message,
                parse_mode="Markdown",
                reply_markup=keyboard,
            )
            logger.info("Approval request sent for build_id=%s", build_id)
        except Exception as exc:
            logger.error("Failed to send approval request: %s", exc)

    # ── Command handlers ───────────────────────────────────────────────────────

    async def _cmd_start(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        await update.message.reply_text(
            "👋 *Genesis AI Orchestration Platform*\n\n"
            "Send me a description of what you want to automate and I'll build it for you.\n\n"
            "Commands:\n"
            "/status — show system status\n"
            "/start — show this message",
            parse_mode="Markdown",
        )

    async def _cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        redis_ok = await redis_client.ping()
        await update.message.reply_text(
            f"🔮 *Genesis Status*\n\n"
            f"• Redis: {'✅' if redis_ok else '❌'}\n"
            f"• Bot: ✅ running",
            parse_mode="Markdown",
        )

    # ── Callback / text handlers ───────────────────────────────────────────────

    async def _handle_callback(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE
    ) -> None:
        query = update.callback_query
        await query.answer()

        data: str = query.data or ""
        action, _, build_id = data.partition(":")

        if action == "deploy":
            await self._trigger_deploy(build_id, query)
        elif action == "cancel":
            await self._trigger_cancel(build_id, query)
        elif action == "details":
            await self._send_details(build_id, query)
        else:
            logger.warning("Unknown callback action: %s", action)

    async def _trigger_deploy(self, build_id: str, query: Any) -> None:
        try:
            await redis_client.publish(
                BUILD_PROGRESS,
                {"build_id": build_id, "action": "deploy", "source": "telegram"},
            )
            await query.edit_message_text(
                f"✅ Deployment initiated for build `{build_id[:8]}`…",
                parse_mode="Markdown",
            )
        except Exception as exc:
            logger.error("Deploy trigger failed: %s", exc)
            await query.edit_message_text("❌ Failed to trigger deployment.")

    async def _trigger_cancel(self, build_id: str, query: Any) -> None:
        try:
            await redis_client.publish(
                SYSTEM_EVENTS,
                {"build_id": build_id, "action": "cancel", "source": "telegram"},
            )
            await query.edit_message_text(
                f"❌ Build `{build_id[:8]}` cancelled.",
                parse_mode="Markdown",
            )
        except Exception as exc:
            logger.error("Cancel trigger failed: %s", exc)

    async def _send_details(self, build_id: str, query: Any) -> None:
        await query.edit_message_text(
            f"🔍 Build ID: `{build_id}`\n\nCheck the Genesis canvas at your dashboard for full details.",
            parse_mode="Markdown",
        )

    async def _handle_text(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE
    ) -> None:
        text = (update.message.text or "").strip()
        if len(text) < 20:
            await update.message.reply_text(
                "Please describe what you want to automate in at least 20 characters."
            )
            return

        await update.message.reply_text(
            "🔮 Got it! Starting Genesis build…\n\nYou'll receive an approval request when the workflow is ready.",
            parse_mode="Markdown",
        )

        try:
            from genesis.api.genesis import start_build_from_intent
            asyncio.create_task(start_build_from_intent(text))
        except Exception as exc:
            logger.error("Failed to start build from Telegram: %s", exc)
            await update.message.reply_text("❌ Failed to start build. Please try again.")


# Singleton
telegram_bridge = TelegramBridge()
