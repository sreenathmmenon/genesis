import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import DateTime, Enum, ForeignKey, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from genesis.models.base import Base

if TYPE_CHECKING:
    from genesis.models.workflow import Workflow


class MemoryType(str, enum.Enum):
    none = "none"
    short_term = "short_term"
    long_term = "long_term"


_DEFAULT_GUARDRAILS: dict = {
    "max_tokens": 4096,
    "max_iterations": 10,
    "allow_web_search": False,
    "allow_code_execution": False,
    "require_human_approval": False,
}

_DEFAULT_INTERACTION_RULES: dict = {
    "can_spawn_agents": False,
    "can_modify_workflow": False,
    "report_to": [],
}


class Agent(Base):
    __tablename__ = "agents"

    name: Mapped[str] = mapped_column(nullable=False)
    role: Mapped[str] = mapped_column(nullable=False)
    system_prompt: Mapped[str] = mapped_column(Text, nullable=False, default="")
    model_name: Mapped[str] = mapped_column(nullable=False, default="claude-sonnet-4-6")
    tools: Mapped[list] = mapped_column(JSONB, nullable=False, default=list)
    memory_type: Mapped[MemoryType] = mapped_column(
        Enum(MemoryType, name="memorytype"),
        nullable=False,
        default=MemoryType.none,
    )
    schedule: Mapped[str | None] = mapped_column(nullable=True)
    guardrails: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: dict(_DEFAULT_GUARDRAILS),
    )
    interaction_rules: Mapped[dict] = mapped_column(
        JSONB,
        nullable=False,
        default=lambda: dict(_DEFAULT_INTERACTION_RULES),
    )
    channel: Mapped[str] = mapped_column(nullable=False, default="telegram")
    workflow_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workflows.id", ondelete="CASCADE"),
        nullable=True,
        index=True,
    )
    deleted_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )

    workflow: Mapped["Workflow | None"] = relationship(
        "Workflow",
        back_populates="agents",
    )
