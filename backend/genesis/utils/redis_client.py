import json
import logging
from collections.abc import AsyncGenerator
from typing import Any

import redis.asyncio as aioredis

from genesis.config import settings

logger = logging.getLogger(__name__)

# ── Channel name constants ─────────────────────────────────────────────────────

CANVAS_UPDATES = "genesis:canvas"
BUILD_PROGRESS = "genesis:build_progress"
AGENT_MESSAGES = "genesis:agent_messages"
MONITOR_STREAM = "genesis:monitor"
SYSTEM_EVENTS  = "genesis:system"
RUN_EVENTS     = "genesis:run_events"


class RedisClient:
    def __init__(self) -> None:
        self._client: aioredis.Redis | None = None

    async def connect(self) -> None:
        self._client = aioredis.from_url(
            settings.redis_url,
            encoding="utf-8",
            decode_responses=True,
        )
        await self._client.ping()
        logger.info("Redis connected: %s", settings.redis_url)

    async def disconnect(self) -> None:
        if self._client:
            await self._client.aclose()
            self._client = None
            logger.info("Redis disconnected")

    @property
    def _r(self) -> aioredis.Redis:
        if not self._client:
            raise RuntimeError("Redis not connected — call connect() first")
        return self._client

    async def publish(self, channel: str, data: dict[str, Any]) -> None:
        await self._r.publish(channel, json.dumps(data))

    async def subscribe(self, *channels: str) -> AsyncGenerator[dict[str, Any], None]:
        pubsub = self._r.pubsub()
        await pubsub.subscribe(*channels)
        try:
            async for raw in pubsub.listen():
                if raw["type"] == "message":
                    try:
                        payload = json.loads(raw["data"])
                        payload["_channel"] = raw.get("channel", "")
                        yield payload
                    except json.JSONDecodeError:
                        logger.warning("Unparseable Redis message on %s", raw.get("channel"))
        finally:
            await pubsub.unsubscribe(*channels)
            await pubsub.aclose()

    async def ping(self) -> bool:
        try:
            return await self._r.ping()
        except Exception:
            return False


redis_client = RedisClient()
