import os

import pytest
import pytest_asyncio
from httpx import AsyncClient, ASGITransport
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.ext.compiler import compiles
from sqlalchemy.pool import StaticPool

from main import app
from genesis.database import get_db
from genesis.models import Base

# Render Postgres-only column types on SQLite so the in-memory test database
# can build the production schema unchanged. JSONB → JSON, UUID → CHAR(36).
# These compilers only fire for the SQLite dialect; Postgres is untouched.


@compiles(JSONB, "sqlite")
def _compile_jsonb_sqlite(element, compiler, **kw):  # noqa: ANN001
    return "JSON"


@compiles(UUID, "sqlite")
def _compile_uuid_sqlite(element, compiler, **kw):  # noqa: ANN001
    return "CHAR(36)"

# Tests default to an in-memory SQLite database so the suite runs anywhere
# without a live Postgres. Set TEST_DATABASE_URL to point at a real Postgres
# (e.g. for CI parity) when needed.
TEST_DATABASE_URL = os.getenv(
    "TEST_DATABASE_URL",
    "sqlite+aiosqlite:///:memory:",
)


@pytest_asyncio.fixture
async def db_session() -> AsyncSession:
    is_sqlite = TEST_DATABASE_URL.startswith("sqlite")
    engine_kwargs: dict = {"echo": False}
    if is_sqlite:
        # A single shared in-memory connection so schema + data persist
        # across the engine.begin() setup and the session under test.
        engine_kwargs["connect_args"] = {"check_same_thread": False}
        engine_kwargs["poolclass"] = StaticPool

    engine = create_async_engine(TEST_DATABASE_URL, **engine_kwargs)
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)

    Session = async_sessionmaker(bind=engine, expire_on_commit=False, autoflush=False)
    async with Session() as session:
        yield session
        await session.rollback()

    await engine.dispose()


@pytest_asyncio.fixture
async def client(db_session: AsyncSession) -> AsyncClient:
    async def override_get_db():
        yield db_session

    app.dependency_overrides[get_db] = override_get_db
    async with AsyncClient(transport=ASGITransport(app=app), base_url="http://test") as ac:
        yield ac
    app.dependency_overrides.clear()
