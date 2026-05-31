from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field
from typing import Any

from langchain_core.language_models import BaseChatModel
from langchain_core.messages import HumanMessage, SystemMessage

from genesis.utils.logger import get_logger
from genesis.utils.model_router import get_llm
from genesis.utils.redis_client import AGENT_MESSAGES, BUILD_PROGRESS, redis_client


@dataclass
class AgentConfig:
    name: str
    role: str
    model_name: str = "claude-sonnet-4-6"
    temperature: float = 0.1
    max_tokens: int = 8096
    max_iterations: int = 10
    tools: list[str] = field(default_factory=list)


class GenesisAgent:
    """Base class for all Genesis meta-agents."""

    def __init__(self, config: AgentConfig) -> None:
        self.config = config
        self.logger = get_logger(f"genesis.agent.{config.name}")
        self._llm: BaseChatModel | None = None

    @property
    def llm(self) -> BaseChatModel:
        if self._llm is None:
            self._llm = get_llm(self.config.model_name, self.config.temperature)
        return self._llm

    async def execute(self, state: dict[str, Any]) -> dict[str, Any]:
        raise NotImplementedError

    async def _call_llm(self, system_prompt: str, user_prompt: str) -> str:
        messages = [
            SystemMessage(content=system_prompt),
            HumanMessage(content=user_prompt),
        ]
        self._check_guardrails(user_prompt)
        t0 = time.monotonic()
        response = await self.llm.ainvoke(messages)
        elapsed = time.monotonic() - t0
        self.logger.debug(
            "LLM call completed in %.2fs, tokens used: %s",
            elapsed,
            getattr(response, "usage_metadata", {}).get("total_tokens", "?"),
        )
        return str(response.content)

    def _check_guardrails(self, prompt: str) -> None:
        if len(prompt) > self.config.max_tokens * 4:
            raise ValueError(
                f"Prompt exceeds token budget for agent '{self.config.name}'"
            )

    async def _publish_message(
        self,
        build_id: str,
        content: str,
        receiver: str = "orchestrator",
        message_type: str = "agent_output",
    ) -> None:
        try:
            await redis_client.publish(
                AGENT_MESSAGES,
                {
                    "id": str(uuid.uuid4()),
                    "build_id": build_id,
                    "sender_agent": self.config.name,
                    "receiver_agent": receiver,
                    "content": content,
                    "message_type": message_type,
                },
            )
        except Exception as exc:
            self.logger.warning("Failed to publish agent message: %s", exc)

    async def _publish_build_progress(
        self,
        build_id: str,
        status: str,
        detail: str = "",
        payload: dict[str, Any] | None = None,
    ) -> None:
        try:
            await redis_client.publish(
                BUILD_PROGRESS,
                {
                    "build_id": build_id,
                    "agent": self.config.name,
                    "status": status,
                    "detail": detail,
                    **(payload or {}),
                },
            )
        except Exception as exc:
            self.logger.warning("Failed to publish build progress: %s", exc)
