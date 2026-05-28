import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from genesis.database import get_db
from genesis.models import Agent, Workflow
from genesis.models.workflow import WorkflowStatus

logger = logging.getLogger(__name__)
router = APIRouter(prefix="/templates", tags=["templates"])

TEMPLATES: list[dict[str, Any]] = [
    {
        "name": "pr_guardian",
        "display_name": "PR Guardian",
        "description": "Monitors GitHub PRs for API contract changes. Blocks merges until you approve.",
        "intent": (
            "Monitor our GitHub repo. When any PR changes an API endpoint — "
            "adds, removes, or modifies parameters — detect it automatically, "
            "post a diff summary to Telegram, and block merge until I approve."
        ),
        "agent_count": 5,
        "category": "engineering",
        "agents": [
            "PR Watcher",
            "Contract Diff",
            "Risk Assessor",
            "Briefing Agent",
            "Telegram Gateway",
        ],
    },
    {
        "name": "signal_scout",
        "display_name": "Signal Scout",
        "description": "Every Monday brief on your top 3 competitors' latest moves across changelogs, jobs, and reviews.",
        "intent": (
            "Every Monday at 8am, scan my top 3 competitors' changelogs, "
            "job postings, and G2 reviews. Brief me on the 3 most important "
            "signals I should act on this week."
        ),
        "agent_count": 6,
        "category": "intelligence",
        "agents": [
            "Changelog Watcher",
            "Jobs Watcher",
            "Reviews Watcher",
            "Pattern Agent",
            "Prioritizer",
            "Briefing Agent",
        ],
    },
]

_TEMPLATE_BY_NAME = {t["name"]: t for t in TEMPLATES}


@router.get("/")
async def list_templates() -> list[dict[str, Any]]:
    return TEMPLATES


@router.post("/{template_name}/deploy")
async def deploy_template(
    template_name: str, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    tmpl = _TEMPLATE_BY_NAME.get(template_name)
    if not tmpl:
        raise HTTPException(status_code=404, detail=f"Template '{template_name}' not found")

    wf = Workflow(
        name=tmpl["display_name"],
        description=tmpl["description"],
        intent=tmpl["intent"],
        status=WorkflowStatus.active,
        template_name=template_name,
    )
    db.add(wf)
    await db.flush()

    # Create agents and build canvas layout
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    agent_names: list[str] = tmpl["agents"]

    for i, agent_name in enumerate(agent_names):
        x = i * 250
        agent = Agent(
            name=agent_name,
            role=agent_name,
            model_name="claude-sonnet-4-5",
            workflow_id=wf.id,
        )
        db.add(agent)
        await db.flush()

        nodes.append({
            "id": str(agent.id),
            "type": "agentNode",
            "position": {"x": x, "y": 0},
            "data": {
                "label": agent_name,
                "role": agent_name,
                "layer": "generated",
                "model": "claude-sonnet-4-5",
                "tools": [],
                "status": "idle",
                "systemPromptPreview": "",
            },
        })

        if i > 0:
            prev_id = nodes[i - 1]["id"]
            edges.append({
                "id": f"e-{prev_id}-{agent.id}",
                "source": prev_id,
                "target": str(agent.id),
                "animated": True,
            })

    canvas_json: dict[str, Any] = {"nodes": nodes, "edges": edges}
    wf.canvas_json = canvas_json
    await db.flush()
    await db.refresh(wf)

    logger.info("Template '%s' deployed as workflow %s", template_name, wf.id)
    return {
        "workflow_id": str(wf.id),
        "canvas_json": canvas_json,
        "message": f"Template deployed to canvas",
    }
