"""Core test suite — three focused tests covering agent creation, graph compilation, and message history.

Run with:
    cd backend && pytest tests/test_core.py -v
"""
from __future__ import annotations

import uuid
from datetime import datetime, timezone
from unittest.mock import AsyncMock, MagicMock, patch

import pytest
from httpx import AsyncClient
from langchain_core.messages import AIMessage


# ── Test 1: Agent creation and retrieval via API ───────────────────────────────

@pytest.mark.asyncio
async def test_create_agent_and_retrieve_by_id(client: AsyncClient):
    """POST /api/v1/agents/ creates an agent with a UUID id; GET returns same record."""
    payload = {
        "name": "core-test-agent",
        "role": "data-fetcher",
        "model_name": "claude-sonnet-4-5",
        "system_prompt": "Fetch data from the web and summarise it.",
    }

    # Create
    create_resp = await client.post("/api/v1/agents/", json=payload)
    assert create_resp.status_code == 201, create_resp.text

    created = create_resp.json()
    assert "id" in created, "Response must include an 'id' field"

    # Validate it is a well-formed UUID
    agent_id = created["id"]
    uuid.UUID(agent_id)  # raises ValueError if malformed

    assert created["name"] == "core-test-agent"
    assert created["role"] == "data-fetcher"
    assert created["model_name"] == "claude-sonnet-4-5"
    assert created["system_prompt"] == "Fetch data from the web and summarise it."

    # Retrieve
    get_resp = await client.get(f"/api/v1/agents/{agent_id}")
    assert get_resp.status_code == 200, get_resp.text

    retrieved = get_resp.json()
    assert retrieved["id"] == agent_id
    assert retrieved["name"] == "core-test-agent"
    assert retrieved["role"] == "data-fetcher"


# ── Test 2: compile_workflow_from_json — invoke with mocked LLM ───────────────

@pytest.mark.asyncio
async def test_compile_workflow_from_json_single_node_mocked_llm():
    """compile_workflow_from_json compiles a single-node graph; invoking it with a mocked
    LLM returns intermediate_results keyed by the node id."""
    from genesis.agents.graph_compiler import compile_workflow_from_json
    from genesis.agents.state import WorkflowState

    node_id = "summariser"
    graph_json = {
        "nodes": [
            {
                "id": node_id,
                "system_prompt": "Summarise the input.",
                "tools": [],
                "model_name": "claude-sonnet-4-5",
            }
        ],
        "edges": [],
    }

    # Build a mock LLM that returns an AIMessage with no tool_calls (plain text response)
    mock_response = AIMessage(content="This is the mocked summary output.")
    mock_llm = MagicMock()
    mock_llm.bind_tools = MagicMock(return_value=mock_llm)
    mock_llm.ainvoke = AsyncMock(return_value=mock_response)

    with patch("genesis.agents.graph_compiler.get_llm", return_value=mock_llm):
        compiled = await compile_workflow_from_json(graph_json, db_writer=None)

    assert compiled is not None, "compile_workflow_from_json must return a compiled graph"
    assert node_id in compiled.get_graph().nodes, f"Node '{node_id}' must be in the compiled graph"

    initial_state: WorkflowState = {
        "workflow_id": str(uuid.uuid4()),
        "run_id": str(uuid.uuid4()),
        "input_data": {"topic": "AI news"},
        "intermediate_results": {},
        "final_output": None,
        "error": None,
        "messages": [],
    }

    result = await compiled.ainvoke(initial_state)

    assert "intermediate_results" in result, "Result must contain 'intermediate_results'"
    intermediate = result["intermediate_results"]
    assert node_id in intermediate, (
        f"intermediate_results must contain key '{node_id}' (the node id). "
        f"Got keys: {list(intermediate.keys())}"
    )
    assert isinstance(intermediate[node_id], str), "Node output must be a string"
    assert len(intermediate[node_id]) > 0, "Node output must not be empty"


# ── Test 3: Messages endpoint returns list with correct shape ─────────────────

@pytest.mark.asyncio
async def test_run_messages_endpoint_returns_correct_shape(db_session, client: AsyncClient):
    """GET /api/v1/runs/{run_id}/messages returns a list where each item has the
    expected fields: id, run_id, sender_agent, content, message_type, timestamp.
    A run with seeded messages returns them; a fresh run (no messages) returns [].
    """
    from genesis.models.run import Message, MessageType, Run, RunStatus
    from genesis.models.workflow import Workflow, WorkflowStatus

    # Seed a workflow and run
    wf = Workflow(
        name="core-test-wf",
        intent="Monitor and summarise news.",
        status=WorkflowStatus.active,
    )
    db_session.add(wf)
    await db_session.flush()

    run = Run(
        workflow_id=wf.id,
        status=RunStatus.completed,
        started_at=datetime.now(timezone.utc),
    )
    db_session.add(run)
    await db_session.flush()

    # Seed two messages so we can check shape
    msg1 = Message(
        run_id=run.id,
        sender_agent="scraper_node",
        receiver_agent="ranker_node",
        content="Scraped 10 articles from HN.",
        message_type=MessageType.agent_output,
    )
    msg2 = Message(
        run_id=run.id,
        sender_agent="ranker_node",
        receiver_agent="user",
        content="Top article: Claude 4 released.",
        message_type=MessageType.agent_output,
    )
    db_session.add_all([msg1, msg2])
    await db_session.flush()
    await db_session.commit()

    resp = await client.get(f"/api/v1/runs/{run.id}/messages")
    assert resp.status_code == 200, resp.text

    messages = resp.json()
    assert isinstance(messages, list), "Endpoint must return a JSON array"
    assert len(messages) >= 2, "Both seeded messages must be present"

    # Verify expected shape on every returned object
    required_fields = {"id", "run_id", "sender_agent", "content", "message_type", "timestamp"}
    for msg in messages:
        missing = required_fields - set(msg.keys())
        assert not missing, f"Message object is missing fields: {missing}"

    # Verify the seeded messages are present and have correct run_id
    run_id_str = str(run.id)
    for msg in messages:
        assert msg["run_id"] == run_id_str, "Every message must reference the correct run_id"

    senders = {m["sender_agent"] for m in messages}
    assert "scraper_node" in senders
    assert "ranker_node" in senders

    # Spot-check message_type is a valid enum value string
    valid_types = {"state_update", "tool_call", "tool_result", "human_input", "agent_output"}
    for msg in messages:
        assert msg["message_type"] in valid_types, (
            f"message_type '{msg['message_type']}' is not a known MessageType value"
        )

    # Also verify the empty-messages case: a fresh run with no messages returns []
    fresh_run = Run(
        workflow_id=wf.id,
        status=RunStatus.running,
        started_at=datetime.now(timezone.utc),
    )
    db_session.add(fresh_run)
    await db_session.flush()
    await db_session.commit()

    fresh_resp = await client.get(f"/api/v1/runs/{fresh_run.id}/messages")
    assert fresh_resp.status_code == 200, fresh_resp.text
    assert fresh_resp.json() == [], "A run with no messages must return an empty list"
