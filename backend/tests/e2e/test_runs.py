"""End-to-end coverage of /api/v1/runs and /messages — success and failure paths."""
import uuid
from datetime import datetime, timezone

import pytest

from genesis.models import Message, Run
from genesis.models.run import MessageType, RunStatus
from genesis.models.workflow import Workflow


async def _seed_workflow_with_runs(db_session, run_count=2, completed_count=0):
    wf = Workflow(name="WF", description="d", intent="i")
    db_session.add(wf)
    await db_session.flush()
    runs = []
    for i in range(run_count):
        completed = i < completed_count
        run = Run(
            workflow_id=wf.id,
            status=RunStatus.completed if completed else RunStatus.running,
            completed_at=datetime.now(timezone.utc) if completed else None,
            token_count_total=10 * (i + 1),
        )
        db_session.add(run)
        runs.append(run)
    await db_session.commit()
    for r in runs:
        await db_session.refresh(r)
    return wf, runs


@pytest.mark.asyncio
class TestRunSuccess:
    async def test_list_runs_empty(self, client):
        r = await client.get("/api/v1/runs/")
        assert r.status_code == 200
        assert r.json() == []

    async def test_list_runs_returns_seeded(self, client, db_session):
        wf, runs = await _seed_workflow_with_runs(db_session, run_count=3)
        r = await client.get("/api/v1/runs/")
        assert r.status_code == 200
        ids = {row["id"] for row in r.json()}
        assert ids == {str(run.id) for run in runs}

    async def test_list_runs_filtered_by_workflow_id(self, client, db_session):
        wf_a, runs_a = await _seed_workflow_with_runs(db_session, run_count=2)
        wf_b, runs_b = await _seed_workflow_with_runs(db_session, run_count=1)

        r = await client.get(f"/api/v1/runs/?workflow_id={wf_a.id}")
        assert r.status_code == 200
        ids = {row["id"] for row in r.json()}
        assert ids == {str(run.id) for run in runs_a}
        assert str(runs_b[0].id) not in ids

    async def test_list_runs_pagination(self, client, db_session):
        wf, runs = await _seed_workflow_with_runs(db_session, run_count=5)

        page1 = (await client.get("/api/v1/runs/?limit=2&offset=0")).json()
        page2 = (await client.get("/api/v1/runs/?limit=2&offset=2")).json()
        page3 = (await client.get("/api/v1/runs/?limit=2&offset=4")).json()

        assert len(page1) == 2
        assert len(page2) == 2
        assert len(page3) == 1
        ids = {r["id"] for r in page1 + page2 + page3}
        assert ids == {str(r.id) for r in runs}

    async def test_get_run_by_id(self, client, db_session):
        wf, runs = await _seed_workflow_with_runs(db_session, run_count=1)
        run = runs[0]

        r = await client.get(f"/api/v1/runs/{run.id}")
        assert r.status_code == 200
        body = r.json()
        assert body["id"] == str(run.id)
        assert body["workflow_id"] == str(wf.id)
        assert body["status"] == "running"
        assert body["token_count_total"] == 10

    async def test_list_messages_for_run(self, client, db_session):
        wf, runs = await _seed_workflow_with_runs(db_session, run_count=1)
        run = runs[0]

        for i in range(3):
            db_session.add(Message(
                run_id=run.id,
                sender_agent=f"agent_{i}",
                receiver_agent="target",
                content=f"msg {i}",
                message_type=MessageType.agent_output,
            ))
        await db_session.commit()

        r = await client.get(f"/api/v1/runs/{run.id}/messages")
        assert r.status_code == 200
        msgs = r.json()
        assert len(msgs) == 3
        senders = [m["sender_agent"] for m in msgs]
        assert senders == ["agent_0", "agent_1", "agent_2"]

    async def test_list_messages_pagination(self, client, db_session):
        wf, runs = await _seed_workflow_with_runs(db_session, run_count=1)
        run = runs[0]

        for i in range(5):
            db_session.add(Message(
                run_id=run.id,
                sender_agent=f"a{i}",
                receiver_agent="t",
                content=str(i),
                message_type=MessageType.state_update,
            ))
        await db_session.commit()

        page1 = (await client.get(f"/api/v1/runs/{run.id}/messages?limit=2")).json()
        page2 = (await client.get(f"/api/v1/runs/{run.id}/messages?limit=2&offset=2")).json()
        assert len(page1) == 2
        assert len(page2) == 2


@pytest.mark.asyncio
class TestRunFailure:
    async def test_get_nonexistent_run_returns_404(self, client):
        r = await client.get(f"/api/v1/runs/{uuid.uuid4()}")
        assert r.status_code == 404
        # Global 404 handler in main.py shadows HTTPException(404).
        assert r.json()["error"] == "Not found"

    async def test_list_messages_for_nonexistent_run_returns_404(self, client):
        r = await client.get(f"/api/v1/runs/{uuid.uuid4()}/messages")
        assert r.status_code == 404

    async def test_malformed_run_uuid_returns_422(self, client):
        r = await client.get("/api/v1/runs/not-a-uuid")
        assert r.status_code == 422

    async def test_limit_out_of_range_returns_422(self, client):
        r1 = await client.get("/api/v1/runs/?limit=0")
        r2 = await client.get("/api/v1/runs/?limit=999")
        assert r1.status_code == 422
        assert r2.status_code == 422

    async def test_negative_offset_returns_422(self, client):
        r = await client.get("/api/v1/runs/?offset=-1")
        assert r.status_code == 422
