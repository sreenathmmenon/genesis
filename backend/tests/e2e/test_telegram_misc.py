"""End-to-end coverage of Telegram webhook + misc API behaviors."""
import pytest


@pytest.mark.asyncio
class TestTelegramWebhook:
    async def test_webhook_returns_503_when_bridge_not_initialised(self, client):
        # In the test environment TELEGRAM_BOT_TOKEN is unset, so the
        # bridge's `_app` is None. The webhook should refuse with 503.
        r = await client.post(
            "/api/v1/telegram/webhook",
            json={"update_id": 1, "message": {"message_id": 1, "text": "hi"}},
        )
        assert r.status_code == 503
        assert "not initialised" in r.json()["detail"].lower()


@pytest.mark.asyncio
class TestMisc:
    async def test_unknown_route_returns_404_handler_payload(self, client):
        r = await client.get("/api/v1/this-does-not-exist")
        assert r.status_code == 404
        body = r.json()
        # Custom 404 handler returns {"error": "Not found", "path": "..."}
        assert body["error"] == "Not found"
        assert "this-does-not-exist" in body["path"]

    async def test_openapi_docs_available(self, client):
        r = await client.get("/openapi.json")
        assert r.status_code == 200
        spec = r.json()
        paths = spec["paths"]
        # Sanity-check that all our routers are wired into the schema
        assert "/api/v1/health" in paths
        assert "/api/v1/agents/" in paths
        assert "/api/v1/workflows/" in paths
        assert "/api/v1/runs/" in paths
        assert "/api/v1/templates/" in paths
        assert "/api/v1/genesis/build" in paths

    async def test_cors_allows_arbitrary_origin_in_test_env(self, client):
        # In test/development env, CORS is wildcarded.
        r = await client.get(
            "/api/v1/health",
            headers={"Origin": "http://localhost:3000"},
        )
        assert r.status_code == 200
        # FastAPI's CORSMiddleware echoes the origin or "*"
        allow = r.headers.get("access-control-allow-origin")
        assert allow in ("*", "http://localhost:3000")
