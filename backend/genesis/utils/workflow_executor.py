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
    run_id: str | None = None,
) -> dict[str, Any]:
    """Execute a deployed workflow and persist the run record."""
    run_id = run_id or str(uuid.uuid4())
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
        logger.info(
            "Workflow %s run %s — nodes executed: %s",
            workflow_id, run_id, list(final_output.keys())
        )
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

        # ── Auto-repair on failure ────────────────────────────────────────────
        if error and not (input_data or {}).get("_repair_run"):
            await _attempt_repair(workflow_id, run_id, error, graph_json)

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
                content=str({k: str(v)[:500] for k, v in final_output.items()})[:8000] if not error else error,
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


async def _attempt_repair(
    workflow_id: str,
    failed_run_id: str,
    error: str,
    graph_json: dict,
) -> None:
    """Try to repair the workflow after a failed run."""
    from genesis.agents.repair_agent import repair_node

    logger.info("Attempting auto-repair for workflow %s", workflow_id)

    nodes: list[dict] = []
    intent: str = ""
    workflow_name: str = ""
    current_repair_count: int = 0

    async with async_session() as session:
        workflow = await session.get(Workflow, uuid.UUID(workflow_id))
        if not workflow:
            return
        current_repair_count = workflow.repair_count or 0
        if current_repair_count >= 3:
            logger.warning(
                "Workflow %s hit max repair attempts (%d), skipping",
                workflow_id,
                current_repair_count,
            )
            return

        nodes = (workflow.graph_json or {}).get("nodes", [])
        if not nodes:
            return

        intent = workflow.intent or ""
        workflow_name = workflow.name

    # Try to repair the entry node — most failures originate there
    target_node = nodes[0]
    repaired_node = await repair_node(
        node=target_node,
        error=error,
        recent_output="",
        workflow_intent=intent,
    )

    if not repaired_node:
        return

    # Patch the graph_json with the repaired node
    new_nodes = []
    for n in nodes:
        if n.get("id") == repaired_node.get("node_id"):
            patched = {**n}
            patched["system_prompt"] = repaired_node["system_prompt"]
            patched["tools"] = repaired_node.get("tools", n.get("tools") or [])
            patched["model_name"] = repaired_node.get("model_name", n.get("model_name"))
            new_nodes.append(patched)
        else:
            new_nodes.append(n)

    new_graph_json = {**graph_json, "nodes": new_nodes}

    # Persist the repaired graph and update counters
    async with async_session() as session:
        workflow = await session.get(Workflow, uuid.UUID(workflow_id))
        if not workflow:
            return
        workflow.graph_json = new_graph_json
        workflow.repair_count = (workflow.repair_count or 0) + 1
        workflow.last_repair_at = datetime.now(tz=timezone.utc)

        failed_run = await session.get(Run, uuid.UUID(failed_run_id))
        if failed_run:
            failed_run.repair_attempted = True

        await session.commit()

    repair_reason = repaired_node.get("repair_reason", "unknown issue")

    # Notify user via Telegram (best-effort)
    try:
        from genesis.channels.telegram import telegram_bridge
        await telegram_bridge.send_message(
            f"Auto-repaired workflow '{workflow_name}'\n\n"
            f"Issue: {repair_reason}\n\n"
            f"Retrying now..."
        )
    except Exception as tg_exc:
        logger.debug("Telegram repair notification skipped: %s", tg_exc)

    # Publish repair event to Redis
    await redis_client.publish(
        RUN_EVENTS,
        {
            "type": "run_event",
            "event": "workflow_repaired",
            "workflow_id": workflow_id,
            "repair_reason": repair_reason,
            "timestamp": _now_iso(),
        },
    )

    # Retry the workflow with the repaired graph
    logger.info("Retrying workflow %s after repair", workflow_id)
    await execute_deployed_workflow(
        workflow_id=workflow_id,
        input_data={"_repair_run": True},
    )
