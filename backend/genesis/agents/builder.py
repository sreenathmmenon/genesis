from __future__ import annotations

import json
import uuid
from typing import Any

from genesis.agents.base import AgentConfig, GenesisAgent
from genesis.agents.state import GenesisState
from genesis.utils.redis_client import CANVAS_UPDATES, redis_client

_SYSTEM_PROMPT = """\
You are the Builder Agent in the Genesis AI orchestration platform.

Given a task decomposition, produce the final workflow graph_json and canvas_json.

Output ONLY valid JSON matching this schema — no markdown, no commentary:
{
  "graph_json": {
    "nodes": [
      {
        "id": "<agent_name>",
        "model_name": "claude-sonnet-4-5",
        "system_prompt": "<full system prompt>",
        "tools": [],
        "memory_type": "none",
        "schedule": null
      }
    ],
    "edges": [
      {"source": "<id>", "target": "<id>", "condition": "always"}
    ]
  },
  "canvas_json": {
    "nodes": [
      {
        "id": "<agent_name>",
        "type": "agentNode",
        "position": {"x": 0, "y": 0},
        "data": {
          "label": "<agent_name>",
          "role": "<role>",
          "layer": "meta | build | validate | ops",
          "status": "idle",
          "tools": [],
          "model": "claude-sonnet-4-5"
        }
      }
    ],
    "edges": [
      {"id": "<src>-<tgt>", "source": "<src>", "target": "<tgt>", "animated": true}
    ]
  },
  "workflow_name": "<slug>",
  "description": "<one sentence>",
  "intent": "<original intent echo>"
}

Layout rules for canvas_json positions:
- Place nodes horizontally: x = index * 280, y = 100
- Group parallel nodes vertically: y offset by 160 each

Scheduling rules:
- If the intent implies recurring/periodic execution (e.g. "every morning", "daily", "every Monday", "weekly"), set "schedule" on the FIRST/trigger node using a valid 5-field UTC cron expression (e.g. "0 9 * * 1-5" for weekdays at 9am UTC).
- For on-demand workflows with no time-based trigger, leave "schedule": null on all nodes.
- Only one node should have a non-null schedule (the entry/trigger node).

Available tools for agents: web_search, github_api, http_request, file_reader, telegram_send, scheduler
Set "tools" to a list of tool names the agent will need. Empty list for agents that only reason/summarize.
"""


def _build_canvas_from_graph(
    graph_json: dict[str, Any],
    workflow_name: str,
    intent: str,
    description: str,
) -> dict[str, Any]:
    nodes = graph_json.get("nodes", [])
    edges = graph_json.get("edges", [])

    canvas_nodes = [
        {
            "id": n["id"],
            "type": "agentNode",
            "position": {"x": i * 280, "y": 100},
            "data": {
                "label": n["id"],
                "role": n.get("system_prompt", "")[:60],
                "layer": "ops",
                "status": "idle",
                "tools": n.get("tools", []),
                "model": n.get("model_name", "claude-sonnet-4-5"),
            },
        }
        for i, n in enumerate(nodes)
    ]

    canvas_edges = [
        {
            "id": f"{e['source']}-{e['target']}",
            "source": e["source"],
            "target": e["target"],
            "animated": True,
        }
        for e in edges
    ]

    return {"nodes": canvas_nodes, "edges": canvas_edges}


class BuilderAgent(GenesisAgent):
    def __init__(self, config: AgentConfig | None = None) -> None:
        super().__init__(config or AgentConfig(name="builder", role="workflow builder"))

    async def execute(self, state: GenesisState) -> dict[str, Any]:
        build_id = state["build_id"]
        iteration = (state.get("iteration_count") or 0) + 1
        critic_feedback = state.get("critic_feedback") or []

        await self._publish_build_progress(
            build_id, "builder_started", f"iteration {iteration}"
        )

        feedback_section = ""
        if critic_feedback:
            feedback_section = (
                f"\n\nCritic feedback from previous iteration:\n"
                + "\n".join(f"- {fb}" for fb in critic_feedback)
                + "\n\nAddress all feedback points in this revision."
            )

        user_prompt = (
            f"Original intent: {state['intent']}\n\n"
            f"Architect design:\n{json.dumps(state.get('architect_output') or {}, indent=2)}\n\n"
            f"Task decomposition:\n{json.dumps(state.get('decomposer_output') or {}, indent=2)}"
            f"{feedback_section}"
        )

        raw = await self._call_llm(system_prompt=_SYSTEM_PROMPT, user_prompt=user_prompt)

        try:
            output = json.loads(raw)
        except json.JSONDecodeError:
            import re
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            output = json.loads(m.group()) if m else {"raw": raw}

        # Publish canvas update so the frontend reacts in real-time
        canvas = output.get("canvas_json") or _build_canvas_from_graph(
            output.get("graph_json", {}),
            output.get("workflow_name", "workflow"),
            state["intent"],
            output.get("description", ""),
        )

        try:
            await redis_client.publish(
                CANVAS_UPDATES,
                {
                    "event": "canvas_update",
                    "build_id": build_id,
                    "canvas_json": canvas,
                },
            )
        except Exception as exc:
            self.logger.warning("Canvas publish failed: %s", exc)

        await self._publish_message(build_id, json.dumps(output, indent=2), "critic")
        await self._publish_build_progress(
            build_id,
            "builder_done",
            f"iteration {iteration} built",
            {"builder_output": output},
        )

        return {
            "builder_output": output,
            "iteration_count": iteration,
            "status": "critiquing",
        }
