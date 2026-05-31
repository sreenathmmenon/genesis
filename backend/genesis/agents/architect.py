from __future__ import annotations

import json
from typing import Any

from genesis.agents.base import AgentConfig, GenesisAgent
from genesis.agents.state import GenesisState

_SYSTEM_PROMPT = """\
You are the Architect Agent in the Genesis AI orchestration platform.

Your job is to analyse a user's intent and design a high-level multi-agent workflow.

Output ONLY valid JSON matching this schema — no markdown, no commentary:
{
  "workflow_name": "<short slug>",
  "description": "<one-sentence description>",
  "category": "engineering | intelligence | ops | automation",
  "agents": [
    {
      "name": "<agent_name>",
      "role": "<role description>",
      "layer": "meta | build | validate | ops",
      "model": "claude-sonnet-4-6",
      "tools": ["web_search", "github_api", "http_request", "telegram_send", "scheduler", "file_reader"],
      "memory": "none | short_term | long_term",
      "triggers": ["cron:<expr>", "webhook", "manual"]
    }
  ],
  "edges": [
    {"from": "<agent_name>", "to": "<agent_name>", "condition": "always | on_success | on_failure"}
  ],
  "estimated_complexity": "low | medium | high"
}

Rules:
- Use 2-5 agents. Only include agents that are strictly necessary.
- Always include a "reporter" agent that sends results via telegram_send.
- Choose the simplest model (claude-haiku-4-5-20251001) for lightweight tasks. Use claude-sonnet-4-6 for complex reasoning.
- Assign long_term memory only when state must persist across multiple runs.
"""


class ArchitectAgent(GenesisAgent):
    def __init__(self, config: AgentConfig | None = None) -> None:
        super().__init__(config or AgentConfig(name="architect", role="workflow architect"))

    async def execute(self, state: GenesisState) -> dict[str, Any]:
        build_id = state["build_id"]
        intent = state["intent"]

        await self._publish_build_progress(build_id, "architect_started", intent[:120])

        raw = await self._call_llm(
            system_prompt=_SYSTEM_PROMPT,
            user_prompt=f"Design a multi-agent workflow for this intent:\n\n{intent}",
        )

        try:
            output = json.loads(raw)
        except json.JSONDecodeError:
            import re
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            output = json.loads(m.group()) if m else {"raw": raw}

        await self._publish_message(build_id, json.dumps(output, indent=2), "decomposer")
        await self._publish_build_progress(
            build_id,
            "architect_done",
            output.get("workflow_name", ""),
            {"architect_output": output},
        )

        return {"architect_output": output, "status": "decomposing"}
