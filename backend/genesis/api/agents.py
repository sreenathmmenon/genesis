import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from genesis.database import get_db
from genesis.models import Agent
from genesis.models.schemas import AgentCreate, AgentRead, AgentUpdate
from genesis.utils.audit import audit

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/agents", tags=["agents"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.post("/", response_model=AgentRead, status_code=status.HTTP_201_CREATED)
async def create_agent(body: AgentCreate, db: AsyncSession = Depends(get_db)) -> Agent:
    agent = Agent(**body.model_dump())
    db.add(agent)
    await db.flush()
    await db.refresh(agent)
    logger.info("Agent created: %s (%s)", agent.name, agent.id)
    return agent


@router.get("/", response_model=list[AgentRead])
async def list_agents(
    workflow_id: uuid.UUID | None = Query(default=None),
    db: AsyncSession = Depends(get_db),
) -> list[Agent]:
    q = select(Agent).where(Agent.deleted_at.is_(None))
    if workflow_id:
        q = q.where(Agent.workflow_id == workflow_id)
    result = await db.execute(q)
    return list(result.scalars().all())


@router.get("/{agent_id}", response_model=AgentRead)
async def get_agent(agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> Agent:
    agent = await db.get(Agent, agent_id)
    if not agent or agent.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Agent not found")
    return agent


@router.put("/{agent_id}", response_model=AgentRead)
async def replace_agent(
    agent_id: uuid.UUID,
    body: AgentCreate,
    db: AsyncSession = Depends(get_db),
) -> Agent:
    agent = await db.get(Agent, agent_id)
    if not agent or agent.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Agent not found")
    for field, value in body.model_dump().items():
        setattr(agent, field, value)
    await db.flush()
    await db.refresh(agent)
    logger.info("Agent replaced: %s", agent_id)
    return agent


@router.patch("/{agent_id}", response_model=AgentRead)
async def patch_agent(
    agent_id: uuid.UUID,
    body: AgentUpdate,
    db: AsyncSession = Depends(get_db),
) -> Agent:
    agent = await db.get(Agent, agent_id)
    if not agent or agent.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Agent not found")
    for field, value in body.model_dump(exclude_unset=True).items():
        setattr(agent, field, value)
    await db.flush()
    await db.refresh(agent)
    logger.info("Agent patched: %s", agent_id)
    changed = list(body.model_dump(exclude_unset=True).keys())
    await audit("agent.config_changed", "agent", str(agent_id), agent.name, {"fields_changed": changed, "workflow_id": str(agent.workflow_id) if agent.workflow_id else None})
    return agent


@router.delete("/{agent_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_agent(agent_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> None:
    agent = await db.get(Agent, agent_id)
    if not agent or agent.deleted_at is not None:
        raise HTTPException(status_code=404, detail="Agent not found")
    agent.deleted_at = _now()
    await db.flush()
    logger.info("Agent soft-deleted: %s", agent_id)
