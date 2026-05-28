"""Health endpoint — success path and degraded-when-redis-down failure path."""
from unittest.mock import patch

import pytest


@pytest.mark.asyncio
class TestHealthSuccess:
    async def test_health_returns_ok_when_db_and_redis_up(self, client):
        r = await client.get("/api/v1/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "ok"
        assert body["db"] == "ok"
        assert body["redis"] == "ok"
        assert body["version"] == "0.1.0"


@pytest.mark.asyncio
class TestHealthFailure:
    async def test_health_degraded_when_redis_ping_fails(self, client):
        with patch("genesis.api.health.redis_client.ping", return_value=False):
            r = await client.get("/api/v1/health")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "degraded"
        assert body["redis"] == "error"
        assert body["db"] == "ok"

    async def test_health_degraded_when_redis_ping_raises(self, client):
        async def boom():
            raise RuntimeError("redis exploded")

        with patch("genesis.api.health.redis_client.ping", side_effect=boom):
            r = await client.get("/api/v1/health")
        assert r.status_code == 200
        assert r.json()["status"] == "degraded"
        assert r.json()["redis"] == "error"
