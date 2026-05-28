from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any


class ChannelBridge(ABC):
    """Abstract base for all external communication channels."""

    @abstractmethod
    async def setup(self) -> None:
        """Initialise the channel (connect, register handlers, etc.)."""

    @abstractmethod
    async def teardown(self) -> None:
        """Gracefully disconnect and clean up resources."""

    @abstractmethod
    async def send_message(self, text: str, **kwargs: Any) -> None:
        """Send a plain text message to the channel."""

    @abstractmethod
    async def send_approval_request(self, build_id: str, message: str) -> None:
        """Send an interactive approval request for a Genesis build."""
