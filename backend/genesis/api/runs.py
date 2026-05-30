from __future__ import annotations

import asyncio
import json
import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query
from fastapi.responses import PlainTextResponse, Response
from sqlalchemy import select
from sqlalchemy.ext.asyncio import AsyncSession

from genesis.database import get_db
from genesis.models import Run, Message, Workflow
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


@router.get("/{run_id}/output")
async def get_run_output(run_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict[str, Any]:
    """Return structured output for a run — works for any workflow, any output destination."""
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    if run.output_data:
        return run.output_data

    # Fallback: build from messages if output_data not yet persisted (older runs)
    q = select(Message).where(Message.run_id == run_id).order_by(Message.timestamp)
    result = await db.execute(q)
    messages = list(result.scalars().all())

    agent_outputs: dict[str, str] = {}
    summary = ""
    for msg in messages:
        if msg.message_type.value == "agent_output" and msg.content:
            agent_outputs[msg.sender_agent] = msg.content[:2000]
            summary = msg.content[:500]

    return {
        "run_id": str(run_id),
        "workflow_id": str(run.workflow_id),
        "status": run.status.value,
        "summary": summary or "Run completed.",
        "agent_outputs": agent_outputs,
        "error": run.error,
        "token_count": run.token_count_total,
        "estimated_cost_usd": float(run.estimated_cost_usd),
        "started_at": run.started_at.isoformat(),
        "completed_at": run.completed_at.isoformat() if run.completed_at else None,
    }


@router.get("/{run_id}/download")
async def download_run_output(
    run_id: uuid.UUID,
    fmt: str = Query(default="text", pattern="^(text|json|csv)$"),
    db: AsyncSession = Depends(get_db),
) -> Response:
    """Download run output as text, JSON, or CSV."""
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    output = run.output_data or {}
    workflow_name = "run"

    wf = await db.get(Workflow, run.workflow_id)
    if wf:
        workflow_name = wf.name.lower().replace(" ", "_")

    filename_base = f"genesis_{workflow_name}_{str(run_id)[:8]}"

    if fmt == "json":
        content = json.dumps(output, indent=2, default=str)
        return Response(
            content=content,
            media_type="application/json",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.json"'},
        )

    if fmt == "csv":
        agent_outputs: dict = output.get("agent_outputs", {})
        rows = ["agent,output"]
        for agent, text in agent_outputs.items():
            safe = str(text).replace('"', '""').replace('\n', ' ')
            rows.append(f'"{agent}","{safe}"')
        content = "\n".join(rows)
        return Response(
            content=content,
            media_type="text/csv",
            headers={"Content-Disposition": f'attachment; filename="{filename_base}.csv"'},
        )

    # Plain text
    lines = [
        f"Genesis Agent Run — {workflow_name}",
        f"Run ID: {run_id}",
        f"Status: {run.status.value}",
        f"Started: {run.started_at.isoformat()}",
        "",
        "── Summary ──────────────────────────────────────",
        output.get("summary", "No summary available."),
        "",
        "── Agent Outputs ─────────────────────────────────",
    ]
    for agent, text in (output.get("agent_outputs") or {}).items():
        lines += [f"\n[{agent}]", str(text)]

    if run.error:
        lines += ["", "── Error ─────────────────────────────────────────", run.error]

    lines += [
        "",
        "── Stats ─────────────────────────────────────────",
        f"Tokens: {run.token_count_total:,}",
        f"Cost: ${float(run.estimated_cost_usd):.6f}",
    ]

    content = "\n".join(lines)
    return PlainTextResponse(
        content=content,
        headers={"Content-Disposition": f'attachment; filename="{filename_base}.txt"'},
    )


@router.post("/{run_id}/rerun")
async def rerun(run_id: uuid.UUID, db: AsyncSession = Depends(get_db)) -> dict[str, str]:
    """Re-execute a run's workflow with the same configuration."""
    run = await db.get(Run, run_id)
    if not run:
        raise HTTPException(status_code=404, detail="Run not found")

    wf = await db.get(Workflow, run.workflow_id)
    if not wf:
        raise HTTPException(status_code=404, detail="Workflow not found")

    from genesis.utils.workflow_executor import execute_deployed_workflow
    new_run_id = str(uuid.uuid4())
    asyncio.create_task(execute_deployed_workflow(str(run.workflow_id), run_id=new_run_id))

    logger.info("Rerun triggered: original_run=%s new_run=%s workflow=%s", run_id, new_run_id, run.workflow_id)
    return {"run_id": new_run_id, "workflow_id": str(run.workflow_id), "status": "running"}
