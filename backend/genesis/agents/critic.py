from __future__ import annotations

import json
from typing import Any

from genesis.agents.base import AgentConfig, GenesisAgent
from genesis.agents.state import GenesisState

_SYSTEM_PROMPT = """\
You are the Critic Agent in the Genesis AI orchestration platform.

Review a proposed multi-agent workflow and decide whether it is ready to deploy.

Output ONLY valid JSON — no markdown, no commentary:
{
  "approved": true | false,
  "score": 0-100,
  "feedback": [
    "<specific actionable improvement>"
  ],
  "strengths": [
    "<what is good>"
  ],
  "risks": [
    "<potential failure mode>"
  ],
  "verdict": "<one sentence summary>"
}

Approval criteria (ALL must pass to approve):
1. Each agent has a clear, non-overlapping responsibility.
2. System prompts are complete and actionable (not vague placeholders).
3. Data flows between agents are coherent — outputs match downstream inputs.
4. A reporting agent exists that delivers results to the user.
5. No circular dependencies in the edge graph.
6. Model choices are appropriate (powerful model for reasoning, lightweight for simple tasks).
7. Memory types are justified (long_term only where persistence is genuinely needed).

Set approved=true only when score >= 80 and all criteria pass.
"""


class CriticAgent(GenesisAgent):
    def __init__(self, config: AgentConfig | None = None) -> None:
        super().__init__(config or AgentConfig(name="critic", role="quality critic"))

    async def execute(self, state: GenesisState) -> dict[str, Any]:
        build_id = state["build_id"]
        iteration = state.get("iteration_count") or 1

        await self._publish_build_progress(
            build_id, "critic_started", f"reviewing iteration {iteration}"
        )

        user_prompt = (
            f"Original intent: {state['intent']}\n\n"
            f"Workflow to review:\n{json.dumps(state.get('builder_output') or {}, indent=2)}\n\n"
            f"This is iteration {iteration} of up to 3."
        )

        raw = await self._call_llm(system_prompt=_SYSTEM_PROMPT, user_prompt=user_prompt)

        try:
            review = self.parse_json_response(raw)
        except ValueError:
            review = {"approved": False, "feedback": [raw[:500]]}

        approved: bool = bool(review.get("approved", False))
        feedback: list = review.get("feedback", [])
        score: int = review.get("score", 0)

        await self._publish_message(
            build_id,
            f"Score: {score}/100 | Approved: {approved}\n" + "\n".join(f"• {f}" for f in feedback),
            "builder" if not approved else "validator",
        )
        await self._publish_build_progress(
            build_id,
            "critic_done",
            f"score={score} approved={approved}",
            {"critic_feedback": review},
        )

        return {
            "critic_feedback": feedback,
            "critic_approved": approved,
            "status": "validating" if approved else "building",
        }
