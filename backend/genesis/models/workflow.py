import enum
from typing import TYPE_CHECKING

from sqlalchemy import Enum, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship

from genesis.models.base import Base

if TYPE_CHECKING:
    from genesis.models.agent import Agent
    from genesis.models.run import Run


class WorkflowStatus(str, enum.Enum):
    draft = "draft"
    building = "building"
    validating = "validating"
    active = "active"
    paused = "paused"
    failed = "failed"
    awaiting_approval = "awaiting_approval"


class Workflow(Base):
    __tablename__ = "workflows"

    name: Mapped[str] = mapped_column(nullable=False)
    description: Mapped[str] = mapped_column(Text, nullable=False, default="")
    intent: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[WorkflowStatus] = mapped_column(
        Enum(WorkflowStatus, name="workflowstatus"),
        nullable=False,
        default=WorkflowStatus.draft,
    )
    graph_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    canvas_json: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    template_name: Mapped[str | None] = mapped_column(nullable=True)
    schedule_expr: Mapped[str | None] = mapped_column(String, nullable=True)

    agents: Mapped[list["Agent"]] = relationship(
        "Agent",
        back_populates="workflow",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
    runs: Mapped[list["Run"]] = relationship(
        "Run",
        back_populates="workflow",
        cascade="all, delete-orphan",
        lazy="selectin",
    )
