"""
RepairAgent — diagnoses failed workflow runs and patches broken nodes.

Uses the existing LangChain/Anthropic stack (no new SDK needed).
Called automatically by workflow_executor on run failure.
"""
from __future__ import annotations

import json
from typing import Any

from langchain_core.messages import HumanMessage, SystemMessage

from genesis.config import settings
from genesis.utils.logger import get_logger
from genesis.utils.model_router import get_llm

logger = get_logger("genesis.repair_agent")

_REPAIR_SYSTEM_PROMPT = """You are the Genesis Repair Agent — an expert at diagnosing and fixing broken AI agent workflows.

You will be given:
1. A failed workflow node definition (id, system_prompt, tools, model_name)
2. The error message from the failure
3. Recent output from that node (if any)
4. The workflow's original intent

Your job: produce a repaired version of the node that fixes the failure.

Common failure patterns and fixes:
- "Connection error" / API timeout → the node's system_prompt is too complex, causing too many tool calls; simplify the prompt to fewer, targeted calls
- "Can't parse entities" / MarkdownV2 error → the system_prompt instructs MarkdownV2 formatting; change to plain Markdown or no formatting
- "Tool not found" → remove the missing tool from the tools list
- "Context too long" → reduce max_results or story counts in system_prompt
- LLM makes no tool calls → system_prompt is ambiguous; make it more explicit with concrete examples
- Infinite tool loop → system_prompt says "retry"; remove retry instructions, add "call each tool ONCE"

Output ONLY valid JSON with this exact structure — no explanation, no markdown fences:
{
  "node_id": "same as input node id",
  "system_prompt": "the fixed system prompt",
  "tools": ["tool1", "tool2"],
  "model_name": "same or different model",
  "repair_reason": "one sentence explaining what was wrong and what was fixed"
}"""


async def repair_node(
    node: dict[str, Any],
    error: str,
    recent_output: str,
    workflow_intent: str,
) -> dict[str, Any] | None:
    """
    Attempt to repair a failed workflow node.
    Returns the repaired node dict, or None if repair failed.
    """
    lm = get_llm(settings.repair_model or "claude-haiku-4-5-20251001")

    context = json.dumps({
        "failed_node": {
            "id": node.get("id"),
            "system_prompt": node.get("system_prompt", "")[:2000],
            "tools": node.get("tools") or [],
            "model_name": node.get("model_name"),
        },
        "error": error[:500],
        "recent_output": recent_output[:1000],
        "workflow_intent": workflow_intent[:300],
    }, indent=2)

    try:
        response = await lm.ainvoke([
            SystemMessage(content=_REPAIR_SYSTEM_PROMPT),
            HumanMessage(content=context),
        ])
        raw = str(response.content).strip()
        # Strip markdown fences if the LLM added them
        if raw.startswith("```"):
            raw = raw.split("```")[1]
            if raw.startswith("json"):
                raw = raw[4:]
        repaired = json.loads(raw)
        logger.info(
            "Repair agent fixed node '%s': %s",
            node.get("id"),
            repaired.get("repair_reason", ""),
        )
        return repaired
    except Exception as exc:
        logger.error("Repair agent failed for node '%s': %s", node.get("id"), exc)
        return None
