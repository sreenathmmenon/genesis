from __future__ import annotations

import asyncio
import uuid
from typing import Any

from fastapi import APIRouter, BackgroundTasks, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from genesis.database import get_db
from genesis.models.genesis_build import BuildStatus, GenesisBuild
from genesis.models.schemas import GenesisBuildCreate, GenesisBuildRead, IntentRequest
from genesis.models.workflow import Workflow, WorkflowStatus
from genesis.utils.audit import audit
from genesis.utils.logger import get_logger
from genesis.utils.redis_client import BUILD_PROGRESS, redis_client

router = APIRouter(prefix="/genesis", tags=["genesis"])
logger = get_logger("genesis.api.genesis")

# In-memory registry of running build tasks {build_id: asyncio.Task}
_running_builds: dict[str, asyncio.Task] = {}


# ── Internal helpers ───────────────────────────────────────────────────────────

async def start_build_from_intent(intent: str, db: AsyncSession | None = None) -> str:
    """Create a GenesisBuild record and kick off the pipeline. Returns build_id."""
    from genesis.database import async_session

    build_id = str(uuid.uuid4())

    async with async_session() as session:
        build = GenesisBuild(
            id=uuid.UUID(build_id),
            intent=intent,
            status=BuildStatus.decomposing,
        )
        session.add(build)
        await session.commit()

    task = asyncio.create_task(_run_build_pipeline(build_id, intent))
    _running_builds[build_id] = task
    task.add_done_callback(lambda _: _running_builds.pop(build_id, None))

    return build_id


async def _run_build_pipeline(build_id: str, intent: str) -> None:
    logger.info("Starting genesis build pipeline: build_id=%s", build_id)
    try:
        from genesis.database import async_session
        from genesis.agents.graph_compiler import run_genesis_build
        logger.info("graph_compiler imported OK, running pipeline build_id=%s", build_id)
        result = await run_genesis_build(intent=intent, build_id=build_id)
        logger.info("Pipeline complete build_id=%s status=%s", build_id, result.get("status"))

        async with async_session() as session:
            build = await session.get(GenesisBuild, uuid.UUID(build_id))
            if not build:
                return

            if result.get("error"):
                build.status = BuildStatus.failed
            else:
                build.status = BuildStatus.awaiting_approval
                build.architect_output = result.get("architect_output")
                build.decomposer_output = result.get("decomposer_output")
                build.builder_output = result.get("builder_output")
                build.critic_feedback = {"items": result.get("critic_feedback") or []}
                build.validator_report = result.get("validator_report")
                build.workflow_id = (
                    uuid.UUID(result["workflow_id"]) if result.get("workflow_id") else None
                )
                build.iterations = result.get("iteration_count", 1)

            await session.commit()

    except Exception as exc:
        logger.exception("Build pipeline error for build_id=%s", build_id)
        async with async_session() as session:
            build = await session.get(GenesisBuild, uuid.UUID(build_id))
            if build:
                build.status = BuildStatus.failed
                await session.commit()


# ── Routes ─────────────────────────────────────────────────────────────────────

@router.post("/build", response_model=dict, status_code=202)
async def start_build(
    body: IntentRequest,
    background_tasks: BackgroundTasks,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    build_id = await start_build_from_intent(body.intent, db)
    await audit("build.started", "build", build_id, detail={"intent": body.intent[:200]})
    return {"build_id": build_id, "status": "decomposing"}


@router.get("/builds", response_model=list[GenesisBuildRead])
async def list_builds(
    limit: int = 20,
    db: AsyncSession = Depends(get_db),
) -> list[GenesisBuild]:
    from sqlalchemy import select, desc
    result = await db.execute(
        select(GenesisBuild).order_by(desc(GenesisBuild.created_at)).limit(limit)
    )
    return list(result.scalars().all())


@router.get("/builds/{build_id}", response_model=GenesisBuildRead)
async def get_build(
    build_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> GenesisBuild:
    build = await db.get(GenesisBuild, build_id)
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    return build


@router.post("/deploy/{build_id}", response_model=dict)
async def deploy_build(
    build_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, Any]:
    build = await db.get(GenesisBuild, build_id)
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")
    if build.status not in (BuildStatus.awaiting_approval, BuildStatus.validating):
        raise HTTPException(
            status_code=409,
            detail=f"Build is in status '{build.status}' — cannot deploy",
        )

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
    db.add(workflow)
    await db.flush()

    build.status = BuildStatus.deployed
    build.workflow_id = workflow.id
    await db.commit()
    await db.refresh(workflow)

    workflow_id_str = str(workflow.id)

    if schedule_expr:
        try:
            from genesis.utils.scheduler import schedule_workflow
            await schedule_workflow(workflow_id_str, schedule_expr)
            logger.info("Scheduled workflow %s with cron '%s'", workflow_id_str, schedule_expr)
        except Exception as exc:
            logger.error("Failed to schedule workflow %s: %s", workflow_id_str, exc)

    await redis_client.publish(
        BUILD_PROGRESS,
        {
            "build_id": str(build_id),
            "action": "deployed",
            "workflow_id": workflow_id_str,
        },
    )
    await audit("build.deployed", "build", str(build_id), detail={"workflow_id": workflow_id_str, "workflow_name": workflow.name})
    await audit("workflow.deployed", "workflow", workflow_id_str, workflow.name, {"build_id": str(build_id), "schedule_expr": schedule_expr})

    return {
        "workflow_id": workflow_id_str,
        "status": "deployed",
        "name": workflow.name,
        "schedule_expr": schedule_expr,
    }


@router.post("/cancel/{build_id}", response_model=dict)
async def cancel_build(
    build_id: uuid.UUID,
    db: AsyncSession = Depends(get_db),
) -> dict[str, str]:
    build = await db.get(GenesisBuild, build_id)
    if not build:
        raise HTTPException(status_code=404, detail="Build not found")

    task = _running_builds.get(str(build_id))
    if task and not task.done():
        task.cancel()

    build.status = BuildStatus.failed
    await db.commit()

    await redis_client.publish(
        BUILD_PROGRESS,
        {"build_id": str(build_id), "action": "cancelled"},
    )

    return {"build_id": str(build_id), "status": "cancelled"}
