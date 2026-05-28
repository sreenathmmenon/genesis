import asyncio
import os

import pytest
import pytest_asyncio
from httpx import ASGITransport, AsyncClient
from sqlalchemy import text
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine

TEST_DATABASE_URL = "postgresql+asyncpg://genesis:genesis_dev@localhost:5432/genesis_test"

# Point the application's database URL at the test DB BEFORE importing app/modules.
os.environ["DATABASE_URL"] = TEST_DATABASE_URL
os.environ.setdefault("ENVIRONMENT", "test")
os.environ.setdefault("LOG_LEVEL", "WARNING")

from main import app  # noqa: E402
from genesis.database import get_db  # noqa: E402
from genesis.models import Base  # noqa: E402
from genesis.utils.redis_client import redis_client  # noqa: E402

test_engine = create_async_engine(TEST_DATABASE_URL, echo=False, pool_pre_ping=True)
TestSessionLocal = async_sessionmaker(bind=test_engine, expire_on_commit=False, autoflush=False)

# Names of tables to truncate between tests (FK-safe with CASCADE)
_TRUNCATE_SQL = (
    "TRUNCATE TABLE messages, runs, genesis_builds, agents, workflows "
    "RESTART IDENTITY CASCADE"
)


@pytest.fixture(scope="session")
def event_loop():
    """Single event loop for entire session so async fixtures share state."""
    loop = asyncio.new_event_loop()
    yield loop
    loop.close()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def setup_test_db():
    """Create all tables at session start, drop at session end."""
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
        await conn.run_sync(Base.metadata.create_all)
    yield
    async with test_engine.begin() as conn:
        await conn.run_sync(Base.metadata.drop_all)
    await test_engine.dispose()


@pytest_asyncio.fixture(scope="session", autouse=True)
async def connected_redis():
    """Connect the singleton redis client so endpoints that publish/ping work."""
    await redis_client.connect()
    yield
    await redis_client.disconnect()


@pytest_asyncio.fixture(autouse=True)
async def clean_tables():
    """Truncate all data between tests for true isolation."""
    yield
    async with test_engine.begin() as conn:
        await conn.execute(text(_TRUNCATE_SQL))


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    """Standalone session for tests that need direct DB access (no commit override)."""
    async with TestSessionLocal() as session:
        yield session


@pytest_asyncio.fixture
async def client() -> AsyncClient:
    """HTTP client wired to the FastAPI app with a real test DB session."""
    async def override_get_db():
        async with TestSessionLocal() as session:
            try:
                yield session
                await session.commit()
            except Exception:
                await session.rollback()
                raise

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
