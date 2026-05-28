from __future__ import annotations

import uuid
from datetime import datetime, timezone
from typing import Any

from sqlalchemy import select

from genesis.database import async_session
from genesis.models.run import Run, RunStatus
from genesis.utils.logger import get_logger
from genesis.utils.redis_client import MONITOR_STREAM, redis_client

logger = get_logger("genesis.monitor_agent")

_COST_PER_1K_TOKENS = 0.009  # blended rate USD


def estimate_cost(token_count: int) -> float:
    return round(token_count / 1000 * _COST_PER_1K_TOKENS, 6)


async def record_run_stats(
    workflow_id: str,
    run_id: str,
    status: RunStatus,
    token_count: int,
    error: str | None = None,
    started_at: datetime | None = None,
    completed_at: datetime | None = None,
) -> None:
    """Persist run statistics to the DB and publish to the monitor stream."""
    try:
        async with async_session() as session:
            run = await session.get(Run, uuid.UUID(run_id))
            if run:
                run.status = status
                run.token_count_total = token_count
                run.estimated_cost_usd = estimate_cost(token_count)
                run.error = error
                if completed_at:
                    run.completed_at = completed_at
                await session.commit()

        await redis_client.publish(
            MONITOR_STREAM,
            {
                "event": "run_stats",
                "run_id": run_id,
                "workflow_id": workflow_id,
                "status": status.value,
                "token_count": token_count,
                "estimated_cost_usd": estimate_cost(token_count),
                "error": error,
                "timestamp": datetime.now(tz=timezone.utc).isoformat(),
            },
        )
    except Exception as exc:
        logger.warning("Failed to record run stats: %s", exc)


async def get_workflow_stats(workflow_id: str) -> dict[str, Any]:
    """Return aggregated stats for a workflow across all its runs."""
    try:
        async with async_session() as session:
            result = await session.execute(
                select(Run).where(Run.workflow_id == uuid.UUID(workflow_id))
            )
            runs = list(result.scalars().all())

        if not runs:
            return {"workflow_id": workflow_id, "total_runs": 0}

        total_tokens = sum(r.token_count_total for r in runs)
        total_cost = sum(r.estimated_cost_usd for r in runs)
        success_count = sum(1 for r in runs if r.status == RunStatus.completed)
        failure_count = sum(1 for r in runs if r.status == RunStatus.failed)

        durations = [
            (r.completed_at - r.started_at).total_seconds()
            for r in runs
            if r.completed_at and r.started_at
        ]
        avg_duration = sum(durations) / len(durations) if durations else 0.0

        return {
            "workflow_id": workflow_id,
            "total_runs": len(runs),
            "success_count": success_count,
            "failure_count": failure_count,
            "success_rate": round(success_count / len(runs) * 100, 1),
            "total_tokens": total_tokens,
            "total_cost_usd": round(total_cost, 4),
            "avg_duration_seconds": round(avg_duration, 1),
        }
    except Exception as exc:
        logger.warning("Failed to fetch workflow stats: %s", exc)
        return {"workflow_id": workflow_id, "error": str(exc)}
