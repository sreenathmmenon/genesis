"""End-to-end coverage of /api/v1/agents — success and failure paths."""
import uuid

import pytest


def _agent_payload(**overrides):
    body = {
        "name": "TestBot",
        "role": "tester",
        "system_prompt": "you are a test agent",
        "model_name": "claude-sonnet-4-5",
        "tools": [],
        "memory_type": "none",
    }
    body.update(overrides)
    return body


@pytest.mark.asyncio
class TestAgentSuccess:
    async def test_create_and_get_agent(self, client):
        r = await client.post("/api/v1/agents/", json=_agent_payload(name="Alice"))
        assert r.status_code == 201, r.text
        created = r.json()
        assert created["name"] == "Alice"
        assert created["role"] == "tester"
        assert created["memory_type"] == "none"
        assert created["workflow_id"] is None
        assert created["deleted_at"] is None
        assert uuid.UUID(created["id"])

        r2 = await client.get(f"/api/v1/agents/{created['id']}")
        assert r2.status_code == 200
        assert r2.json()["id"] == created["id"]

    async def test_list_agents_empty_then_with_data(self, client):
        r = await client.get("/api/v1/agents/")
        assert r.status_code == 200
        assert r.json() == []

        await client.post("/api/v1/agents/", json=_agent_payload(name="A"))
        await client.post("/api/v1/agents/", json=_agent_payload(name="B"))

        r2 = await client.get("/api/v1/agents/")
        assert r2.status_code == 200
        names = sorted(a["name"] for a in r2.json())
        assert names == ["A", "B"]

    async def test_list_agents_filtered_by_workflow_id(self, client):
        wf = (await client.post(
            "/api/v1/workflows/",
            json={"name": "Parent", "intent": "x"},
        )).json()

        await client.post("/api/v1/agents/", json=_agent_payload(name="InWf", workflow_id=wf["id"]))
        await client.post("/api/v1/agents/", json=_agent_payload(name="Orphan"))

        r = await client.get(f"/api/v1/agents/?workflow_id={wf['id']}")
        assert r.status_code == 200
        names = [a["name"] for a in r.json()]
        assert names == ["InWf"]

    async def test_patch_agent_updates_only_provided_fields(self, client):
        created = (await client.post(
            "/api/v1/agents/", json=_agent_payload(name="Old", role="r1")
        )).json()

        r = await client.patch(
            f"/api/v1/agents/{created['id']}",
            json={"name": "New"},
        )
        assert r.status_code == 200
        patched = r.json()
        assert patched["name"] == "New"
        assert patched["role"] == "r1"  # untouched

    async def test_replace_agent_overwrites_all_fields(self, client):
        created = (await client.post(
            "/api/v1/agents/", json=_agent_payload(name="Old", role="r1", model_name="claude-sonnet-4-5")
        )).json()

        r = await client.put(
            f"/api/v1/agents/{created['id']}",
            json=_agent_payload(name="Brand", role="r2", model_name="gpt-4o"),
        )
        assert r.status_code == 200
        replaced = r.json()
        assert replaced["name"] == "Brand"
        assert replaced["role"] == "r2"
        assert replaced["model_name"] == "gpt-4o"

    async def test_soft_delete_then_get_returns_404(self, client):
        created = (await client.post(
            "/api/v1/agents/", json=_agent_payload(name="Doomed")
        )).json()

        r = await client.delete(f"/api/v1/agents/{created['id']}")
        assert r.status_code == 204

        r2 = await client.get(f"/api/v1/agents/{created['id']}")
        assert r2.status_code == 404

        # List should also exclude soft-deleted
        r3 = await client.get("/api/v1/agents/")
        assert r3.status_code == 200
        assert all(a["id"] != created["id"] for a in r3.json())


@pytest.mark.asyncio
class TestAgentFailure:
    async def test_get_nonexistent_agent_returns_404(self, client):
        bogus = uuid.uuid4()
        r = await client.get(f"/api/v1/agents/{bogus}")
        assert r.status_code == 404
        # The app's global 404 handler in main.py shadows HTTPException(404).
        # Both unknown routes and missing-resource 404s return this shape.
        assert r.json()["error"] == "Not found"

    async def test_create_agent_missing_required_field_returns_422(self, client):
        # missing both `name` and `role` (required)
        r = await client.post("/api/v1/agents/", json={"system_prompt": "x"})
        assert r.status_code == 422
        errors = r.json()["detail"]
        missing_fields = {e["loc"][-1] for e in errors}
        assert "name" in missing_fields
        assert "role" in missing_fields

    async def test_create_agent_invalid_memory_type_returns_422(self, client):
        r = await client.post(
            "/api/v1/agents/",
            json=_agent_payload(memory_type="psychic"),
        )
        assert r.status_code == 422

    async def test_patch_nonexistent_agent_returns_404(self, client):
        bogus = uuid.uuid4()
        r = await client.patch(f"/api/v1/agents/{bogus}", json={"name": "x"})
        assert r.status_code == 404

    async def test_replace_nonexistent_agent_returns_404(self, client):
        bogus = uuid.uuid4()
        r = await client.put(f"/api/v1/agents/{bogus}", json=_agent_payload())
        assert r.status_code == 404

    async def test_delete_nonexistent_agent_returns_404(self, client):
        bogus = uuid.uuid4()
        r = await client.delete(f"/api/v1/agents/{bogus}")
        assert r.status_code == 404

    async def test_delete_already_deleted_agent_returns_404(self, client):
        created = (await client.post(
            "/api/v1/agents/", json=_agent_payload(name="TwiceDoomed")
        )).json()
        r1 = await client.delete(f"/api/v1/agents/{created['id']}")
        assert r1.status_code == 204
        r2 = await client.delete(f"/api/v1/agents/{created['id']}")
        assert r2.status_code == 404

    async def test_malformed_uuid_returns_422(self, client):
        r = await client.get("/api/v1/agents/not-a-uuid")
        assert r.status_code == 422
