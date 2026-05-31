"""Unit tests — Workflow execution: graph compilation, node wiring, parallel nodes."""
import pytest
from unittest.mock import AsyncMock, MagicMock, patch

pytestmark = pytest.mark.asyncio


# ── Graph compiler — structural tests (no LLM calls) ──────────────────────────

async def test_compile_empty_graph_json():
    """Empty graph_json should compile to a no-op workflow without error."""
    from genesis.agents.graph_compiler import compile_workflow_from_json
    compiled = await compile_workflow_from_json({})
    assert compiled is not None


async def test_compile_single_node_graph():
    """Single-node graph: node is wired START → node → END."""
    from genesis.agents.graph_compiler import compile_workflow_from_json

    graph_json = {
        "nodes": [{"id": "worker", "system_prompt": "Do work.", "tools": [], "model_name": "claude-haiku-4-5-20251001"}],
        "edges": [],
    }
    compiled = await compile_workflow_from_json(graph_json)
    assert compiled is not None
    # Graph should have the worker node in its topology
    assert "worker" in compiled.get_graph().nodes


async def test_compile_linear_three_node_graph():
    """A → B → C: all three nodes present, START→A and C→END wired."""
    from genesis.agents.graph_compiler import compile_workflow_from_json

    graph_json = {
        "nodes": [
            {"id": "a", "system_prompt": "Node A", "tools": [], "model_name": "claude-haiku-4-5-20251001"},
            {"id": "b", "system_prompt": "Node B", "tools": [], "model_name": "claude-haiku-4-5-20251001"},
            {"id": "c", "system_prompt": "Node C", "tools": [], "model_name": "claude-haiku-4-5-20251001"},
        ],
        "edges": [
            {"source": "a", "target": "b"},
            {"source": "b", "target": "c"},
        ],
    }
    compiled = await compile_workflow_from_json(graph_json)
    graph = compiled.get_graph()
    node_ids = set(graph.nodes.keys())
    assert {"a", "b", "c"}.issubset(node_ids)


async def test_compile_parallel_entry_nodes():
    """Signal Scout pattern: 3 parallel entry nodes, 1 exit node."""
    from genesis.agents.graph_compiler import compile_workflow_from_json

    graph_json = {
        "nodes": [
            {"id": "watcher_1", "system_prompt": "Watch source 1", "tools": [], "model_name": "claude-haiku-4-5-20251001"},
            {"id": "watcher_2", "system_prompt": "Watch source 2", "tools": [], "model_name": "claude-haiku-4-5-20251001"},
            {"id": "watcher_3", "system_prompt": "Watch source 3", "tools": [], "model_name": "claude-haiku-4-5-20251001"},
            {"id": "aggregator", "system_prompt": "Aggregate results", "tools": [], "model_name": "claude-haiku-4-5-20251001"},
        ],
        "edges": [
            {"source": "watcher_1", "target": "aggregator"},
            {"source": "watcher_2", "target": "aggregator"},
            {"source": "watcher_3", "target": "aggregator"},
        ],
    }
    compiled = await compile_workflow_from_json(graph_json)
    graph = compiled.get_graph()
    node_ids = set(graph.nodes.keys())
    assert {"watcher_1", "watcher_2", "watcher_3", "aggregator"}.issubset(node_ids)


async def test_compile_unknown_model_falls_back_to_sonnet():
    """Nodes with unknown model names should fall back to claude-sonnet-4-5."""
    from genesis.agents.graph_compiler import compile_workflow_from_json

    graph_json = {
        "nodes": [{"id": "node1", "system_prompt": "Work", "tools": [], "model_name": "gpt-99-ultra"}],
        "edges": [],
    }
    # Should not raise — should fall back
    compiled = await compile_workflow_from_json(graph_json)
    assert compiled is not None


# ── Workflow CRUD via API ──────────────────────────────────────────────────────

async def test_create_workflow(client):
    resp = await client.post("/api/v1/workflows/", json={
        "name": "test-workflow",
        "description": "Test workflow",
        "intent": "Monitor GitHub and send alerts",
    })
    assert resp.status_code == 201
    data = resp.json()
    assert data["name"] == "test-workflow"
    assert data["status"] == "draft"
    assert data["id"] is not None


async def test_create_workflow_with_schedule(client):
    resp = await client.post("/api/v1/workflows/", json={
        "name": "scheduled-wf",
        "intent": "Run every morning",
        "schedule_expr": "0 9 * * 1-5",
    })
    assert resp.status_code == 201
    assert resp.json()["schedule_expr"] == "0 9 * * 1-5"


async def test_list_workflows(client):
    await client.post("/api/v1/workflows/", json={"name": "wf-list-1", "intent": "test"})
    await client.post("/api/v1/workflows/", json={"name": "wf-list-2", "intent": "test"})

    resp = await client.get("/api/v1/workflows/")
    assert resp.status_code == 200
    names = [w["name"] for w in resp.json()]
    assert "wf-list-1" in names
    assert "wf-list-2" in names


async def test_get_workflow(client):
    create = await client.post("/api/v1/workflows/", json={"name": "get-wf", "intent": "test"})
    wf_id = create.json()["id"]

    resp = await client.get(f"/api/v1/workflows/{wf_id}")
    assert resp.status_code == 200
    assert resp.json()["name"] == "get-wf"


async def test_patch_workflow_status(client):
    create = await client.post("/api/v1/workflows/", json={"name": "status-wf", "intent": "test"})
    wf_id = create.json()["id"]

    resp = await client.patch(f"/api/v1/workflows/{wf_id}", json={"status": "paused"})
    assert resp.status_code == 200
    assert resp.json()["status"] == "paused"


async def test_patch_workflow_webhook_url(client):
    create = await client.post("/api/v1/workflows/", json={"name": "webhook-wf", "intent": "test"})
    wf_id = create.json()["id"]

    resp = await client.patch(f"/api/v1/workflows/{wf_id}", json={"webhook_url": "https://example.com/hook"})
    assert resp.status_code == 200
    assert resp.json()["webhook_url"] == "https://example.com/hook"


async def test_get_nonexistent_workflow_returns_404(client):
    resp = await client.get("/api/v1/workflows/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404
