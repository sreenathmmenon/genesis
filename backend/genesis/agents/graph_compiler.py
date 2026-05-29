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

    # Tools that produce side-effects (send/notify) — stop looping after using these
    from genesis.tools.implementations import TERMINAL_TOOLS as _TERMINAL_TOOLS

    def _make_node(sp: str, lm, tool_names: list[str] = []):
        tools = get_tools_for_agent(tool_names)
        bound_lm = lm.bind_tools(tools) if tools else lm
        tool_map = {t.name: t for t in tools}

        node_label = sp[:40].replace("\n", " ")
        system_prompt = sp
        if tools:
            system_prompt = sp + f"\n\nIMPORTANT: You MUST call one of your available tools to complete this task. Available tools: {tool_names}. Do not just respond with text — you MUST make a tool call."

        async def _node(state: WorkflowState) -> dict[str, Any]:
            from langchain_core.messages import ToolMessage
            prior = state.get("intermediate_results", {})
            # Build clean context: list values clearly for the LLM
            if prior:
                context_parts = []
                for k, v in prior.items():
                    short_key = k[:60] if len(k) > 60 else k
                    context_parts.append(f"=== {short_key} ===\n{str(v)[:3000]}")
                context = "\n\n".join(context_parts)
            else:
                context = json.dumps(state.get("input_data", {}))
            logger.info("Node [%s] starting — prior keys: %s", node_label, list(prior.keys()))

            # ReAct loop: allow up to 10 tool call rounds
            messages = [SystemMessage(content=system_prompt), HumanMessage(content=context)]
            results: dict[str, Any] = {}
            max_rounds = 10
            # For nodes with tools, force at least one tool call in round 0
            first_round_lm = lm.bind_tools(tools, tool_choice="any") if tools else lm

            for _round in range(max_rounds):
                try:
                    lm_to_use = first_round_lm if (_round == 0 and tools) else bound_lm
                    response = await lm_to_use.ainvoke(messages)
                except Exception as exc:
                    logger.error("Node [%s] LLM invoke failed (round %d): %s", node_label, _round, exc)
                    results[node_label] = f"LLM_ERROR: {exc}"
                    break

                tool_calls = getattr(response, "tool_calls", [])
                logger.info("Node [%s] round %d — tool_calls: %s", node_label, _round, [tc["name"] for tc in tool_calls])

                if not tool_calls:
                    # No more tool calls — capture the final text response
                    results[node_label] = str(response.content)
                    break

                # If ALL tool calls in this round are terminal, execute them and stop
                all_terminal = all(tc["name"] in _TERMINAL_TOOLS for tc in tool_calls)

                # Execute all tool calls in this round
                messages.append(response)
                tool_results = []
                for tc in tool_calls:
                    tool = tool_map.get(tc["name"])
                    if tool:
                        try:
                            logger.info("Node [%s] calling tool %s", node_label, tc["name"])
                            result = await tool.ainvoke(tc["args"])
                            results[tc["name"]] = str(result)
                            logger.info("Node [%s] tool %s returned: %s", node_label, tc["name"], str(result)[:200])
                            tool_results.append(ToolMessage(content=str(result), tool_call_id=tc["id"]))
                        except Exception as exc:
                            logger.error("Node [%s] tool %s failed: %s", node_label, tc["name"], exc)
                            err_msg = f"ERROR: {exc}"
                            results[tc["name"]] = err_msg
                            tool_results.append(ToolMessage(content=err_msg, tool_call_id=tc["id"]))
                    else:
                        logger.warning("Node [%s] tool %s not found", node_label, tc["name"])
                        tool_results.append(ToolMessage(content="Tool not available", tool_call_id=tc["id"]))
                messages.extend(tool_results)
                # Stop after executing terminal tool calls (no need to loop)
                if all_terminal:
                    results.setdefault(node_label, "")
                    break
            else:
                logger.warning("Node [%s] hit max tool call rounds (%d)", node_label, max_rounds)

            logger.info("Node [%s] done — result keys: %s", node_label, list(results.keys()))
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
