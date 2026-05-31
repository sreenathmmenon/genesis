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


async def _recall_memory(node_id: str, context: str, limit: int = 3) -> str:
    """Retrieve relevant past conclusions for this node from Qdrant."""
    try:
        from qdrant_client import AsyncQdrantClient
        from genesis.config import settings
        from genesis.agents.memory_agent import _embed

        vector = await _embed(f"{node_id}: {context[:500]}")
        client = AsyncQdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)
        results = await client.search(
            collection_name=f"node_{node_id}",
            query_vector=vector,
            limit=limit,
            score_threshold=0.70,
            with_payload=True,
        )
        await client.close()
        if not results:
            return ""
        parts = [f"- {r.payload.get('conclusion', '')[:300]}" for r in results if r.payload.get('conclusion')]
        return "\n".join(parts)
    except Exception as exc:
        logger.debug("Memory recall failed for node %s: %s", node_id, exc)
        return ""


async def _store_memory(node_id: str, context: str, conclusion: str) -> None:
    """Store this node's conclusion in its Qdrant collection for future recall."""
    try:
        import uuid as _uuid
        from qdrant_client import AsyncQdrantClient
        from qdrant_client.models import Distance, PointStruct, VectorParams
        from genesis.config import settings
        from genesis.agents.memory_agent import _embed

        vector = await _embed(f"{node_id}: {context[:500]}")
        collection = f"node_{node_id}"
        client = AsyncQdrantClient(url=settings.qdrant_url, api_key=settings.qdrant_api_key or None)

        # Ensure collection exists
        collections = [c.name for c in (await client.get_collections()).collections]
        if collection not in collections:
            await client.create_collection(
                collection_name=collection,
                vectors_config=VectorParams(size=1536, distance=Distance.COSINE),
            )

        await client.upsert(
            collection_name=collection,
            points=[PointStruct(
                id=str(_uuid.uuid4()),
                vector=vector,
                payload={"node_id": node_id, "context_snippet": context[:200], "conclusion": conclusion[:1000]},
            )],
        )
        await client.close()
        logger.debug("Stored memory for node %s", node_id)
    except Exception as exc:
        logger.debug("Memory store failed for node %s: %s", node_id, exc)


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


async def compile_workflow_from_json(
    graph_json: dict[str, Any],
    db_writer: Any | None = None,
):
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

    def _make_node(node_id: str, sp: str, lm, tool_names: list[str] = [], memory_type: str = "none"):
        tools = get_tools_for_agent(tool_names)
        bound_lm = lm.bind_tools(tools) if tools else lm
        tool_map = {t.name: t for t in tools}

        _is_terminal = bool(tools) and all(t in _TERMINAL_TOOLS for t in tool_names)
        system_prompt = sp
        if tools:
            if _is_terminal:
                system_prompt = (
                    sp + f"\n\nIMPORTANT: You have received data from previous agents in your context below. "
                    f"Use it to compose and send your message immediately via {tool_names[0]}. "
                    f"Do NOT ask for more input — all the data you need is in the context. "
                    f"You MUST call {tool_names[0]} now."
                )
            else:
                system_prompt = sp + f"\n\nIMPORTANT: You MUST call one of your available tools to complete this task. Available tools: {tool_names}. Do not just respond with text — you MUST make a tool call."

        async def _node(state: WorkflowState) -> dict[str, Any]:
            from langchain_core.messages import ToolMessage
            prior = state.get("intermediate_results", {})
            if prior:
                context_parts = []
                for k, v in prior.items():
                    short_key = k[:60] if len(k) > 60 else k
                    context_parts.append(f"=== {short_key} ===\n{str(v)[:3000]}")
                context = "Data from previous agents:\n\n" + "\n\n".join(context_parts)
            else:
                context = json.dumps(state.get("input_data", {}))
            logger.info("Node [%s] starting — prior keys: %s", node_id, list(prior.keys()))

            if db_writer is not None:
                await db_writer({"type": "node_started", "node": node_id, "agent_name": node_id.replace("_", " ").title()})

            # Memory retrieval: prepend relevant past conclusions to system prompt
            active_system_prompt = system_prompt
            if memory_type != "none":
                recalled = await _recall_memory(node_id, context)
                if recalled:
                    active_system_prompt = system_prompt + "\n\n## Relevant context from past runs:\n" + recalled
                    logger.debug("Node [%s] recalled %d memory entries", node_id, recalled.count("\n- ") + 1)

            messages = [SystemMessage(content=active_system_prompt), HumanMessage(content=context)]
            results: dict[str, Any] = {}
            max_rounds = 10
            first_round_lm = lm.bind_tools(tools, tool_choice="any") if tools else lm

            for _round in range(max_rounds):
                try:
                    lm_to_use = first_round_lm if (_round == 0 and tools) else bound_lm
                    response = await lm_to_use.ainvoke(messages)
                except Exception as exc:
                    logger.error("Node [%s] LLM invoke failed (round %d): %s", node_id, _round, exc)
                    results[node_id] = f"LLM_ERROR: {exc}"
                    break

                tool_calls = getattr(response, "tool_calls", [])
                logger.info("Node [%s] round %d — tool_calls: %s", node_id, _round, [tc["name"] for tc in tool_calls])

                if not tool_calls:
                    response_content = str(response.content)
                    results[node_id] = response_content
                    if db_writer is not None:
                        await db_writer({"type": "agent_conclusion", "node": node_id, "content": response_content})
                    if memory_type != "none":
                        await _store_memory(node_id, context, response_content)
                    break

                all_terminal = all(tc["name"] in _TERMINAL_TOOLS for tc in tool_calls)

                messages.append(response)
                tool_results = []
                for tc in tool_calls:
                    tool = tool_map.get(tc["name"])
                    if db_writer is not None:
                        await db_writer({"type": "tool_called", "node": node_id, "tool": tc["name"], "args": tc.get("args", {})})
                    if tool:
                        try:
                            logger.info("Node [%s] calling tool %s", node_id, tc["name"])
                            result = await tool.ainvoke(tc["args"])
                            result_str = str(result)
                            results[tc["name"]] = result_str
                            logger.info("Node [%s] tool %s returned: %s", node_id, tc["name"], result_str[:200])
                            if db_writer is not None:
                                await db_writer({"type": "tool_result", "node": node_id, "tool": tc["name"], "result": result_str})
                            tool_results.append(ToolMessage(content=result_str, tool_call_id=tc["id"]))
                        except Exception as exc:
                            logger.error("Node [%s] tool %s failed: %s", node_id, tc["name"], exc)
                            err_msg = f"ERROR: {exc}"
                            results[tc["name"]] = err_msg
                            if db_writer is not None:
                                await db_writer({"type": "tool_result", "node": node_id, "tool": tc["name"], "result": err_msg})
                            tool_results.append(ToolMessage(content=err_msg, tool_call_id=tc["id"]))
                    else:
                        logger.warning("Node [%s] tool %s not found", node_id, tc["name"])
                        if db_writer is not None:
                            await db_writer({"type": "tool_result", "node": node_id, "tool": tc["name"], "result": "Tool not available"})
                        tool_results.append(ToolMessage(content="Tool not available", tool_call_id=tc["id"]))
                messages.extend(tool_results)
                if all_terminal:
                    if db_writer is not None:
                        await db_writer({"type": "agent_conclusion", "node": node_id, "content": results.get(node_id, "Action completed.")})
                    results.setdefault(node_id, "")
                    if memory_type != "none" and results.get(node_id):
                        await _store_memory(node_id, context, results[node_id])
                    break
            else:
                logger.warning("Node [%s] hit max tool call rounds (%d)", node_id, max_rounds)
                # Force a final synthesis after hitting max rounds
                try:
                    synthesis_prompt = "Based on all the research and tool results above, write your final conclusion and summary. Do NOT call any more tools."
                    messages.append(HumanMessage(content=synthesis_prompt))
                    final_response = await lm.ainvoke(messages)
                    conclusion = str(final_response.content)
                    results[node_id] = conclusion
                    if db_writer is not None:
                        await db_writer({"type": "agent_conclusion", "node": node_id, "content": conclusion})
                    if memory_type != "none":
                        await _store_memory(node_id, context, conclusion)
                except Exception as exc:
                    logger.error("Node [%s] synthesis after max rounds failed: %s", node_id, exc)
                    results.setdefault(node_id, f"Max tool rounds reached.")

            logger.info("Node [%s] done — result keys: %s", node_id, list(results.keys()))
            return {"intermediate_results": results}
        return _node

    for node in nodes:
        node_id: str = node["id"]
        raw_model: str = node.get("model_name", "claude-sonnet-4-5")
        # Fall back to sonnet if model name is not in the allowed list
        from genesis.utils.model_router import ALLOWED_MODELS
        model_name = raw_model if raw_model in ALLOWED_MODELS else "claude-sonnet-4-5"
        if model_name != raw_model:
            logger.warning("Node %s: unknown model '%s' — using claude-sonnet-4-5", node_id, raw_model)
        system_prompt: str = node.get("system_prompt", "You are a helpful agent.")
        tool_names: list[str] = node.get("tools") or []
        memory_type: str = node.get("memory_type", "none")
        llm = get_llm(model_name)
        graph.add_node(node_id, _make_node(node_id, system_prompt, llm, tool_names, memory_type))

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
