import asyncio
import json
import logging
from datetime import datetime, timezone

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from genesis.utils.redis_client import (
    redis_client,
    CANVAS_UPDATES,
    BUILD_PROGRESS,
    AGENT_MESSAGES,
    MONITOR_STREAM,
    SYSTEM_EVENTS,
    RUN_EVENTS,
)

logger = logging.getLogger(__name__)
router = APIRouter()

ALL_CHANNELS = [CANVAS_UPDATES, BUILD_PROGRESS, AGENT_MESSAGES, MONITOR_STREAM, SYSTEM_EVENTS, RUN_EVENTS]

# ── Channel → WS event type mapping ──────────────────────────────────────────

CHANNEL_TYPE: dict[str, str] = {
    CANVAS_UPDATES: "canvas_node_added",
    BUILD_PROGRESS:  "build_progress",
    AGENT_MESSAGES:  "agent_message",
    MONITOR_STREAM:  "monitor_update",
    SYSTEM_EVENTS:   "system_event",
    RUN_EVENTS:      "run_event",
}


class ConnectionManager:
    def __init__(self) -> None:
        self.connections: dict[str, WebSocket] = {}

    async def connect(self, client_id: str, websocket: WebSocket) -> None:
        await websocket.accept()
        self.connections[client_id] = websocket
        logger.info("WS connected: %s (total=%d)", client_id, len(self.connections))

    def disconnect(self, client_id: str) -> None:
        self.connections.pop(client_id, None)
        logger.info("WS disconnected: %s (total=%d)", client_id, len(self.connections))

    async def send_to_client(self, client_id: str, message: dict) -> None:
        ws = self.connections.get(client_id)
        if ws:
            try:
                await ws.send_json(message)
            except Exception as exc:
                logger.warning("WS send failed for %s: %s", client_id, exc)
                self.disconnect(client_id)

    async def broadcast(self, message: dict) -> None:
        dead: list[str] = []
        for client_id, ws in list(self.connections.items()):
            try:
                await ws.send_json(message)
            except Exception:
                dead.append(client_id)
        for cid in dead:
            self.disconnect(cid)


manager = ConnectionManager()


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@router.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str) -> None:
    await manager.connect(client_id, websocket)

    async def redis_listener() -> None:
        async for payload in redis_client.subscribe(*ALL_CHANNELS):
            channel = payload.get("_channel", "")
            event_type = CHANNEL_TYPE.get(channel, payload.get("type", "event"))
            await manager.send_to_client(
                client_id,
                {"type": event_type, "payload": payload, "timestamp": _now_iso()},
            )

    async def heartbeat() -> None:
        while client_id in manager.connections:
            await asyncio.sleep(25)
            await manager.send_to_client(
                client_id,
                {"type": "heartbeat", "payload": None, "timestamp": _now_iso()},
            )

    listener_task = asyncio.create_task(redis_listener())
    heartbeat_task = asyncio.create_task(heartbeat())

    try:
        while True:
            data = await websocket.receive_text()
            # Echo back any client pings
            if data == "ping":
                await manager.send_to_client(client_id, {"type": "pong", "timestamp": _now_iso()})
    except WebSocketDisconnect:
        pass
    finally:
        listener_task.cancel()
        heartbeat_task.cancel()
        manager.disconnect(client_id)
