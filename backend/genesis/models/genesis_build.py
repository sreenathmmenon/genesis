import enum
import uuid
from typing import TYPE_CHECKING

from sqlalchemy import Enum, ForeignKey, Integer, Text
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from genesis.models.base import Base

if TYPE_CHECKING:
    from genesis.models.workflow import Workflow


class BuildStatus(str, enum.Enum):
    decomposing = "decomposing"
    building = "building"
    critiquing = "critiquing"
    validating = "validating"
    awaiting_approval = "awaiting_approval"
    deployed = "deployed"
    failed = "failed"


class GenesisBuild(Base):
    __tablename__ = "genesis_builds"

    intent: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[BuildStatus] = mapped_column(
        Enum(BuildStatus, name="buildstatus"),
        nullable=False,
        default=BuildStatus.decomposing,
    )
    architect_output: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    decomposer_output: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    builder_output: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    critic_feedback: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    validator_report: Mapped[dict | None] = mapped_column(JSONB, nullable=True)
    workflow_id: Mapped[uuid.UUID | None] = mapped_column(
        UUID(as_uuid=True),
        ForeignKey("workflows.id", ondelete="SET NULL"),
        nullable=True,
        index=True,
    )
    iterations: Mapped[int] = mapped_column(Integer, nullable=False, default=0)

    workflow: Mapped["Workflow | None"] = relationship("Workflow")
