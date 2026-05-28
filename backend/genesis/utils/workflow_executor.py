from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage

from genesis.agents.state import WorkflowState
from genesis.database import async_session
from genesis.models.run import Message, MessageType, Run, RunStatus
from genesis.models.workflow import Workflow
from genesis.utils.logger import get_logger
from genesis.utils.redis_client import RUN_EVENTS, redis_client

logger = get_logger("genesis.workflow_executor")


def _now_iso() -> str:
    return datetime.now(tz=timezone.utc).isoformat()


async def execute_deployed_workflow(
    workflow_id: str,
    input_data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Execute a deployed workflow and persist the run record."""
    run_id = str(uuid.uuid4())
    started_at = datetime.now(tz=timezone.utc)

    async with async_session() as session:
        workflow = await session.get(Workflow, uuid.UUID(workflow_id))
        if not workflow:
            logger.error("Workflow %s not found", workflow_id)
            return {"error": "workflow_not_found", "workflow_id": workflow_id}

        graph_json: dict = workflow.graph_json or {}

        run = Run(
            id=uuid.UUID(run_id),
            workflow_id=uuid.UUID(workflow_id),
            status=RunStatus.running,
            started_at=started_at,
        )
        session.add(run)
        await session.commit()

    await redis_client.publish(
        RUN_EVENTS,
        {
            "type": "run_event",
            "event": "run_started",
            "workflow_id": workflow_id,
            "run_id": run_id,
            "timestamp": _now_iso(),
        },
    )

    total_tokens = 0
    error: str | None = None
    final_output: dict[str, Any] = {}

    try:
        from genesis.agents.graph_compiler import compile_workflow_from_json

        compiled = await compile_workflow_from_json(graph_json)

        initial: WorkflowState = {
            "workflow_id": workflow_id,
            "run_id": run_id,
            "input_data": input_data or {},
            "intermediate_results": {},
            "final_output": None,
            "error": None,
            "messages": [HumanMessage(content=str(input_data or {}))],
        }

        result = await compiled.ainvoke(initial)
        final_output = result.get("intermediate_results", {})
        total_tokens = sum(len(str(v)) // 4 for v in final_output.values())

        await redis_client.publish(
            RUN_EVENTS,
            {
                "type": "run_event",
                "event": "run_completed",
                "workflow_id": workflow_id,
                "run_id": run_id,
                "token_count": total_tokens,
                "timestamp": _now_iso(),
            },
        )

    except Exception as exc:
        logger.exception("Workflow execution failed: workflow_id=%s run_id=%s", workflow_id, run_id)
        error = str(exc)
        await redis_client.publish(
            RUN_EVENTS,
            {
                "type": "run_event",
                "event": "run_failed",
                "workflow_id": workflow_id,
                "run_id": run_id,
                "error": error,
                "timestamp": _now_iso(),
            },
        )

    completed_at = datetime.now(tz=timezone.utc)

    from genesis.agents.monitor_agent import estimate_cost, record_run_stats
    final_status = RunStatus.failed if error else RunStatus.completed

    await record_run_stats(
        workflow_id=workflow_id,
        run_id=run_id,
        status=final_status,
        token_count=total_tokens,
        error=error,
        started_at=started_at,
        completed_at=completed_at,
    )

    async with async_session() as session:
        session.add(
            Message(
                run_id=uuid.UUID(run_id),
                sender_agent="executor",
                receiver_agent="user",
                content=str(final_output)[:2000] if not error else error,
                message_type=MessageType.agent_output,
            )
        )
        await session.commit()

    logger.info(
        "Workflow %s run %s completed: status=%s tokens=%d",
        workflow_id,
        run_id,
        final_status.value,
        total_tokens,
    )

    return {
        "run_id": run_id,
        "workflow_id": workflow_id,
        "status": final_status.value,
        "final_output": final_output,
        "token_count": total_tokens,
        "estimated_cost_usd": estimate_cost(total_tokens),
        "error": error,
    }
