from __future__ import annotations

from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from genesis.utils.logger import get_logger
from genesis.utils.model_router import ainvoke_with_fallback, get_llm

logger = get_logger("genesis.oneshot")

# A one-shot answer is a single LLM pass — no graph, no deploy, no schedule.
# It optionally uses a couple of read-only tools when the task needs them, but
# the default is a direct, immediate answer returned to the caller's channel.
_DEFAULT_MODEL = "claude-sonnet-4-6"
_MAX_TOKENS = 4096

_SYSTEM_PROMPT = """\
You are a capable assistant completing a single, self-contained task for the user.

Rules:
- Produce a complete, polished, final answer in ONE response. There is no second
  pass and nothing is deployed — this is a one-shot task.
- Be direct. Lead with the answer; do not narrate your process or say things like
  "here is what I will do".
- Respect any constraints in the request (word counts, format, tone) exactly.
- If you genuinely cannot complete the task (e.g. it needs live data you do not
  have, or it is too ambiguous), say so plainly and briefly — do NOT fabricate
  facts, figures, dates, or sources.
- Format for a chat/messaging surface: clear, readable plain text. Avoid heavy
  markdown unless it materially helps.
"""


async def run_oneshot(intent: str, model_name: str = _DEFAULT_MODEL) -> dict[str, Any]:
    """Execute an ANSWER-lane request: a single LLM pass that returns the result.

    Returns {"answer": str, "model": str, "tokens": int} and never raises — on
    failure it returns an honest error message as the answer.
    """
    lm = get_llm(model_name, temperature=0.3, max_tokens=_MAX_TOKENS)
    messages = [
        SystemMessage(content=_SYSTEM_PROMPT),
        HumanMessage(content=intent),
    ]
    try:
        response = await ainvoke_with_fallback(lm, messages, model_name, _MAX_TOKENS)
        answer = str(response.content).strip()
        tokens = int(getattr(response, "usage_metadata", {}).get("total_tokens", 0) or 0)
        if not tokens:
            tokens = len(answer) // 4
        logger.info("One-shot answer produced (%d chars, ~%d tokens)", len(answer), tokens)
        return {"answer": answer, "model": model_name, "tokens": tokens}
    except Exception as exc:  # noqa: BLE001 — one-shot must return, not raise
        logger.error("One-shot execution failed: %s", exc)
        return {
            "answer": (
                "I wasn't able to complete that just now due to a temporary issue. "
                "Please try again in a moment."
            ),
            "model": model_name,
            "tokens": 0,
            "error": str(exc),
        }
