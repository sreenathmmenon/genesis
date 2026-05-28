from __future__ import annotations

import json
import uuid
from typing import Any

from langgraph.checkpoint.postgres.aio import AsyncPostgresSaver
from langgraph.graph import END, START, StateGraph
from langchain_core.messages import HumanMessage, SystemMessage

from genesis.agents.state import GenesisState, WorkflowState
from genesis.config import settings
from genesis.utils.logger import get_logger
from genesis.utils.model_router import get_llm

logger = get_logger("genesis.graph_compiler")


def _critic_router(state: GenesisState) -> str:
    """Route after critic: approve → validator, retry → builder (max 3 iters)."""
    if state.get("critic_approved"):
        return "validator"
    if (state.get("iteration_count") or 0) >= 3:
        logger.warning("Max iterations reached — forcing validator")
        return "validator"
    return "builder"


async def compile_genesis_graph(
    checkpointer: AsyncPostgresSaver | None = None,
):
    """Build and compile the Genesis meta-agent pipeline graph."""
    from genesis.agents.architect import ArchitectAgent, AgentConfig as AC
    from genesis.agents.decomposer import DecomposerAgent
    from genesis.agents.builder import BuilderAgent
    from genesis.agents.critic import CriticAgent
    from genesis.agents.validator import ValidatorAgent

    architect = ArchitectAgent(AC(name="architect", role="workflow architect"))
    decomposer = DecomposerAgent(AC(name="decomposer", role="task decomposer"))
    builder = BuilderAgent(AC(name="builder", role="workflow builder"))
    critic = CriticAgent(AC(name="critic", role="quality critic"))
    validator = ValidatorAgent(AC(name="validator", role="validator"))

    graph: StateGraph = StateGraph(GenesisState)

    graph.add_node("architect", architect.execute)
    graph.add_node("decomposer", decomposer.execute)
    graph.add_node("builder", builder.execute)
    graph.add_node("critic", critic.execute)
    graph.add_node("validator", validator.execute)

    graph.add_edge(START, "architect")
    graph.add_edge("architect", "decomposer")
    graph.add_edge("decomposer", "builder")
    graph.add_edge("builder", "critic")
    graph.add_conditional_edges(
        "critic",
        _critic_router,
        {"builder": "builder", "validator": "validator"},
    )
    graph.add_edge("validator", END)

    return graph.compile(checkpointer=checkpointer)


async def compile_workflow_from_json(graph_json: dict[str, Any]):
    """Dynamically compile an operational workflow from a stored graph_json."""
    from genesis.tools.implementations import get_tools_for_agent

    nodes: list[dict] = graph_json.get("nodes", [])
    edges: list[dict] = graph_json.get("edges", [])

    if not nodes:
        graph: StateGraph = StateGraph(WorkflowState)
        async def _noop(state: WorkflowState) -> dict[str, Any]:
            return {}
        graph.add_node("noop", _noop)
        graph.add_edge(START, "noop")
        graph.add_edge("noop", END)
        return graph.compile()

    graph = StateGraph(WorkflowState)

    def _make_node(sp: str, lm, tool_names: list[str] = []):
        tools = get_tools_for_agent(tool_names)
        bound_lm = lm.bind_tools(tools) if tools else lm
        tool_map = {t.name: t for t in tools}

        async def _node(state: WorkflowState) -> dict[str, Any]:
            prior = state.get("intermediate_results", {})
            context = json.dumps(prior) if prior else str(state.get("input_data", {}))
            response = await bound_lm.ainvoke(
                [SystemMessage(content=sp), HumanMessage(content=context)]
            )
            results: dict[str, Any] = {sp[:30]: str(response.content)}
            for tc in getattr(response, "tool_calls", []):
                tool = tool_map.get(tc["name"])
                if tool:
                    try:
                        result = await tool.ainvoke(tc["args"])
                        results[tc["name"]] = str(result)
                    except Exception as exc:
                        results[tc["name"]] = f"ERROR: {exc}"
            return {"intermediate_results": results}
        return _node

    for node in nodes:
        node_id: str = node["id"]
        model_name: str = node.get("model_name", "claude-sonnet-4-5")
        system_prompt: str = node.get("system_prompt", "You are a helpful agent.")
        tool_names: list[str] = node.get("tools") or []
        llm = get_llm(model_name)
        graph.add_node(node_id, _make_node(system_prompt, llm, tool_names))

    # Build edge sets for parallel start/end detection
    nodes_with_incoming: set[str] = {e["target"] for e in edges if e.get("target")}
    nodes_with_outgoing: set[str] = {e["source"] for e in edges if e.get("source")}
    node_ids: set[str] = {n["id"] for n in nodes}

    entry_nodes = node_ids - nodes_with_incoming
    exit_nodes = node_ids - nodes_with_outgoing

    for nid in entry_nodes:
        graph.add_edge(START, nid)

    added: set[tuple[str, str]] = set()
    for edge in edges:
        src, dst = edge.get("source"), edge.get("target")
        if src and dst and (src, dst) not in added:
            graph.add_edge(src, dst)
            added.add((src, dst))

    for nid in exit_nodes:
        graph.add_edge(nid, END)

    return graph.compile()


async def run_genesis_build(
    intent: str,
    build_id: str,
    db_url: str | None = None,
) -> dict[str, Any]:
    """Entry-point: run the full Genesis pipeline for a given intent."""
    conn_string = (db_url or settings.database_url).replace("+asyncpg", "")

    try:
        async with AsyncPostgresSaver.from_conn_string(conn_string) as saver:
            await saver.setup()
            compiled = await compile_genesis_graph(checkpointer=saver)

            thread_id = str(uuid.uuid4())
            initial: GenesisState = {
                "intent": intent,
                "build_id": build_id,
                "status": "started",
                "architect_output": None,
                "decomposer_output": None,
                "builder_output": None,
                "critic_feedback": None,
                "critic_approved": False,
                "iteration_count": 0,
                "validator_report": None,
                "workflow_id": None,
                "error": None,
                "messages": [HumanMessage(content=intent)],
            }

            final = await compiled.ainvoke(
                initial,
                config={"configurable": {"thread_id": thread_id}},
            )
            return dict(final)
    except Exception as exc:
        logger.exception("Genesis build failed for build_id=%s: %s", build_id, exc)
        return {"error": str(exc), "build_id": build_id, "status": "failed"}
