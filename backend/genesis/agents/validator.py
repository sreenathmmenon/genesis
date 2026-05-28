from __future__ import annotations

import json
from typing import Any

from genesis.agents.base import AgentConfig, GenesisAgent
from genesis.agents.state import GenesisState

_SYSTEM_PROMPT = """\
You are the Validator Agent in the Genesis AI orchestration platform.

Perform a final safety and correctness check on the approved workflow before deployment.

Output ONLY valid JSON — no markdown, no commentary:
{
  "validation_passed": true | false,
  "safety_checks": {
    "no_destructive_actions": true | false,
    "rate_limits_set": true | false,
    "error_handling_present": true | false,
    "pii_handling_appropriate": true | false
  },
  "estimated_monthly_cost_usd": 0.00,
  "estimated_tokens_per_run": 0,
  "deployment_ready": true | false,
  "blocking_issues": ["<issue>"],
  "warnings": ["<warning>"],
  "approval_message": "<message to send to user via Telegram for final approval>"
}

Safety rules (any violation → deployment_ready=false):
- No agent may delete files, drop databases, or modify production infrastructure without human approval.
- All external HTTP calls must have timeouts defined in the system prompt.
- Agents handling PII must be noted.
- Rate limits must be mentioned in guardrails or system prompts.

Cost estimation: assume $0.009 per 1K tokens (blended rate).
"""

_TELEGRAM_APPROVAL_TEMPLATE = """\
🔮 Genesis Workflow Ready for Review

{workflow_name}
{description}

📊 Validation Report
• Safety checks: {safety_summary}
• Est. tokens/run: {tokens_per_run}
• Est. monthly cost: ${monthly_cost}

{warnings_section}Do you want to deploy this workflow?
"""


class ValidatorAgent(GenesisAgent):
    def __init__(self, config: AgentConfig | None = None) -> None:
        super().__init__(config or AgentConfig(name="validator", role="validator"))

    async def execute(self, state: GenesisState) -> dict[str, Any]:
        build_id = state["build_id"]
        builder_output = state.get("builder_output") or {}

        await self._publish_build_progress(build_id, "validator_started")

        user_prompt = (
            f"Original intent: {state['intent']}\n\n"
            f"Final workflow to validate:\n{json.dumps(builder_output, indent=2)}"
        )

        raw = await self._call_llm(system_prompt=_SYSTEM_PROMPT, user_prompt=user_prompt)

        try:
            report = json.loads(raw)
        except json.JSONDecodeError:
            import re
            m = re.search(r"\{.*\}", raw, re.DOTALL)
            report = json.loads(m.group()) if m else {
                "validation_passed": False,
                "deployment_ready": False,
                "blocking_issues": [raw],
            }

        safety = report.get("safety_checks", {})
        safety_summary = "✅ All passed" if all(safety.values()) else "⚠️ Issues found"
        warnings = report.get("warnings", [])
        warnings_section = (
            "⚠️ Warnings\n" + "\n".join(f"• {w}" for w in warnings) + "\n\n"
            if warnings
            else ""
        )

        tokens_per_run = report.get("estimated_tokens_per_run", 0)
        monthly_cost = report.get("estimated_monthly_cost_usd", 0.0)

        approval_msg = _TELEGRAM_APPROVAL_TEMPLATE.format(
            workflow_name=builder_output.get("workflow_name", "Unnamed Workflow"),
            description=builder_output.get("description", ""),
            safety_summary=safety_summary,
            tokens_per_run=f"{tokens_per_run:,}" if isinstance(tokens_per_run, int) else str(tokens_per_run),
            monthly_cost=f"{monthly_cost:.2f}" if isinstance(monthly_cost, float) else str(monthly_cost),
            warnings_section=warnings_section,
        )

        # Send Telegram approval request
        await self._send_telegram_approval(build_id, approval_msg)

        await self._publish_message(build_id, approval_msg, "user")
        await self._publish_build_progress(
            build_id,
            "validator_done",
            "awaiting_approval",
            {"validator_report": report},
        )

        return {
            "validator_report": report,
            "status": "awaiting_approval",
        }

    async def _send_telegram_approval(self, build_id: str, message: str) -> None:
        try:
            from genesis.channels.telegram import telegram_bridge
            await telegram_bridge.send_approval_request(build_id, message)
        except Exception as exc:
            self.logger.warning("Telegram approval send failed: %s", exc)
