import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI, Request, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse, RedirectResponse

from genesis.config import settings
from genesis.database import init_db
from genesis.utils.logger import get_logger
from genesis.utils.redis_client import redis_client

logger = get_logger("genesis")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Genesis starting up (env=%s)", settings.environment)
    await init_db()
    await redis_client.connect()

    # Start Telegram bot (polling mode — no-op if token not set)
    from genesis.channels.telegram import telegram_bridge
    await telegram_bridge.setup()

    # Start APScheduler for cron-triggered workflows
    from genesis.utils.scheduler import start_scheduler
    await start_scheduler()

    logger.info("Genesis ready")
    yield

    logger.info("Genesis shutting down")
    from genesis.utils.scheduler import stop_scheduler
    await stop_scheduler()
    await telegram_bridge.teardown()
    await redis_client.disconnect()
    logger.info("Genesis stopped")


app = FastAPI(
    title="Genesis API",
    version="0.1.0",
    description="AI Agent Orchestration Platform",
    lifespan=lifespan,
)

# CORS origins — allow the Railway-deployed frontend and local dev
_CORS_ORIGINS = [
    "https://genesis-ai.up.railway.app",
    "http://localhost:3000",
    "http://localhost:3001",
]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_CORS_ORIGINS if settings.environment != "development" else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.exception_handler(404)
async def not_found_handler(request: Request, exc: Exception) -> JSONResponse:
    return JSONResponse(status_code=404, content={"error": "Not found", "path": str(request.url)})


@app.exception_handler(500)
async def server_error_handler(request: Request, exc: Exception) -> JSONResponse:
    logger.exception("Unhandled error on %s", request.url)
    return JSONResponse(status_code=500, content={"error": "Internal server error"})


from genesis.api import router as api_router  # noqa: E402
app.include_router(api_router, prefix="/api/v1")
