from __future__ import annotations

from fastapi import APIRouter, HTTPException, Request
from telegram import Update

from genesis.config import settings
from genesis.utils.logger import get_logger

router = APIRouter(prefix="/telegram", tags=["telegram"])
logger = get_logger("genesis.api.telegram_webhook")


@router.post("/webhook")
async def telegram_webhook(request: Request) -> dict[str, str]:
    """Receive updates from Telegram via webhook (alternative to polling)."""
    from genesis.channels.telegram import telegram_bridge

    if not telegram_bridge._app:
        raise HTTPException(status_code=503, detail="Telegram bridge not initialised")

    try:
        data = await request.json()
        update = Update.de_json(data, telegram_bridge._app.bot)
        await telegram_bridge._app.process_update(update)
        return {"ok": "true"}
    except Exception as exc:
        logger.exception("Webhook processing error: %s", exc)
        raise HTTPException(status_code=500, detail="Webhook processing failed")
