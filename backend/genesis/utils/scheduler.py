from __future__ import annotations

import uuid
from typing import Any

from apscheduler.jobstores.sqlalchemy import SQLAlchemyJobStore
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

from genesis.config import settings
from genesis.utils.logger import get_logger

logger = get_logger("genesis.scheduler")

_scheduler: AsyncIOScheduler | None = None


def get_scheduler() -> AsyncIOScheduler:
    global _scheduler
    if _scheduler is None:
        job_stores = {
            "default": SQLAlchemyJobStore(url=settings.sync_database_url),
        }
        _scheduler = AsyncIOScheduler(
            jobstores=job_stores,
            timezone="UTC",
        )
    return _scheduler


async def start_scheduler() -> None:
    scheduler = get_scheduler()
    if not scheduler.running:
        scheduler.start()
        logger.info("APScheduler started")


async def stop_scheduler() -> None:
    scheduler = get_scheduler()
    if scheduler.running:
        scheduler.shutdown(wait=False)
        logger.info("APScheduler stopped")


async def schedule_workflow(
    workflow_id: str,
    cron_expr: str,
    input_data: dict[str, Any] | None = None,
) -> str:
    """Add a cron-scheduled job for an operational workflow. Returns job_id."""
    from genesis.database import async_session
    from genesis.models.workflow import Workflow
    from genesis.utils.workflow_executor import execute_deployed_workflow
    import uuid as _uuid

    parts = cron_expr.strip().split()
    if len(parts) != 5:
        raise ValueError(f"Invalid cron expression: '{cron_expr}' (expected 5 fields)")

    # Load the workflow intent so scheduled runs have proper initial context
    async with async_session() as session:
        wf = await session.get(Workflow, _uuid.UUID(workflow_id))
        intent = wf.intent if wf else ""

    merged_input = {"intent": intent, **(input_data or {})}

    minute, hour, day, month, day_of_week = parts
    trigger = CronTrigger(
        minute=minute,
        hour=hour,
        day=day,
        month=month,
        day_of_week=day_of_week,
        timezone="UTC",
    )

    job_id = f"workflow_{workflow_id}"
    scheduler = get_scheduler()

    scheduler.add_job(
        execute_deployed_workflow,
        trigger=trigger,
        id=job_id,
        kwargs={"workflow_id": workflow_id, "input_data": merged_input},
        replace_existing=True,
        misfire_grace_time=300,
    )

    logger.info("Scheduled workflow %s with cron '%s' (job_id=%s)", workflow_id, cron_expr, job_id)
    return job_id


async def unschedule_workflow(workflow_id: str) -> bool:
    """Remove a scheduled job for a workflow. Returns True if removed."""
    job_id = f"workflow_{workflow_id}"
    scheduler = get_scheduler()
    try:
        scheduler.remove_job(job_id)
        logger.info("Unscheduled workflow %s", workflow_id)
        return True
    except Exception:
        return False


def list_scheduled_workflows() -> list[dict[str, Any]]:
    scheduler = get_scheduler()
    jobs = []
    for job in scheduler.get_jobs():
        jobs.append(
            {
                "job_id": job.id,
                "next_run": job.next_run_time.isoformat() if job.next_run_time else None,
                "trigger": str(job.trigger),
            }
        )
    return jobs
