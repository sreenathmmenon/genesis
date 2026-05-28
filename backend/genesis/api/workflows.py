import logging
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from genesis.database import get_db
from genesis.models import Workflow
from genesis.models.workflow import WorkflowStatus
from genesis.models.schemas import WorkflowCreate, WorkflowRead, WorkflowUpdate

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/workflows", tags=["workflows"])


def _now() -> datetime:
    return datetime.now(timezone.utc)


@router.post("/", response_model=WorkflowRead, status_code=status.HTTP_201_CREATED)
async def create_workflow(
    body: WorkflowCreate, db: AsyncSession = Depends(get_db)
) -> Workflow:
    wf = Workflow(**body.model_dump())
    db.add(wf)
    await db.flush()
    await db.refresh(wf)
    logger.info("Workflow created: %s (%s)", wf.name, wf.id)
    return wf


@router.get("/", response_model=list[WorkflowRead])
async def list_workflows(db: AsyncSession = Depends(get_db)) -> list[Workflow]:
    result = await db.execute(select(Workflow))
    return list(result.scalars().all())


@router.get("/{workflow_id}", response_model=WorkflowRead)
async def get_workflow(
    workflow_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> Workflow:
    wf = await db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return wf


@router.put("/{workflow_id}", response_model=WorkflowRead)
async def replace_workflow(
    workflow_id: uuid.UUID, body: WorkflowCreate, db: AsyncSession = Depends(get_db)
) -> Workflow:
    wf = await db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    for field, value in body.model_dump().items():
        setattr(wf, field, value)
    await db.flush()
    await db.refresh(wf)
    return wf


@router.delete("/{workflow_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_workflow(
    workflow_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> None:
    wf = await db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    await db.delete(wf)
    await db.flush()
    logger.info("Workflow deleted: %s", workflow_id)


@router.post("/{workflow_id}/deploy", response_model=WorkflowRead)
async def deploy_workflow(
    workflow_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> Workflow:
    wf = await db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    wf.status = WorkflowStatus.active
    await db.flush()
    await db.refresh(wf)
    logger.info("Workflow deployed: %s", workflow_id)
    return wf


@router.post("/{workflow_id}/pause", response_model=WorkflowRead)
async def pause_workflow(
    workflow_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> Workflow:
    wf = await db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    wf.status = WorkflowStatus.paused
    await db.flush()
    await db.refresh(wf)
    logger.info("Workflow paused: %s", workflow_id)
    return wf


@router.get("/{workflow_id}/export")
async def export_workflow(
    workflow_id: uuid.UUID, db: AsyncSession = Depends(get_db)
) -> dict:
    wf = await db.get(Workflow, workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")
    return {
        "name": wf.name,
        "description": wf.description,
        "intent": wf.intent,
        "graph_json": wf.graph_json,
        "canvas_json": wf.canvas_json,
        "agents": [
            {
                "name": a.name,
                "role": a.role,
                "system_prompt": a.system_prompt,
                "model_name": a.model_name,
                "tools": a.tools,
                "memory_type": a.memory_type,
                "guardrails": a.guardrails,
            }
            for a in wf.agents
            if a.deleted_at is None
        ],
    }
