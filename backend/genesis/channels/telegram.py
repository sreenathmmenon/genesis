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

# Redis key pattern for pending intents — survives process restarts
def _intent_key(chat_id: int) -> str:
    return f"genesis:tg:pending_intent:{chat_id}"


def _chunk_message(text: str, limit: int = 4000) -> list[str]:
    """Split a long message into Telegram-sized chunks, preferring paragraph
    then line boundaries so answers don't break mid-sentence."""
    if len(text) <= limit:
        return [text]
    chunks: list[str] = []
    remaining = text
    while len(remaining) > limit:
        window = remaining[:limit]
        split = window.rfind("\n\n")
        if split < limit // 2:
            split = window.rfind("\n")
        if split < limit // 2:
            split = limit
        chunks.append(remaining[:split].rstrip())
        remaining = remaining[split:].lstrip()
    if remaining:
        chunks.append(remaining)
    return chunks


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
        self._app.add_handler(CommandHandler("cancel", self._cmd_cancel))
        self._app.add_handler(CallbackQueryHandler(self._handle_callback))
        self._app.add_handler(
            MessageHandler(filters.TEXT & ~filters.COMMAND, self._handle_text)
        )

        await self._app.initialize()
        await self._app.start()

        if settings.telegram_webhook_url:
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

    # ── Redis session helpers ──────────────────────────────────────────────────

    async def _get_pending_intent(self, chat_id: int) -> str | None:
        return await redis_client.get(_intent_key(chat_id))

    async def _set_pending_intent(self, chat_id: int, intent: str) -> None:
        await redis_client.set(_intent_key(chat_id), intent, ex=1800)

    async def _clear_pending_intent(self, chat_id: int) -> None:
        await redis_client.delete(_intent_key(chat_id))

    # ── Send helpers ───────────────────────────────────────────────────────────

    async def send_message(self, text: str, **kwargs: Any) -> None:
        if not self._app or not settings.telegram_chat_id:
            logger.debug("Telegram send skipped (not configured): %s", text[:80])
            return
        if len(text) > 4000:
            text = text[:3997] + "…"
        try:
            await self._app.bot.send_message(
                chat_id=settings.telegram_chat_id,
                text=text,
                **kwargs,
            )
        except Exception as first_exc:
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
            "*Genesis — AI Agent Orchestration*\n\n"
            "Describe an outcome you want automated. Genesis will design, build, "
            "and deploy a multi-agent workflow — no code required.\n\n"
            "*Try:*\n"
            "• Monitor Hacker News for AI stories and send a daily digest\n"
            "• Research competitors weekly and brief me on pricing changes\n"
            "• Triage support tickets and draft replies automatically\n\n"
            "/status — platform status  |  /cancel — discard current request",
            parse_mode="Markdown",
        )

    async def _cmd_status(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        redis_ok = await redis_client.ping()
        await update.message.reply_text(
            f"*Genesis Platform Status*\n\n"
            f"Database: ✅  Redis: {'✅' if redis_ok else '❌'}  Runtime: ✅",
            parse_mode="Markdown",
        )

    async def _cmd_cancel(self, update: Update, context: ContextTypes.DEFAULT_TYPE) -> None:
        chat_id = update.effective_chat.id
        await self._clear_pending_intent(chat_id)
        await update.message.reply_text(
            "Request discarded. Send a new description whenever you're ready."
        )

    # ── Main message handler — state driven by Redis ───────────────────────────

    async def _handle_text(
        self, update: Update, context: ContextTypes.DEFAULT_TYPE
    ) -> None:
        text = (update.message.text or "").strip()
        chat_id = update.effective_chat.id

        pending = await self._get_pending_intent(chat_id)

        # ── State: waiting for confirmation on a pending AUTOMATE intent ───────
        # Only AUTOMATE (deploy-a-workflow) requests reach the yes/no/refine
        # confirmation gate. Other lanes answer immediately and never set
        # pending state.
        if pending:
            normalized = text.lower().strip()

            if normalized == "yes":
                await self._clear_pending_intent(chat_id)
                await update.message.reply_text(
                    "Building your workflow now. "
                    "Genesis will design, validate, and prepare it for deployment — "
                    "this takes about 60 seconds.\n\n"
                    "I'll send you a review request when it's ready.",
                )
                try:
                    from genesis.api.genesis import start_build_from_intent
                    build_id = await start_build_from_intent(pending)
                    logger.info("Telegram initiated build build_id=%s intent=%s", build_id, pending[:60])
                except Exception as exc:
                    logger.error("Failed to start build from Telegram: %s", exc)
                    await update.message.reply_text(
                        "Something went wrong starting the build. Please try again or visit the dashboard."
                    )
                return

            if normalized == "no":
                await self._clear_pending_intent(chat_id)
                await update.message.reply_text(
                    "Request discarded. Send a new description whenever you're ready."
                )
                return

            # Anything else = refined intent — re-route it from scratch.
            await self._clear_pending_intent(chat_id)
            await self._route_new_intent(update, chat_id, text)
            return

        # ── State: no pending intent — classify and route ─────────────────────
        if len(text) < 5:
            await update.message.reply_text(
                "Tell me what you'd like — I can answer something one-off, look "
                "up current info, or set up an agent that runs on a schedule.\n\n"
                "Type /start for examples and commands.",
            )
            return

        await self._route_new_intent(update, chat_id, text)

    async def _route_new_intent(self, update: Update, chat_id: int, text: str) -> None:
        """Classify an intent and dispatch it to the correct execution lane."""
        from genesis.agents.router import router_agent

        try:
            decision = await router_agent.classify(text)
        except Exception as exc:  # noqa: BLE001 — never let routing crash the bot
            logger.error("Router crashed, defaulting to AUTOMATE confirm flow: %s", exc)
            decision = {"lane": "AUTOMATE", "reasoning": "", "params": {}}

        lane = decision.get("lane", "AUTOMATE")
        logger.info("Routed intent to %s (conf=%.2f): %s", lane, decision.get("confidence", 0), text[:60])

        if lane == "AUTOMATE":
            # Recurring/scheduled work → confirm, then run the build pipeline.
            await self._set_pending_intent(chat_id, text)
            await update.message.reply_text(
                "This looks like something to run on a schedule, so I'll build a "
                "workflow for it.\n\n"
                "Here's what Genesis will build:\n\n"
                f"{text}\n\n"
                "Reply 'yes' to confirm and start building, 'no' to discard, "
                "or send a revised description.",
            )
            return

        if lane == "CLARIFY":
            question = decision.get("params", {}).get("suggested_clarifying_question") or (
                "Could you tell me a bit more about what you'd like me to do?"
            )
            await update.message.reply_text(question)
            return

        if lane == "RETRIEVE":
            # Live retrieval is not yet a dedicated lane — answer one-shot for now,
            # which already refuses to fabricate when it has no real data.
            await update.message.reply_text("Looking into that now…")
            await self._answer_oneshot(update, text)
            return

        if lane == "CONVERSE":
            # Conversational lane not yet built — answer directly for now.
            await self._answer_oneshot(update, text)
            return

        # Default: ANSWER — one-shot, answered immediately, nothing deployed.
        await update.message.reply_text("On it…")
        await self._answer_oneshot(update, text)

    async def _answer_oneshot(self, update: Update, text: str) -> None:
        """Run an ANSWER-lane request and reply with the result in chat."""
        from genesis.agents.oneshot import run_oneshot

        try:
            result = await run_oneshot(text)
            answer = result.get("answer", "").strip() or "I couldn't produce an answer for that."
        except Exception as exc:  # noqa: BLE001
            logger.error("One-shot answer failed: %s", exc)
            answer = "I hit a temporary issue answering that. Please try again."

        # Plain text — model output can contain Markdown-breaking characters.
        for chunk in _chunk_message(answer):
            await update.message.reply_text(chunk)

    # ── Callback / inline button handlers ─────────────────────────────────────

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
                {"build_id": build_id, "action": "deployed", "workflow_id": workflow_id},
            )

            wf_name = builder_output.get("workflow_name", "Workflow")
            schedule_note = (
                f"\n\nSchedule: runs automatically ({schedule_expr})" if schedule_expr
                else "\n\nThe workflow is ready to run on demand from your dashboard."
            )
            # Plain text — workflow names, cron expressions ("* * *"), and URLs
            # contain characters that break Telegram Markdown parsing.
            await query.edit_message_text(
                f"{wf_name} is deployed and live.{schedule_note}\n\n"
                f"Manage it at {settings.frontend_url}",
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
                "Build cancelled. Send a new request whenever you're ready."
            )
        except Exception as exc:
            logger.error("Cancel trigger failed: %s", exc)

    async def _send_details(self, build_id: str, query: Any) -> None:
        await query.edit_message_text(
            f"View the full workflow design and agent breakdown at:\n{settings.frontend_url}",
        )


# Singleton
telegram_bridge = TelegramBridge()
