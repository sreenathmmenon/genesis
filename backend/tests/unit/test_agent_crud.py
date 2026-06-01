"""Unit tests — Agent CRUD: creation, patching, deletion, validation."""
import pytest
import pytest_asyncio
from httpx import AsyncClient


pytestmark = pytest.mark.asyncio


# ── Agent creation ─────────────────────────────────────────────────────────────

async def test_create_agent_minimal(client: AsyncClient):
    resp = await client.post("/api/v1/agents/", json={
        "name": "test-agent",
        "role": "tester",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "test-agent"
    assert data["role"] == "tester"
    assert data["model_name"] == "claude-sonnet-4-6"
    assert data["memory_type"] == "none"
    assert data["tools"] == []
    assert data["id"] is not None


async def test_create_agent_full_config(client: AsyncClient):
    resp = await client.post("/api/v1/agents/", json={
        "name": "pr-scanner",
        "role": "Pull Request Scanner",
        "system_prompt": "You monitor GitHub PRs for review status.",
        "model_name": "claude-haiku-4-5-20251001",
        "tools": ["github_api", "telegram_send"],
        "memory_type": "short_term",
        "schedule": "0 */6 * * *",
        "channel": "telegram",
        "guardrails": {"max_tokens": 2048, "allow_web_search": True},
        "interaction_rules": {"can_spawn_agents": False},
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["tools"] == ["github_api", "telegram_send"]
    assert data["memory_type"] == "short_term"
    assert data["schedule"] == "0 */6 * * *"
    assert data["guardrails"]["max_tokens"] == 2048


async def test_create_agent_missing_name_fails(client: AsyncClient):
    resp = await client.post("/api/v1/agents/", json={"role": "tester"})
    assert resp.status_code == 422


async def test_create_agent_missing_role_fails(client: AsyncClient):
    resp = await client.post("/api/v1/agents/", json={"name": "test-agent"})
    assert resp.status_code == 422


# ── Agent listing ──────────────────────────────────────────────────────────────

async def test_list_agents(client: AsyncClient):
    # Create two agents
    for i in range(2):
        await client.post("/api/v1/agents/", json={"name": f"list-agent-{i}", "role": "worker"})

    resp = await client.get("/api/v1/agents/")
    assert resp.status_code == 200
    agents = resp.json()
    assert isinstance(agents, list)
    names = [a["name"] for a in agents]
    assert "list-agent-0" in names
    assert "list-agent-1" in names


# ── Agent read ─────────────────────────────────────────────────────────────────

async def test_get_agent_by_id(client: AsyncClient):
    create = await client.post("/api/v1/agents/", json={"name": "get-me", "role": "fetcher"})
    agent_id = create.json()["id"]

    resp = await client.get(f"/api/v1/agents/{agent_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "get-me"


async def test_get_nonexistent_agent_returns_404(client: AsyncClient):
    resp = await client.get("/api/v1/agents/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


# ── Agent patching ─────────────────────────────────────────────────────────────

async def test_patch_agent_name(client: AsyncClient):
    create = await client.post("/api/v1/agents/", json={"name": "old-name", "role": "worker"})
    agent_id = create.json()["id"]

    resp = await client.patch(f"/api/v1/agents/{agent_id}", json={"name": "new-name"})
    assert resp.status_code == 200
    assert resp.json()["name"] == "new-name"
    # Role should be unchanged
    assert resp.json()["role"] == "worker"


async def test_patch_agent_system_prompt(client: AsyncClient):
    create = await client.post("/api/v1/agents/", json={"name": "patcher", "role": "worker"})
    agent_id = create.json()["id"]

    new_prompt = "Updated system prompt for testing."
    resp = await client.patch(f"/api/v1/agents/{agent_id}", json={"system_prompt": new_prompt})
    assert resp.status_code == 200
    assert resp.json()["system_prompt"] == new_prompt


async def test_patch_agent_tools(client: AsyncClient):
    create = await client.post("/api/v1/agents/", json={"name": "tool-patcher", "role": "worker"})
    agent_id = create.json()["id"]

    resp = await client.patch(f"/api/v1/agents/{agent_id}", json={"tools": ["web_search", "github_api"]})
    assert resp.status_code == 200
    assert set(resp.json()["tools"]) == {"web_search", "github_api"}


async def test_patch_agent_model(client: AsyncClient):
    create = await client.post("/api/v1/agents/", json={"name": "model-switcher", "role": "worker"})
    agent_id = create.json()["id"]

    resp = await client.patch(f"/api/v1/agents/{agent_id}", json={"model_name": "claude-haiku-4-5-20251001"})
    assert resp.status_code == 200
    assert resp.json()["model_name"] == "claude-haiku-4-5-20251001"


# ── Agent deletion (soft) ──────────────────────────────────────────────────────

async def test_delete_agent(client: AsyncClient):
    create = await client.post("/api/v1/agents/", json={"name": "doomed-agent", "role": "worker"})
    agent_id = create.json()["id"]

    del_resp = await client.delete(f"/api/v1/agents/{agent_id}")
    assert del_resp.status_code == 204

    # Soft-deleted: GET returns 404
    get_resp = await client.get(f"/api/v1/agents/{agent_id}")
    assert get_resp.status_code == 404

    # Soft-deleted: does not appear in list
    list_resp = await client.get("/api/v1/agents/")
    ids = [a["id"] for a in list_resp.json()]
    assert agent_id not in ids


async def test_delete_nonexistent_agent_returns_404(client: AsyncClient):
    resp = await client.delete("/api/v1/agents/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
