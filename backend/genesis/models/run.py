import enum
import uuid
from datetime import datetime
from typing import TYPE_CHECKING

from sqlalchemy import Boolean, DateTime, Enum, ForeignKey, Integer, Numeric, Text, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from genesis.models.base import Base

if TYPE_CHECKING:
    from genesis.models.workflow import Workflow


class RunStatus(str, enum.Enum):
    running = "running"
    completed = "completed"
    failed = "failed"
    cancelled = "cancelled"


class MessageType(str, enum.Enum):
    state_update = "state_update"
    tool_call = "tool_call"
    tool_result = "tool_result"
    human_input = "human_input"
    agent_output = "agent_output"


class Run(Base):
    __tablename__ = "runs"

    workflow_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workflows.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    status: Mapped[RunStatus] = mapped_column(
        Enum(RunStatus, name="runstatus"),
        nullable=False,
        default=RunStatus.running,
    )
    started_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )
    completed_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True),
        nullable=True,
    )
    error: Mapped[str | None] = mapped_column(Text, nullable=True)
    token_count_total: Mapped[int] = mapped_column(Integer, nullable=False, default=0)
    estimated_cost_usd: Mapped[float] = mapped_column(Numeric(10, 6), nullable=False, default=0.0)
    repair_attempted: Mapped[bool] = mapped_column(Boolean, nullable=False, default=False)

    workflow: Mapped["Workflow"] = relationship("Workflow", back_populates="runs")
    messages: Mapped[list["Message"]] = relationship(
        "Message",
        back_populates="run",
        cascade="all, delete-orphan",
        lazy="selectin",
        order_by="Message.timestamp",
    )


class Message(Base):
    __tablename__ = "messages"

    run_id: Mapped[uuid.UUID] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("runs.id", ondelete="CASCADE"),
        nullable=False,
        index=True,
    )
    sender_agent: Mapped[str] = mapped_column(nullable=False)
    receiver_agent: Mapped[str] = mapped_column(nullable=False)
    content: Mapped[str] = mapped_column(Text, nullable=False)
    message_type: Mapped[MessageType] = mapped_column(
        Enum(MessageType, name="messagetype"),
        nullable=False,
    )
    timestamp: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        server_default=func.now(),
        nullable=False,
    )

    run: Mapped["Run"] = relationship("Run", back_populates="messages")
