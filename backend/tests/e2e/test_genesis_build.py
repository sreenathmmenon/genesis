"""End-to-end coverage of /api/v1/genesis builds — success and failure paths.

The pipeline runs LLM calls in a background task, so we stub `run_genesis_build`
to keep tests fast, deterministic, and offline. Deploy + cancel + list paths
exercise the real DB writes.
"""
import asyncio
import uuid
from unittest.mock import patch

import pytest

from genesis.models.genesis_build import BuildStatus, GenesisBuild


async def _wait_for_status(client, build_id: str, target: BuildStatus, timeout: float = 3.0):
    """Poll the get-build endpoint until target status is observed."""
    deadline = asyncio.get_event_loop().time() + timeout
    while asyncio.get_event_loop().time() < deadline:
        r = await client.get(f"/api/v1/genesis/builds/{build_id}")
        if r.status_code == 200 and r.json()["status"] == target.value:
            return r.json()
        await asyncio.sleep(0.05)
    raise AssertionError(f"build did not reach {target} within {timeout}s")


@pytest.mark.asyncio
class TestGenesisBuildSuccess:
    async def test_start_build_returns_202_and_id(self, client):
        async def fake_pipeline(intent: str, build_id: str):
            return {"error": None, "architect_output": {"topology": "linear"}}

        with patch("genesis.agents.graph_compiler.run_genesis_build", side_effect=fake_pipeline):
            r = await client.post(
                "/api/v1/genesis/build",
                json={"intent": "build me a thing"},
            )
        assert r.status_code == 202
        body = r.json()
        assert "build_id" in body
        uuid.UUID(body["build_id"])
        assert body["status"] == "decomposing"

    async def test_list_builds_returns_recent(self, client):
        async def fake_pipeline(intent: str, build_id: str):
            return {"error": "stop"}

        with patch("genesis.agents.graph_compiler.run_genesis_build", side_effect=fake_pipeline):
            await client.post("/api/v1/genesis/build", json={"intent": "one"})
            await client.post("/api/v1/genesis/build", json={"intent": "two"})

        r = await client.get("/api/v1/genesis/builds")
        assert r.status_code == 200
        intents = [b["intent"] for b in r.json()]
        assert set(intents) == {"one", "two"}

    async def test_get_build_after_pipeline_success(self, client):
        async def fake_pipeline(intent: str, build_id: str):
            return {
                "error": None,
                "architect_output": {"topology": "linear"},
                "decomposer_output": {"tasks": ["a", "b"]},
                "builder_output": {
                    "workflow_name": "Generated",
                    "description": "auto built",
                    "graph_json": {"nodes": []},
                    "canvas_json": {"nodes": [], "edges": []},
                },
                "critic_feedback": [],
                "validator_report": {"cost_usd": 0.05},
                "workflow_id": None,
                "iteration_count": 1,
            }

        with patch("genesis.agents.graph_compiler.run_genesis_build", side_effect=fake_pipeline):
            r = await client.post("/api/v1/genesis/build", json={"intent": "x"})
            bid = r.json()["build_id"]
            body = await _wait_for_status(client, bid, BuildStatus.awaiting_approval)

        assert body["architect_output"] == {"topology": "linear"}
        assert body["builder_output"]["workflow_name"] == "Generated"
        assert body["iterations"] == 1

    async def test_deploy_build_creates_workflow(self, client, db_session):
        # Seed a build directly in awaiting_approval status — bypasses pipeline.
        build = GenesisBuild(
            intent="seeded intent",
            status=BuildStatus.awaiting_approval,
            builder_output={
                "workflow_name": "Seeded WF",
                "description": "from seed",
                "graph_json": {"nodes": ["n1"]},
                "canvas_json": {"nodes": [], "edges": []},
            },
        )
        db_session.add(build)
        await db_session.commit()
        await db_session.refresh(build)
        bid = build.id

        r = await client.post(f"/api/v1/genesis/deploy/{bid}")
        assert r.status_code == 200, r.text
        body = r.json()
        assert body["status"] == "deployed"
        assert body["name"] == "Seeded WF"
        wf_id = body["workflow_id"]
        uuid.UUID(wf_id)

        # The workflow should be retrievable
        wf = (await client.get(f"/api/v1/workflows/{wf_id}")).json()
        assert wf["status"] == "active"
        assert wf["name"] == "Seeded WF"
        assert wf["graph_json"] == {"nodes": ["n1"]}

        # The build should now be marked deployed and linked
        b2 = (await client.get(f"/api/v1/genesis/builds/{bid}")).json()
        assert b2["status"] == "deployed"
        assert b2["workflow_id"] == wf_id

    async def test_cancel_build_marks_failed(self, client, db_session):
        build = GenesisBuild(intent="cancel me", status=BuildStatus.decomposing)
        db_session.add(build)
        await db_session.commit()
        await db_session.refresh(build)

        r = await client.post(f"/api/v1/genesis/cancel/{build.id}")
        assert r.status_code == 200
        body = r.json()
        assert body["status"] == "cancelled"
        assert body["build_id"] == str(build.id)

        b2 = (await client.get(f"/api/v1/genesis/builds/{build.id}")).json()
        assert b2["status"] == "failed"


@pytest.mark.asyncio
class TestGenesisBuildFailure:
    async def test_start_build_validates_intent_length(self, client):
        # IntentRequest enforces max_length=500
        r = await client.post(
            "/api/v1/genesis/build",
            json={"intent": "x" * 501},
        )
        assert r.status_code == 422

    async def test_start_build_missing_intent_returns_422(self, client):
        r = await client.post("/api/v1/genesis/build", json={})
        assert r.status_code == 422

    async def test_get_nonexistent_build_returns_404(self, client):
        r = await client.get(f"/api/v1/genesis/builds/{uuid.uuid4()}")
        assert r.status_code == 404
        # Global 404 handler in main.py shadows HTTPException(404).
        assert r.json()["error"] == "Not found"

    async def test_deploy_nonexistent_build_returns_404(self, client):
        r = await client.post(f"/api/v1/genesis/deploy/{uuid.uuid4()}")
        assert r.status_code == 404

    async def test_cancel_nonexistent_build_returns_404(self, client):
        r = await client.post(f"/api/v1/genesis/cancel/{uuid.uuid4()}")
        assert r.status_code == 404

    async def test_deploy_build_in_wrong_status_returns_409(self, client, db_session):
        # A build in `decomposing` status cannot be deployed.
        build = GenesisBuild(intent="too early", status=BuildStatus.decomposing)
        db_session.add(build)
        await db_session.commit()
        await db_session.refresh(build)

        r = await client.post(f"/api/v1/genesis/deploy/{build.id}")
        assert r.status_code == 409
        assert "cannot deploy" in r.json()["detail"].lower()

    async def test_deploy_already_deployed_build_returns_409(self, client, db_session):
        build = GenesisBuild(intent="dup", status=BuildStatus.deployed)
        db_session.add(build)
        await db_session.commit()
        await db_session.refresh(build)

        r = await client.post(f"/api/v1/genesis/deploy/{build.id}")
        assert r.status_code == 409

    async def test_pipeline_exception_marks_build_failed(self, client):
        async def boom(intent: str, build_id: str):
            raise RuntimeError("LLM down")

        with patch("genesis.agents.graph_compiler.run_genesis_build", side_effect=boom):
            r = await client.post("/api/v1/genesis/build", json={"intent": "y"})
            bid = r.json()["build_id"]
            body = await _wait_for_status(client, bid, BuildStatus.failed)
        assert body["status"] == "failed"
