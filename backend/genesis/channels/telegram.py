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

        if settings.telegram_webhook_url:
            # Webhook mode — no polling conflict during rolling deploys
            await self._app.bot.set_webhook(
                url=settings.telegram_webhook_url,
                drop_pending_updates=True,
            )
            self._running = True
            logger.info("Telegram bridge started (webhook: %s)", settings.telegram_webhook_url)
        else:
            await self._app.updater.start_polling(drop_pending_updates=True)
            self._running = True
            logger.info("Telegram bridge started (polling)")

    async def teardown(self) -> None:
        if self._app and self._running:
            if not settings.telegram_webhook_url and self._app.updater:
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
        # Truncate very long messages
        if len(text) > 4000:
            text = text[:3997] + "…"
        try:
            await self._app.bot.send_message(
                chat_id=settings.telegram_chat_id,
                text=text,
                **kwargs,
            )
        except Exception as first_exc:
            # Retry as plain text (no parse_mode) to avoid Markdown entity errors
            logger.warning("Telegram send retrying as plain text: %s", first_exc)
            try:
                plain_kwargs = {k: v for k, v in kwargs.items() if k != "parse_mode"}
                await self._app.bot.send_message(
                    chat_id=settings.telegram_chat_id,
                    text=text,
                    **plain_kwargs,
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
            import uuid
            from genesis.database import async_session
            from genesis.models.genesis_build import BuildStatus, GenesisBuild
            from genesis.models.workflow import Workflow, WorkflowStatus

            async with async_session() as session:
                build = await session.get(GenesisBuild, uuid.UUID(build_id))
                if not build:
                    await query.edit_message_text(f"❌ Build `{build_id[:8]}` not found.")
                    return
                if build.status not in (BuildStatus.awaiting_approval, BuildStatus.validating):
                    await query.edit_message_text(
                        f"❌ Build `{build_id[:8]}` is `{build.status.value}` — cannot deploy."
                    )
                    return

                builder_output: dict = build.builder_output or {}
                graph_json = builder_output.get("graph_json") or {}
                graph_nodes: list = graph_json.get("nodes", [])
                schedule_expr: str | None = graph_nodes[0].get("schedule") if graph_nodes else None

                workflow = Workflow(
                    name=builder_output.get("workflow_name", "Unnamed Workflow"),
                    description=builder_output.get("description", ""),
                    intent=build.intent,
                    status=WorkflowStatus.active,
                    graph_json=graph_json or None,
                    canvas_json=builder_output.get("canvas_json"),
                    template_name=None,
                    schedule_expr=schedule_expr,
                )
                session.add(workflow)
                await session.flush()

                build.status = BuildStatus.deployed
                build.workflow_id = workflow.id
                await session.commit()
                await session.refresh(workflow)

                workflow_id = str(workflow.id)

            if schedule_expr:
                try:
                    from genesis.utils.scheduler import schedule_workflow
                    await schedule_workflow(workflow_id, schedule_expr)
                    logger.info("Scheduled workflow %s with cron '%s'", workflow_id, schedule_expr)
                except Exception as exc:
                    logger.error("Failed to schedule workflow %s: %s", workflow_id, exc)

            await redis_client.publish(
                BUILD_PROGRESS,
                {
                    "build_id": build_id,
                    "action": "deployed",
                    "workflow_id": workflow_id,
                },
            )

            schedule_note = f" (runs: {schedule_expr})" if schedule_expr else ""
            await query.edit_message_text(
                f"Deployed! Workflow {workflow_id[:8]} is live{schedule_note}.",
            )
            logger.info("Telegram deploy succeeded: build_id=%s workflow_id=%s", build_id, workflow_id)
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
