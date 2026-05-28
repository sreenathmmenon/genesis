from __future__ import annotations

from typing import Annotated, Any, Optional, TypedDict

from langgraph.graph.message import add_messages


class GenesisState(TypedDict):
    """State for the Genesis meta-agent pipeline (build phase)."""

    intent: str
    build_id: str
    status: str

    architect_output: Optional[dict[str, Any]]
    decomposer_output: Optional[dict[str, Any]]
    builder_output: Optional[dict[str, Any]]
    critic_feedback: Optional[list[dict[str, Any]]]

    critic_approved: bool
    iteration_count: int

    validator_report: Optional[dict[str, Any]]
    workflow_id: Optional[str]

    error: Optional[str]
    messages: Annotated[list, add_messages]


class WorkflowState(TypedDict):
    """State for a deployed operational workflow run."""

    workflow_id: str
    run_id: str
    input_data: dict[str, Any]

    intermediate_results: Annotated[dict[str, Any], lambda x, y: {**x, **y}]
    final_output: Optional[dict[str, Any]]

    error: Optional[str]
    messages: Annotated[list, add_messages]
