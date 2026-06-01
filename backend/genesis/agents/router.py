from __future__ import annotations

from typing import Any, Literal

from genesis.agents.base import AgentConfig, GenesisAgent

Lane = Literal["ANSWER", "CONVERSE", "RETRIEVE", "AUTOMATE", "CLARIFY"]

# Below this confidence, we force a CLARIFY regardless of the proposed lane —
# better to ask one question than to execute the wrong shape of work.
_CONFIDENCE_FLOOR = 0.6

_SYSTEM_PROMPT = """\
You are the Intent Router for the Genesis AI agent platform. Your only job is to
classify what SHAPE of work a user's request is, so the platform can handle it
correctly. You do NOT answer the request — you classify it.

Output ONLY valid JSON matching this schema — no markdown, no commentary:
{
  "lane": "ANSWER | CONVERSE | RETRIEVE | AUTOMATE | CLARIFY",
  "confidence": 0.0-1.0,
  "reasoning": "<one short sentence explaining the choice>",
  "params": {
    "needs_live_data": true | false,
    "is_recurring": true | false,
    "suggested_clarifying_question": "<question, ONLY when lane is CLARIFY, else empty>"
  }
}

The lanes:

- ANSWER — a one-shot task the system can complete in a single pass and return
  the result immediately. The user wants an answer, not a deployed system.
  Examples: "write a 100-word essay on X", "summarize this", "explain Y",
  "draft an email", "translate this", "calculate Z".
  Signals: write, summarize, explain, draft, translate, calculate, generate.
  is_recurring=false. needs_live_data is usually false.

- CONVERSE — the request is open-ended, advisory, or under-specified, and the
  system should ASK clarifying questions and hold a dialogue before answering.
  Examples: "help me figure out my biggest problem", "advise me on hiring",
  "coach me through X", anything vague that needs scoping first.
  Signals: diagnose, advise, help me, coach, figure out, what should I.

- RETRIEVE — the request needs CURRENT/LIVE external data fetched right now.
  Examples: "latest news on X", "current price of Y", "what's trending today".
  Signals: latest, current, now, today's, price of, news about, trending.
  needs_live_data=true.

- AUTOMATE — the user wants a recurring, scheduled, or always-on system: a
  monitor, a watcher, a daily/weekly job, or an alert. This is the only lane
  that produces a durable deployed workflow.
  Examples: "every morning send me X", "alert me when Y drops 5%",
  "monitor Z daily", "track my competitors weekly".
  Signals: every, daily, weekly, hourly, monitor, watch, track, alert me when,
  on a schedule, recurring. is_recurring=true.

- CLARIFY — use ONLY when you genuinely cannot tell which lane applies. Provide
  a single, specific suggested_clarifying_question. Prefer a real lane when you
  can; CLARIFY is a fallback, not a default.

Decision rules:
- If the request is recurring/scheduled in any way → AUTOMATE.
- If it explicitly needs fresh/live data → RETRIEVE.
- If it is vague, advisory, or needs scoping → CONVERSE.
- If it is a concrete one-shot deliverable → ANSWER.
- Set confidence honestly. If you are unsure between lanes, lower the confidence.
"""


class RouterAgent(GenesisAgent):
    """Classifies a raw user intent into an execution lane before any work runs."""

    def __init__(self, config: AgentConfig | None = None) -> None:
        super().__init__(
            config
            or AgentConfig(
                name="router",
                role="intent classifier",
                # Cheap + fast — this runs on every single inbound intent.
                model_name="claude-haiku-4-5-20251001",
                temperature=0.0,
                max_tokens=512,
            )
        )

    async def classify(self, intent: str) -> dict[str, Any]:
        """Return a normalized routing decision for an intent.

        Always returns a valid dict — on any failure it falls back to CLARIFY so
        the caller never has to handle an exception path for routing.
        """
        try:
            raw = await self._call_llm(
                system_prompt=_SYSTEM_PROMPT,
                user_prompt=f"Classify this user request:\n\n{intent}",
            )
            decision = self.parse_json_response(raw)
        except Exception as exc:  # noqa: BLE001 — routing must never hard-fail
            self.logger.warning("Router classification failed, defaulting to CLARIFY: %s", exc)
            return self._fallback(intent)

        return self._normalize(decision, intent)

    def _normalize(self, decision: dict[str, Any], intent: str) -> dict[str, Any]:
        lane = str(decision.get("lane", "")).strip().upper()
        valid: tuple[str, ...] = ("ANSWER", "CONVERSE", "RETRIEVE", "AUTOMATE", "CLARIFY")
        if lane not in valid:
            self.logger.warning("Router returned unknown lane %r — defaulting to CLARIFY", lane)
            return self._fallback(intent)

        try:
            confidence = float(decision.get("confidence", 0.0))
        except (TypeError, ValueError):
            confidence = 0.0
        confidence = max(0.0, min(1.0, confidence))

        params = decision.get("params") or {}
        if not isinstance(params, dict):
            params = {}

        # Low-confidence guard: ask rather than execute the wrong shape.
        if confidence < _CONFIDENCE_FLOOR and lane != "CLARIFY":
            self.logger.info(
                "Router confidence %.2f below floor for lane %s — forcing CLARIFY", confidence, lane
            )
            question = params.get("suggested_clarifying_question") or (
                "Could you clarify what you'd like me to do — answer this once, "
                "or set it up to run on a schedule?"
            )
            return {
                "lane": "CLARIFY",
                "confidence": confidence,
                "reasoning": f"Low confidence ({confidence:.2f}); asking before acting.",
                "params": {
                    "needs_live_data": bool(params.get("needs_live_data", False)),
                    "is_recurring": bool(params.get("is_recurring", False)),
                    "suggested_clarifying_question": question,
                },
            }

        return {
            "lane": lane,
            "confidence": confidence,
            "reasoning": str(decision.get("reasoning", "")).strip()[:200],
            "params": {
                "needs_live_data": bool(params.get("needs_live_data", False)),
                "is_recurring": bool(params.get("is_recurring", False)),
                "suggested_clarifying_question": str(
                    params.get("suggested_clarifying_question", "")
                ).strip(),
            },
        }

    @staticmethod
    def _fallback(intent: str) -> dict[str, Any]:
        return {
            "lane": "CLARIFY",
            "confidence": 0.0,
            "reasoning": "Could not classify the request automatically.",
            "params": {
                "needs_live_data": False,
                "is_recurring": False,
                "suggested_clarifying_question": (
                    "Could you tell me a bit more about what you'd like — "
                    "a one-time answer, or something that runs on a schedule?"
                ),
            },
        }


# Module-level singleton — routing is stateless.
router_agent = RouterAgent()
