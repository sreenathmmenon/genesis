from __future__ import annotations

from typing import Any

from genesis.database import async_session
from genesis.models.audit_log import AuditLog
from genesis.utils.logger import get_logger

logger = get_logger("genesis.audit")


async def audit(
    event_type: str,
    entity_type: str,
    entity_id: str | None = None,
    entity_name: str | None = None,
    detail: dict[str, Any] | None = None,
) -> None:
    """Append an immutable audit log entry. Fire-and-forget safe — never raises."""
    try:
        async with async_session() as session:
            entry = AuditLog(
                event_type=event_type,
                entity_type=entity_type,
                entity_id=str(entity_id) if entity_id else None,
                entity_name=entity_name,
                detail=detail,
            )
            session.add(entry)
            await session.commit()
    except Exception as exc:
        logger.error("audit() failed — event_type=%s entity=%s: %s", event_type, entity_id, exc)
