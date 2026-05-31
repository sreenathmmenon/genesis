from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime, timezone
from typing import Any

from langchain_core.messages import HumanMessage

from genesis.agents.state import WorkflowState
from genesis.database import async_session
from genesis.models.run import Message, MessageType, Run, RunStatus
from genesis.models.workflow import Workflow
from genesis.utils.audit import audit
from genesis.utils.logger import get_logger
from genesis.utils.output_delivery import build_output_payload, fire_webhook
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

    workflow_name = ""
    webhook_url: str | None = None

    async with async_session() as session:
        workflow = await session.get(Workflow, uuid.UUID(workflow_id))
        if not workflow:
            logger.error("Workflow %s not found", workflow_id)
            return {"error": "workflow_not_found", "workflow_id": workflow_id}

        graph_json: dict = workflow.graph_json or {}
        workflow_name = workflow.name
        webhook_url = workflow.webhook_url

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
    await audit("run.started", "run", run_id, detail={"workflow_id": workflow_id})

    total_tokens = 0
    error: str | None = None
    final_output: dict[str, Any] = {}
    last_conclusion: str = ""

    _MSG_TYPE_MAP = {
        "node_started": MessageType.state_update,
        "tool_called": MessageType.tool_call,
        "tool_result": MessageType.tool_result,
        "agent_conclusion": MessageType.agent_output,
    }
    _RECEIVER_MAP = {
        "node_started": "system",
        "tool_called": "tool",
        "tool_result": "tool",
        "agent_conclusion": "user",
    }

    async def _db_writer(event: dict) -> None:
        nonlocal last_conclusion
        event_type: str = event.get("type", "")
        msg_type = _MSG_TYPE_MAP.get(event_type, MessageType.state_update)
        receiver = _RECEIVER_MAP.get(event_type, "system")
        node = event.get("node", "system")

        if event_type == "node_started":
            content = f"Agent '{event.get('agent_name', node)}' started"
            sender = "system"
        elif event_type == "tool_called":
            args_repr = json.dumps(event.get("args", {}), ensure_ascii=False)[:300]
            content = f"{event.get('tool', '')}({args_repr})"
            sender = node
        elif event_type == "tool_result":
            result_text = str(event.get("result", ""))[:2000]
            content = result_text
            sender = event.get("tool", node)
        elif event_type == "agent_conclusion":
            content = str(event.get("content", ""))[:8000]
            last_conclusion = content
            sender = node
        else:
            content = str(event)[:2000]
            sender = node

        try:
            async with async_session() as _sess:
                _sess.add(
                    Message(
                        run_id=uuid.UUID(run_id),
                        sender_agent=sender[:255],
                        receiver_agent=receiver,
                        content=content,
                        message_type=msg_type,
                    )
                )
                await _sess.commit()
        except Exception as _exc:
            logger.error("db_writer failed to persist message: %s", _exc)

        try:
            await redis_client.publish(
                RUN_EVENTS,
                {
                    "type": "trace_event",
                    "run_id": run_id,
                    "event": event,
                    "timestamp": _now_iso(),
                },
            )
        except Exception as _exc:
            logger.debug("db_writer redis publish failed: %s", _exc)

    try:
        from genesis.agents.graph_compiler import compile_workflow_from_json

        compiled = await compile_workflow_from_json(graph_json, db_writer=_db_writer)

        # Build a clear initial message so the first agent knows its task
        _input = input_data or {}
        intent = _input.get("intent", "")
        if intent:
            initial_msg = f"Task: {intent}"
        elif _input and not _input.get("_repair_run"):
            initial_msg = "Task: " + "; ".join(f"{k}={v}" for k, v in _input.items() if not k.startswith("_"))
        else:
            initial_msg = f"Task: {workflow_name}. Execute your assigned role now."

        initial: WorkflowState = {
            "workflow_id": workflow_id,
            "run_id": run_id,
            "input_data": _input,
            "intermediate_results": {},
            "final_output": None,
            "error": None,
            "messages": [HumanMessage(content=initial_msg)],
        }

        result = await asyncio.wait_for(compiled.ainvoke(initial), timeout=300.0)
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
        await audit("run.completed", "run", run_id, detail={"workflow_id": workflow_id, "token_count": total_tokens})

    except asyncio.TimeoutError:
        logger.error("Workflow execution timed out after 300s: workflow_id=%s run_id=%s", workflow_id, run_id)
        error = "Workflow execution timed out after 5 minutes."
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
        await audit("run.failed", "run", run_id, detail={"workflow_id": workflow_id, "error": error})
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
        await audit("run.failed", "run", run_id, detail={"workflow_id": workflow_id, "error": error})

        # ── Auto-repair on failure ────────────────────────────────────────────
        if error and not (input_data or {}).get("_repair_run"):
            await _attempt_repair(workflow_id, run_id, error, graph_json)

    completed_at = datetime.now(tz=timezone.utc)

    from genesis.agents.monitor_agent import estimate_cost, record_run_stats
    final_status = RunStatus.failed if error else RunStatus.completed
    estimated_cost = estimate_cost(total_tokens)

    await record_run_stats(
        workflow_id=workflow_id,
        run_id=run_id,
        status=final_status,
        token_count=total_tokens,
        error=error,
        started_at=started_at,
        completed_at=completed_at,
    )

    # Build structured output payload — universal, not tied to any messaging channel
    output_payload = build_output_payload(
        run_id=run_id,
        workflow_id=workflow_id,
        workflow_name=workflow_name,
        status=final_status.value,
        final_output=final_output,
        messages=[],
        token_count=total_tokens,
        estimated_cost=estimated_cost,
        started_at=started_at,
        completed_at=completed_at,
        error=error,
    )

    async with async_session() as session:
        # Persist structured output on the run record
        run_record = await session.get(Run, uuid.UUID(run_id))
        if run_record:
            run_record.output_data = output_payload
            await session.flush()

        final_content = error if error else (last_conclusion or output_payload.get("summary", ""))
        session.add(
            Message(
                run_id=uuid.UUID(run_id),
                sender_agent="executor",
                receiver_agent="user",
                content=final_content[:8000],
                message_type=MessageType.agent_output,
            )
        )
        await session.commit()

    # Fire webhook if configured — universal delivery to any URL
    if webhook_url and not error:
        await fire_webhook(webhook_url, output_payload)
        await audit("run.webhook_fired", "run", run_id, detail={"webhook_url": webhook_url[:100]})

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
        "output": output_payload,
        "token_count": total_tokens,
        "estimated_cost_usd": estimated_cost,
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
    await audit("workflow.auto_repaired", "workflow", workflow_id, workflow_name, {"repair_reason": repair_reason, "failed_run_id": failed_run_id})

    # Retry the workflow with the repaired graph
    logger.info("Retrying workflow %s after repair", workflow_id)
    await execute_deployed_workflow(
        workflow_id=workflow_id,
        input_data={"_repair_run": True},
    )
