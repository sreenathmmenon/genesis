from __future__ import annotations

import json
from typing import Any

from genesis.agents.base import AgentConfig, GenesisAgent
from genesis.agents.state import GenesisState

_SYSTEM_PROMPT = """\
You are the Decomposer Agent in the Genesis AI orchestration platform.

Given an architect's high-level workflow design, decompose it into concrete, executable tasks.

Output ONLY valid JSON matching this schema — no markdown, no commentary:
{
  "tasks": [
    {
      "agent_name": "<matches architect agent name>",
      "task_id": "<short_snake_case>",
      "description": "<what this agent must do>",
      "input_schema": {"field": "type"},
      "output_schema": {"field": "type"},
      "system_prompt": "<full system prompt for this operational agent>",
      "dependencies": ["<task_id>"],
      "estimated_tokens": 2000,
      "schedule": "<cron expression or null>"
    }
  ],
  "data_flow": [
    {"from_task": "<task_id>", "to_task": "<task_id>", "field_mapping": {"out_field": "in_field"}}
  ],
  "entry_task": "<task_id>",
  "exit_task": "<task_id>"
}

Rules:
- Write complete, production-quality system prompts for each agent.
- system_prompt must include: the agent's purpose, expected input format, output format, and any constraints.
- estimated_tokens should be realistic (1000-8000 range).
- schedule follows standard 5-part cron syntax (null if event-driven).
"""


class DecomposerAgent(GenesisAgent):
    def __init__(self, config: AgentConfig | None = None) -> None:
        super().__init__(config or AgentConfig(name="decomposer", role="task decomposer"))

    async def execute(self, state: GenesisState) -> dict[str, Any]:
        build_id = state["build_id"]
        architect_output = state.get("architect_output") or {}

        await self._publish_build_progress(build_id, "decomposer_started")

        user_prompt = (
            f"Original intent: {state['intent']}\n\n"
            f"Architect design:\n{json.dumps(architect_output, indent=2)}\n\n"
            "Decompose into concrete tasks for each agent."
        )

        raw = await self._call_llm(system_prompt=_SYSTEM_PROMPT, user_prompt=user_prompt)

        try:
            output = self.parse_json_response(raw)
        except ValueError as exc:
            self.logger.error("Decomposer JSON parse failed: %s\nRaw (first 800): %s", exc, raw[:800])
            raise

        await self._publish_message(build_id, json.dumps(output, indent=2), "builder")
        await self._publish_build_progress(
            build_id,
            "decomposer_done",
            f"{len(output.get('tasks', []))} tasks defined",
            {"decomposer_output": output},
        )

        return {"decomposer_output": output, "status": "building"}
