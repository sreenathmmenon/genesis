import logging
import sys
from contextlib import asynccontextmanager

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from genesis.config import settings
from genesis.database import engine, Base

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s %(levelname)s %(name)s — %(message)s",
    handlers=[
        logging.StreamHandler(sys.stdout),
        logging.FileHandler("logs/genesis.log"),
    ],
)
logger = logging.getLogger("genesis")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Genesis starting up (env=%s)", settings.environment)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
    logger.info("Database tables ready")
    yield
    logger.info("Genesis shutting down")
    await engine.dispose()


app = FastAPI(
    title="Genesis API",
    version="0.1.0",
    description="AI Agent Orchestration Platform",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
async def health() -> dict:
    return {"status": "ok", "version": "0.1.0", "env": settings.environment}


from genesis.api import router as api_router  # noqa: E402
app.include_router(api_router, prefix="/api/v1")
