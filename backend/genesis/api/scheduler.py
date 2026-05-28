import logging
from typing import Any

from fastapi import APIRouter

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/scheduler", tags=["scheduler"])


@router.get("/jobs")
async def list_scheduled_jobs() -> list[dict[str, Any]]:
    """Return all currently scheduled workflow jobs."""
    from genesis.utils.scheduler import list_scheduled_workflows
    return list_scheduled_workflows()
