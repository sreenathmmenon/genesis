"""End-to-end coverage of /api/v1/templates — success and failure paths."""
import uuid

import pytest


@pytest.mark.asyncio
class TestTemplateSuccess:
    async def test_list_templates_returns_both_builtins(self, client):
        r = await client.get("/api/v1/templates/")
        assert r.status_code == 200
        body = r.json()
        names = {t["name"] for t in body}
        assert names == {"pr_guardian", "signal_scout"}
        for t in body:
            assert "display_name" in t
            assert "description" in t
            assert "intent" in t
            assert "agents" in t
            assert t["agent_count"] == len(t["agents"])

    async def test_deploy_pr_guardian_template(self, client):
        r = await client.post("/api/v1/templates/pr_guardian/deploy")
        assert r.status_code == 200
        body = r.json()
        wf_id = body["workflow_id"]
        uuid.UUID(wf_id)
        assert "canvas_json" in body
        nodes = body["canvas_json"]["nodes"]
        edges = body["canvas_json"]["edges"]
        assert len(nodes) == 5
        # 5 nodes → 4 chained edges
        assert len(edges) == 4
        # Verify ordering: each edge connects consecutive nodes
        for i, e in enumerate(edges):
            assert e["source"] == nodes[i]["id"]
            assert e["target"] == nodes[i + 1]["id"]

    async def test_deploy_signal_scout_template(self, client):
        r = await client.post("/api/v1/templates/signal_scout/deploy")
        assert r.status_code == 200
        body = r.json()
        nodes = body["canvas_json"]["nodes"]
        assert len(nodes) == 6
        labels = [n["data"]["label"] for n in nodes]
        assert "Pattern Agent" in labels
        assert "Prioritizer" in labels

    async def test_deployed_template_workflow_persisted(self, client):
        r = await client.post("/api/v1/templates/pr_guardian/deploy")
        wf_id = r.json()["workflow_id"]

        # Fetch the workflow and verify it was created with agents
        wf = (await client.get(f"/api/v1/workflows/{wf_id}")).json()
        assert wf["name"] == "PR Guardian"
        assert wf["status"] == "active"
        assert wf["template_name"] == "pr_guardian"
        assert len(wf["agents"]) == 5
        agent_names = sorted(a["name"] for a in wf["agents"])
        assert agent_names == sorted([
            "PR Watcher",
            "Contract Diff",
            "Risk Assessor",
            "Briefing Agent",
            "Telegram Gateway",
        ])


@pytest.mark.asyncio
class TestTemplateFailure:
    async def test_deploy_unknown_template_returns_404(self, client):
        r = await client.post("/api/v1/templates/does_not_exist/deploy")
        assert r.status_code == 404
        # Global 404 handler in main.py shadows HTTPException(404).
        assert r.json()["error"] == "Not found"

    async def test_get_root_templates_without_trailing_slash_redirects_or_307(self, client):
        # FastAPI by default redirects trailing-slash mismatches with 307.
        # Use follow_redirects=False to observe the raw status.
        r = await client.get("/api/v1/templates", follow_redirects=False)
        assert r.status_code in (200, 307)
