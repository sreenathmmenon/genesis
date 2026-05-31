"""Unit tests — Message delivery: run persistence, message retrieval, output payload."""
import uuid
import pytest
from datetime import datetime, timezone


# ── Helpers ────────────────────────────────────────────────────────────────────

async def _create_workflow(client, name="test-wf") -> str:
    resp = await client.post("/api/v1/workflows/", json={"name": name, "intent": "test"})
    assert resp.status_code == 201
    return resp.json()["id"]


# ── Run persistence via API ────────────────────────────────────────────────────

async def test_run_created_in_db_readable(db_session, client):
    """A run created directly in DB with a workflow is readable via GET /runs/{id}."""
    from genesis.models.run import Run, RunStatus
    from genesis.models.workflow import Workflow, WorkflowStatus
    from sqlalchemy import select

    wf = Workflow(name="readable-wf", intent="test", status=WorkflowStatus.active)
    db_session.add(wf)
    await db_session.flush()

    run = Run(
        workflow_id=wf.id,
        status=RunStatus.completed,
        started_at=datetime.now(timezone.utc),
    )
    db_session.add(run)
    await db_session.flush()
    await db_session.commit()

    resp = await client.get(f"/api/v1/runs/{run.id}")
    assert resp.status_code == 200
    data = resp.json()
    assert data["id"] == str(run.id)
    assert data["status"] == "completed"
    assert data["workflow_id"] == str(wf.id)


async def test_run_list_filtered_by_workflow(db_session, client):
    """GET /runs/?workflow_id= returns only runs for that workflow."""
    from genesis.models.run import Run, RunStatus
    from genesis.models.workflow import Workflow, WorkflowStatus

    wf1 = Workflow(name="filter-wf-1", intent="test", status=WorkflowStatus.active)
    wf2 = Workflow(name="filter-wf-2", intent="test", status=WorkflowStatus.active)
    db_session.add_all([wf1, wf2])
    await db_session.flush()

    run1 = Run(workflow_id=wf1.id, status=RunStatus.completed, started_at=datetime.now(timezone.utc))
    run2 = Run(workflow_id=wf2.id, status=RunStatus.failed, started_at=datetime.now(timezone.utc))
    db_session.add_all([run1, run2])
    await db_session.flush()
    await db_session.commit()

    resp = await client.get(f"/api/v1/runs/?workflow_id={wf1.id}")
    assert resp.status_code == 200
    runs = resp.json()
    assert all(r["workflow_id"] == str(wf1.id) for r in runs)
    ids = [r["id"] for r in runs]
    assert str(run1.id) in ids
    assert str(run2.id) not in ids


async def test_get_nonexistent_run_returns_404(client):
    resp = await client.get("/api/v1/runs/00000000-0000-0000-0000-000000000000")
    assert resp.status_code == 404


# ── Message persistence ────────────────────────────────────────────────────────

async def test_messages_persisted_and_listed(db_session, client):
    """Messages written to DB are returned by GET /runs/{id}/messages."""
    from genesis.models.run import Run, RunStatus, Message, MessageType
    from genesis.models.workflow import Workflow, WorkflowStatus

    wf = Workflow(name="msg-test-wf", intent="test", status=WorkflowStatus.active)
    db_session.add(wf)
    await db_session.flush()

    run = Run(workflow_id=wf.id, status=RunStatus.completed, started_at=datetime.now(timezone.utc))
    db_session.add(run)
    await db_session.flush()

    msg = Message(
        run_id=run.id,
        sender_agent="scraper",
        receiver_agent="ranker",
        content="Here are the top stories: ...",
        message_type=MessageType.agent_output,
    )
    db_session.add(msg)
    await db_session.flush()
    await db_session.commit()

    resp = await client.get(f"/api/v1/runs/{run.id}/messages")
    assert resp.status_code == 200
    messages = resp.json()
    assert len(messages) >= 1
    found = next((m for m in messages if m["sender_agent"] == "scraper"), None)
    assert found is not None
    assert found["receiver_agent"] == "ranker"
    assert found["content"] == "Here are the top stories: ..."
    assert found["message_type"] == "agent_output"


async def test_messages_ordered_by_timestamp(db_session, client):
    """Messages are returned in chronological order."""
    from genesis.models.run import Run, RunStatus, Message, MessageType
    from genesis.models.workflow import Workflow, WorkflowStatus
    from datetime import timedelta

    wf = Workflow(name="order-test-wf", intent="test", status=WorkflowStatus.active)
    db_session.add(wf)
    await db_session.flush()

    run = Run(workflow_id=wf.id, status=RunStatus.completed, started_at=datetime.now(timezone.utc))
    db_session.add(run)
    await db_session.flush()

    now = datetime.now(timezone.utc)
    m1 = Message(run_id=run.id, sender_agent="a1", receiver_agent="a2",
                 content="first", message_type=MessageType.agent_output, timestamp=now)
    m2 = Message(run_id=run.id, sender_agent="a2", receiver_agent="a3",
                 content="second", message_type=MessageType.agent_output,
                 timestamp=now + timedelta(seconds=5))
    db_session.add_all([m2, m1])  # intentionally out of order
    await db_session.flush()
    await db_session.commit()

    resp = await client.get(f"/api/v1/runs/{run.id}/messages")
    assert resp.status_code == 200
    messages = resp.json()
    contents = [m["content"] for m in messages]
    assert contents.index("first") < contents.index("second")


# ── Run output endpoint ────────────────────────────────────────────────────────

async def test_run_output_with_stored_output_data(db_session, client):
    """GET /runs/{id}/output returns stored output_data when present."""
    from genesis.models.run import Run, RunStatus
    from genesis.models.workflow import Workflow, WorkflowStatus

    wf = Workflow(name="output-wf", intent="test", status=WorkflowStatus.active)
    db_session.add(wf)
    await db_session.flush()

    output = {
        "run_id": "test-run-id",
        "workflow_name": "output-wf",
        "status": "completed",
        "summary": "All 3 agents executed successfully.",
        "agent_outputs": {"scraper": "Found 5 stories", "ranker": "Top: Claude Opus"},
        "token_count": 1234,
        "estimated_cost_usd": 0.011,
        "error": None,
    }
    run = Run(
        workflow_id=wf.id,
        status=RunStatus.completed,
        started_at=datetime.now(timezone.utc),
        output_data=output,
    )
    db_session.add(run)
    await db_session.flush()
    await db_session.commit()

    resp = await client.get(f"/api/v1/runs/{run.id}/output")
    assert resp.status_code == 200
    data = resp.json()
    assert data["summary"] == "All 3 agents executed successfully."
    assert data["agent_outputs"]["scraper"] == "Found 5 stories"


async def test_run_output_fallback_from_messages(db_session, client):
    """GET /runs/{id}/output falls back to messages when output_data is null."""
    from genesis.models.run import Run, RunStatus, Message, MessageType
    from genesis.models.workflow import Workflow, WorkflowStatus

    wf = Workflow(name="fallback-wf", intent="test", status=WorkflowStatus.active)
    db_session.add(wf)
    await db_session.flush()

    run = Run(workflow_id=wf.id, status=RunStatus.completed,
              started_at=datetime.now(timezone.utc), output_data=None)
    db_session.add(run)
    await db_session.flush()

    msg = Message(
        run_id=run.id, sender_agent="executor", receiver_agent="user",
        content="Final result from agent run.", message_type=MessageType.agent_output,
    )
    db_session.add(msg)
    await db_session.flush()
    await db_session.commit()

    resp = await client.get(f"/api/v1/runs/{run.id}/output")
    assert resp.status_code == 200
    data = resp.json()
    assert "executor" in data["agent_outputs"]


# ── Output delivery: build_output_payload (pure unit, no DB) ──────────────────

def test_build_output_payload_structure():
    """build_output_payload returns the expected universal structure."""
    from genesis.utils.output_delivery import build_output_payload
    from datetime import timedelta

    now = datetime.now(timezone.utc)
    payload = build_output_payload(
        run_id="run-123",
        workflow_id="wf-456",
        workflow_name="hn-monitor",
        status="completed",
        final_output={"scraper": "10 stories found", "ranker": "Top: Claude Opus 4.8"},
        messages=[],
        token_count=2000,
        estimated_cost=0.018,
        started_at=now,
        completed_at=now + timedelta(seconds=90),
        error=None,
    )
    assert payload["run_id"] == "run-123"
    assert payload["workflow_name"] == "hn-monitor"
    assert payload["status"] == "completed"
    assert "summary" in payload
    assert "agent_outputs" in payload
    assert payload["token_count"] == 2000
    assert abs(payload["estimated_cost_usd"] - 0.018) < 1e-6
    assert payload["duration_seconds"] == 90
    assert payload["error"] is None


def test_build_output_payload_with_error():
    """Payload correctly carries error field when run fails."""
    from genesis.utils.output_delivery import build_output_payload

    now = datetime.now(timezone.utc)
    payload = build_output_payload(
        run_id="run-err", workflow_id="wf-err", workflow_name="broken-wf",
        status="failed", final_output={}, messages=[], token_count=0,
        estimated_cost=0.0, started_at=now, completed_at=now,
        error="LLM invoke failed: model not available",
    )
    assert payload["status"] == "failed"
    assert payload["error"] == "LLM invoke failed: model not available"


# ── Audit log ─────────────────────────────────────────────────────────────────

@pytest.mark.asyncio
async def test_audit_log_entries_visible(db_session, client):
    """GET /audit/ returns audit entries in paginated format."""
    from genesis.models.audit_log import AuditLog

    entry = AuditLog(
        event_type="run.completed",
        entity_type="run",
        entity_id=str(uuid.uuid4()),
        entity_name="test-run",
        detail={"workflow_id": "wf-123", "token_count": 500},
    )
    db_session.add(entry)
    await db_session.flush()
    await db_session.commit()

    resp = await client.get("/api/v1/audit/")
    assert resp.status_code == 200
    body = resp.json()
    # Audit endpoint returns {items, offset, limit}
    items = body.get("items", body) if isinstance(body, dict) else body
    assert isinstance(items, list)
    event_types = [e["event_type"] for e in items]
    assert "run.completed" in event_types


@pytest.mark.asyncio
async def test_audit_log_filter_by_event_type(db_session, client):
    """GET /audit/?event_type=X returns only entries of that type."""
    from genesis.models.audit_log import AuditLog

    target_id = str(uuid.uuid4())
    unique_type = f"workflow.unique-{target_id}"
    for et in ["run.started", "run.completed", unique_type]:
        db_session.add(AuditLog(event_type=et, entity_type="run", entity_id=str(uuid.uuid4())))
    await db_session.flush()
    await db_session.commit()

    resp = await client.get(f"/api/v1/audit/?event_type={unique_type}")
    assert resp.status_code == 200
    body = resp.json()
    items = body.get("items", body) if isinstance(body, dict) else body
    assert len(items) >= 1
    assert all(e["event_type"] == unique_type for e in items)
