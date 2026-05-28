"""End-to-end coverage of /api/v1/workflows — success and failure paths."""
import uuid

import pytest


def _wf_payload(**overrides):
    body = {
        "name": "Test Workflow",
        "description": "for testing",
        "intent": "do the thing",
    }
    body.update(overrides)
    return body


@pytest.mark.asyncio
class TestWorkflowSuccess:
    async def test_create_workflow_starts_as_draft(self, client):
        r = await client.post("/api/v1/workflows/", json=_wf_payload(name="Genesis"))
        assert r.status_code == 201, r.text
        wf = r.json()
        assert wf["name"] == "Genesis"
        assert wf["status"] == "draft"
        assert wf["graph_json"] is None
        assert wf["canvas_json"] is None
        assert wf["agents"] == []
        assert uuid.UUID(wf["id"])

    async def test_get_workflow_includes_agents(self, client):
        wf = (await client.post("/api/v1/workflows/", json=_wf_payload())).json()

        # Attach two agents
        for name in ("Agent1", "Agent2"):
            r = await client.post(
                "/api/v1/agents/",
                json={
                    "name": name,
                    "role": "r",
                    "workflow_id": wf["id"],
                },
            )
            assert r.status_code == 201

        r2 = await client.get(f"/api/v1/workflows/{wf['id']}")
        assert r2.status_code == 200
        body = r2.json()
        names = sorted(a["name"] for a in body["agents"])
        assert names == ["Agent1", "Agent2"]

    async def test_list_workflows(self, client):
        for n in ("A", "B", "C"):
            await client.post("/api/v1/workflows/", json=_wf_payload(name=n))

        r = await client.get("/api/v1/workflows/")
        assert r.status_code == 200
        names = sorted(w["name"] for w in r.json())
        assert names == ["A", "B", "C"]

    async def test_replace_workflow(self, client):
        wf = (await client.post("/api/v1/workflows/", json=_wf_payload(name="Old"))).json()
        r = await client.put(
            f"/api/v1/workflows/{wf['id']}",
            json=_wf_payload(name="New", description="changed", intent="new intent"),
        )
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "New"
        assert body["description"] == "changed"
        assert body["intent"] == "new intent"

    async def test_deploy_workflow_activates(self, client):
        wf = (await client.post("/api/v1/workflows/", json=_wf_payload())).json()
        assert wf["status"] == "draft"

        r = await client.post(f"/api/v1/workflows/{wf['id']}/deploy")
        assert r.status_code == 200
        assert r.json()["status"] == "active"

    async def test_pause_workflow(self, client):
        wf = (await client.post("/api/v1/workflows/", json=_wf_payload())).json()
        await client.post(f"/api/v1/workflows/{wf['id']}/deploy")

        r = await client.post(f"/api/v1/workflows/{wf['id']}/pause")
        assert r.status_code == 200
        assert r.json()["status"] == "paused"

    async def test_deploy_then_pause_then_redeploy(self, client):
        wf = (await client.post("/api/v1/workflows/", json=_wf_payload())).json()

        r1 = await client.post(f"/api/v1/workflows/{wf['id']}/deploy")
        assert r1.json()["status"] == "active"

        r2 = await client.post(f"/api/v1/workflows/{wf['id']}/pause")
        assert r2.json()["status"] == "paused"

        r3 = await client.post(f"/api/v1/workflows/{wf['id']}/deploy")
        assert r3.json()["status"] == "active"

    async def test_delete_workflow_cascades_agents(self, client):
        wf = (await client.post("/api/v1/workflows/", json=_wf_payload())).json()
        agent = (await client.post(
            "/api/v1/agents/",
            json={"name": "x", "role": "r", "workflow_id": wf["id"]},
        )).json()

        r = await client.delete(f"/api/v1/workflows/{wf['id']}")
        assert r.status_code == 204

        # Workflow gone
        assert (await client.get(f"/api/v1/workflows/{wf['id']}")).status_code == 404
        # Agent gone via CASCADE
        assert (await client.get(f"/api/v1/agents/{agent['id']}")).status_code == 404

    async def test_export_workflow_returns_shape(self, client):
        wf = (await client.post("/api/v1/workflows/", json=_wf_payload(name="Exp"))).json()
        await client.post(
            "/api/v1/agents/",
            json={"name": "Echo", "role": "r", "workflow_id": wf["id"]},
        )

        r = await client.get(f"/api/v1/workflows/{wf['id']}/export")
        assert r.status_code == 200
        body = r.json()
        assert body["name"] == "Exp"
        assert body["intent"] == "do the thing"
        assert len(body["agents"]) == 1
        assert body["agents"][0]["name"] == "Echo"
        # Agent export should expose system_prompt and tools fields
        assert "system_prompt" in body["agents"][0]
        assert "tools" in body["agents"][0]

    async def test_export_excludes_soft_deleted_agents(self, client):
        wf = (await client.post("/api/v1/workflows/", json=_wf_payload())).json()
        keeper = (await client.post(
            "/api/v1/agents/",
            json={"name": "Keeper", "role": "r", "workflow_id": wf["id"]},
        )).json()
        gone = (await client.post(
            "/api/v1/agents/",
            json={"name": "Gone", "role": "r", "workflow_id": wf["id"]},
        )).json()

        await client.delete(f"/api/v1/agents/{gone['id']}")

        body = (await client.get(f"/api/v1/workflows/{wf['id']}/export")).json()
        assert len(body["agents"]) == 1
        assert body["agents"][0]["name"] == "Keeper"
        _ = keeper  # silence unused


@pytest.mark.asyncio
class TestWorkflowFailure:
    async def test_get_nonexistent_workflow_returns_404(self, client):
        r = await client.get(f"/api/v1/workflows/{uuid.uuid4()}")
        assert r.status_code == 404
        # Global 404 handler in main.py shadows HTTPException(404).
        assert r.json()["error"] == "Not found"

    async def test_create_workflow_missing_required_field_returns_422(self, client):
        # `intent` is required
        r = await client.post("/api/v1/workflows/", json={"name": "x"})
        assert r.status_code == 422
        missing = {e["loc"][-1] for e in r.json()["detail"]}
        assert "intent" in missing

    async def test_replace_nonexistent_workflow_returns_404(self, client):
        r = await client.put(
            f"/api/v1/workflows/{uuid.uuid4()}",
            json=_wf_payload(),
        )
        assert r.status_code == 404

    async def test_delete_nonexistent_workflow_returns_404(self, client):
        r = await client.delete(f"/api/v1/workflows/{uuid.uuid4()}")
        assert r.status_code == 404

    async def test_deploy_nonexistent_workflow_returns_404(self, client):
        r = await client.post(f"/api/v1/workflows/{uuid.uuid4()}/deploy")
        assert r.status_code == 404

    async def test_pause_nonexistent_workflow_returns_404(self, client):
        r = await client.post(f"/api/v1/workflows/{uuid.uuid4()}/pause")
        assert r.status_code == 404

    async def test_export_nonexistent_workflow_returns_404(self, client):
        r = await client.get(f"/api/v1/workflows/{uuid.uuid4()}/export")
        assert r.status_code == 404

    async def test_malformed_workflow_uuid_returns_422(self, client):
        r = await client.get("/api/v1/workflows/garbage-uuid")
        assert r.status_code == 422
