import uuid
from datetime import datetime
from typing import Any

from pydantic import BaseModel, Field

from genesis.models.agent import MemoryType
from genesis.models.genesis_build import BuildStatus
from genesis.models.run import MessageType, RunStatus
from genesis.models.workflow import WorkflowStatus


# ── Agent ─────────────────────────────────────────────────────────────────────

class AgentCreate(BaseModel):
    name: str
    role: str
    system_prompt: str = ""
    model_name: str = "claude-sonnet-4-5"
    tools: list[Any] = Field(default_factory=list)
    memory_type: MemoryType = MemoryType.none
    schedule: str | None = None
    guardrails: dict[str, Any] = Field(default_factory=dict)
    interaction_rules: dict[str, Any] = Field(default_factory=dict)
    channel: str = "telegram"
    workflow_id: uuid.UUID | None = None


class AgentRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    role: str
    system_prompt: str
    model_name: str
    tools: list[Any]
    memory_type: MemoryType
    schedule: str | None
    guardrails: dict[str, Any]
    interaction_rules: dict[str, Any]
    channel: str
    workflow_id: uuid.UUID | None
    deleted_at: datetime | None
    created_at: datetime
    updated_at: datetime


class AgentUpdate(BaseModel):
    name: str | None = None
    role: str | None = None
    system_prompt: str | None = None
    model_name: str | None = None
    tools: list[Any] | None = None
    memory_type: MemoryType | None = None
    schedule: str | None = None
    guardrails: dict[str, Any] | None = None
    interaction_rules: dict[str, Any] | None = None
    channel: str | None = None


# ── Workflow ───────────────────────────────────────────────────────────────────

class WorkflowCreate(BaseModel):
    name: str
    description: str = ""
    intent: str
    template_name: str | None = None


class WorkflowRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    name: str
    description: str
    intent: str
    status: WorkflowStatus
    graph_json: dict[str, Any] | None
    canvas_json: dict[str, Any] | None
    template_name: str | None
    schedule_expr: str | None
    agents: list[AgentRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


class WorkflowUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    status: WorkflowStatus | None = None
    graph_json: dict[str, Any] | None = None
    canvas_json: dict[str, Any] | None = None
    schedule_expr: str | None = None


# ── Run + Message ──────────────────────────────────────────────────────────────

class MessageRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    run_id: uuid.UUID
    sender_agent: str
    receiver_agent: str
    content: str
    message_type: MessageType
    timestamp: datetime


class RunRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    workflow_id: uuid.UUID
    status: RunStatus
    started_at: datetime
    completed_at: datetime | None
    error: str | None
    token_count_total: int
    estimated_cost_usd: float
    messages: list[MessageRead] = Field(default_factory=list)
    created_at: datetime
    updated_at: datetime


# ── GenesisBuild ───────────────────────────────────────────────────────────────

class GenesisBuildCreate(BaseModel):
    intent: str


class GenesisBuildRead(BaseModel):
    model_config = {"from_attributes": True}

    id: uuid.UUID
    intent: str
    status: BuildStatus
    architect_output: dict[str, Any] | None
    decomposer_output: dict[str, Any] | None
    builder_output: dict[str, Any] | None
    critic_feedback: dict[str, Any] | None
    validator_report: dict[str, Any] | None
    workflow_id: uuid.UUID | None
    iterations: int
    created_at: datetime
    updated_at: datetime


# ── Utility schemas ────────────────────────────────────────────────────────────

class IntentRequest(BaseModel):
    intent: str = Field(..., max_length=500)


class HealthResponse(BaseModel):
    status: str
    db: str
    redis: str
    version: str
