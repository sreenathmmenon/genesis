import logging
import uuid

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from genesis.database import get_db
from genesis.models import Run, Message
from genesis.models.schemas import RunRead, MessageRead

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/runs", tags=["runs"])


@router.get("/", response_model=list[RunRead])
async def list_runs(
    workflow_id: uuid.UUID | None = Query(default=None),
    limit: int = Query(default=20, ge=1, le=100),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[Run]:
    q = select(Run).order_by(Run.started_at.desc()).limit(limit).offset(offset)
    if workflow_id:
        q = q.where(Run.workflow_id == workflow_id)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get("/{run_id}", response_model=RunRead)
async def get_run(run_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Run:
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    return run


@router.get("/{run_id}/messages", response_model=list[MessageRead])
async def list_messages(
    run_id: uuid.UUID,
    limit: int = Query(default=50, ge=1, le=200),
    offset: int = Query(default=0, ge=0),
    db: AsyncSession = Depends(get_db),
) -> list[Message]:
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")
    q = (
        select(Message)
        .where(Message.run_id == run_id)
        .order_by(Message.timestamp)
        .limit(limit)
        .offset(offset)
    )
    result = await db.execute(q)
    return list(result.scalars().all())
