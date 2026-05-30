from __future__ import annotations

import logging
from typing import Any

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select, desc
from sqlalchemy.ext.asyncio import AsyncSession

from genesis.database import get_db
from genesis.models.audit_log import AuditLog

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/audit", tags=["audit"])


@router.get("/")
async def list_audit_logs(
    event_type: str | None = Query(default=None),
    entity_type: str | None = Query(default=None),
    entity_id: str | None = Query(default=None),
    limit: int = Query(default=100, le=500),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    q = select(AuditLog).order_by(desc(AuditLog.created_at))

    if event_type:
        q = q.where(AuditLog.event_type == event_type)
    if entity_type:
        q = q.where(AuditLog.entity_type == entity_type)
    if entity_id:
        q = q.where(AuditLog.entity_id == entity_id)

    total_q = q
    q = q.limit(limit).offset(offset)
    result = await db.execute(q)
    rows = result.scalars().all()

    return {
        "items": [
            {
                "id": str(r.id),
                "event_type": r.event_type,
                "entity_type": r.entity_type,
                "entity_id": r.entity_id,
                "entity_name": r.entity_name,
                "detail": r.detail,
                "timestamp": r.created_at.isoformat(),
            }
            for r in rows
        ],
        "limit": limit,
        "offset": offset,
    }


@router.get("/event-types")
async def list_event_types(db: AsyncSession = Depends(get_db)) -> list[str]:
    """Return all distinct event types present in the log."""
    from sqlalchemy import distinct
    result = await db.execute(select(distinct(AuditLog.event_type)).order_by(AuditLog.event_type))
    return list(result.scalars().all())
