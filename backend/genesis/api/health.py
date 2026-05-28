import logging

from fastapi import APIRouter, Depends
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession

from genesis.database import get_db
from genesis.models.schemas import HealthResponse
from genesis.utils.redis_client import redis_client

logger = logging.getLogger(__name__)
router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health_check(db: AsyncSession = Depends(get_db)) -> HealthResponse:
    # DB
    db_status = "ok"
    try:
        await db.execute(text("SELECT 1"))
    except Exception as exc:
        logger.warning("DB health check failed: %s", exc)
        db_status = "error"

    # Redis
    redis_status = "ok"
    try:
        ok = await redis_client.ping()
        if not ok:
            redis_status = "error"
    except Exception as exc:
        logger.warning("Redis health check failed: %s", exc)
        redis_status = "error"

    return HealthResponse(
        status="ok" if db_status == "ok" and redis_status == "ok" else "degraded",
        db=db_status,
        redis=redis_status,
        version="0.1.0",
    )
