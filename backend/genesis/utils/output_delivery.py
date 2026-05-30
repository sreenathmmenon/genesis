"""
Output delivery — fires after every run completion.
Sends structured output to: webhook URL (if configured), and persists output_data on the Run.
Universal: works for any workflow regardless of tools used.
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

import httpx

from genesis.utils.logger import get_logger

logger = get_logger("genesis.output_delivery")


def build_output_payload(
    run_id: str,
    workflow_id: str,
    workflow_name: str,
    status: str,
    final_output: dict[str, Any],
    messages: list[dict[str, Any]],
    token_count: int,
    estimated_cost: float,
    started_at: datetime,
    completed_at: datetime,
    error: str | None = None,
) -> dict[str, Any]:
    """Build a clean, universal output payload — works for any consumer."""
    # Extract the most human-readable summary from agent outputs
    summary = _extract_summary(final_output, messages)

    # Structure outputs per agent — each key is an agent node, value is what it produced
    agent_outputs: dict[str, str] = {}
    for k, v in final_output.items():
        if v and not str(v).startswith("LLM_ERROR"):
            agent_outputs[k[:80]] = str(v)[:2000]

    duration_seconds = round((completed_at - started_at).total_seconds(), 1)

    return {
        "run_id": run_id,
        "workflow_id": workflow_id,
        "workflow_name": workflow_name,
        "status": status,
        "summary": summary,
        "agent_outputs": agent_outputs,
        "error": error,
        "token_count": token_count,
        "estimated_cost_usd": round(estimated_cost, 6),
        "duration_seconds": duration_seconds,
        "started_at": started_at.isoformat(),
        "completed_at": completed_at.isoformat(),
        "result_url": f"/runs/{run_id}",
    }


def _extract_summary(final_output: dict[str, Any], messages: list[dict[str, Any]]) -> str:
    """Best-effort human-readable summary from agent outputs."""
    # Prefer the last agent_output message
    for msg in reversed(messages):
        if msg.get("message_type") == "agent_output" and msg.get("content"):
            return str(msg["content"])[:500]

    # Fall back to last non-empty agent output value
    for v in reversed(list(final_output.values())):
        text = str(v).strip()
        if text and not text.startswith("ERROR") and not text.startswith("LLM_ERROR"):
            return text[:500]

    return "Agent run completed."


async def fire_webhook(webhook_url: str, payload: dict[str, Any]) -> bool:
    """POST output payload to the workflow's configured webhook URL. Returns True on success."""
    try:
        async with httpx.AsyncClient(timeout=15.0) as client:
            resp = await client.post(
                webhook_url,
                json=payload,
                headers={
                    "Content-Type": "application/json",
                    "User-Agent": "Genesis-Agent/1.0",
                    "X-Genesis-Run-Id": payload.get("run_id", ""),
                    "X-Genesis-Workflow-Id": payload.get("workflow_id", ""),
                },
            )
            if resp.status_code < 300:
                logger.info("Webhook delivered: url=%s run_id=%s status=%d", webhook_url, payload.get("run_id"), resp.status_code)
                return True
            else:
                logger.warning("Webhook non-2xx: url=%s status=%d body=%s", webhook_url, resp.status_code, resp.text[:200])
                return False
    except Exception as exc:
        logger.error("Webhook delivery failed: url=%s error=%s", webhook_url, exc)
        return False
