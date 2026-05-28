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
        "graph_json": {
            "nodes": [
                {
                    "id": "pr_watcher",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are PR Watcher. Use the github_api tool to list open pull requests. "
                        "For each PR, check if any changed files include API route definitions "
                        "(look for files ending in .py, .ts, .yaml containing 'endpoint', 'router', 'path', 'route'). "
                        "Return a JSON list of PRs with potential API changes, including PR number, title, author, and changed files."
                    ),
                    "tools": ["github_api"],
                    "memory_type": "none",
                    "schedule": None,
                },
                {
                    "id": "contract_diff",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Contract Diff. Given a list of PRs with changed files, "
                        "use github_api to fetch the diff for each PR. "
                        "Identify specific API contract changes: added/removed endpoints, "
                        "modified request/response schemas, changed authentication requirements. "
                        "Return a structured diff report per PR."
                    ),
                    "tools": ["github_api"],
                    "memory_type": "none",
                    "schedule": None,
                },
                {
                    "id": "risk_assessor",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Risk Assessor. Given API contract diffs, assess the risk level of each change. "
                        "Consider: breaking changes for existing clients, missing backward compatibility, "
                        "security implications of new endpoints, missing rate limits or auth. "
                        "Rate each change as LOW, MEDIUM, or HIGH risk with a brief rationale."
                    ),
                    "tools": [],
                    "memory_type": "none",
                    "schedule": None,
                },
                {
                    "id": "briefing_agent",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Briefing Agent. Given risk assessments of API changes, "
                        "compose a clear, concise summary for the engineering team. "
                        "Format: PR title, risk level, what changed, recommended action. "
                        "Keep each PR summary under 3 lines. Flag HIGH risk items prominently."
                    ),
                    "tools": [],
                    "memory_type": "none",
                    "schedule": None,
                },
                {
                    "id": "telegram_gateway",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Telegram Gateway. Given a briefing summary of API contract changes, "
                        "use the telegram_send tool to send the summary to the configured Telegram chat. "
                        "Format the message clearly with PR numbers, risk levels, and what action is needed. "
                        "Keep the message under 500 characters."
                    ),
                    "tools": ["telegram_send"],
                    "memory_type": "none",
                    "schedule": None,
                },
            ],
            "edges": [
                {"source": "pr_watcher", "target": "contract_diff", "condition": "always"},
                {"source": "contract_diff", "target": "risk_assessor", "condition": "always"},
                {"source": "risk_assessor", "target": "briefing_agent", "condition": "always"},
                {"source": "briefing_agent", "target": "telegram_gateway", "condition": "always"},
            ],
        },
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
        "graph_json": {
            "nodes": [
                {
                    "id": "changelog_watcher",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Changelog Watcher. Use web_search to find recent changelog entries "
                        "from the top 3 SaaS competitors in the workflow automation space "
                        "(e.g. Zapier, Make.com, n8n). Search for 'competitor changelog site:changelog.competitor.com' "
                        "or 'competitor product updates 2024'. Return a list of the 5 most recent meaningful updates."
                    ),
                    "tools": ["web_search"],
                    "memory_type": "none",
                    "schedule": "0 8 * * 1",
                },
                {
                    "id": "jobs_watcher",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Jobs Watcher. Use web_search to find recent job postings from top competitors "
                        "in the workflow automation space. Search for engineering, product, and GTM roles. "
                        "Job postings reveal strategic intent: AI/ML hires signal product direction, "
                        "sales hires signal market expansion. Return key hiring signals."
                    ),
                    "tools": ["web_search"],
                    "memory_type": "none",
                    "schedule": None,
                },
                {
                    "id": "reviews_watcher",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Reviews Watcher. Use web_search to find recent customer reviews "
                        "of top competitors on G2, Capterra, or Product Hunt. "
                        "Focus on recurring complaints and praised features. "
                        "Identify gaps in competitor products that we could exploit."
                    ),
                    "tools": ["web_search"],
                    "memory_type": "none",
                    "schedule": None,
                },
                {
                    "id": "pattern_agent",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Pattern Agent. Given changelog updates, job postings, and customer reviews "
                        "from competitors, identify cross-cutting patterns and themes. "
                        "What are competitors betting on? What are customers asking for? "
                        "What opportunities or threats emerge from this data?"
                    ),
                    "tools": [],
                    "memory_type": "none",
                    "schedule": None,
                },
                {
                    "id": "prioritizer",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Prioritizer. Given patterns from competitor intelligence, "
                        "select the 3 most actionable signals for this week. "
                        "Rank by: urgency (time-sensitive), impact (revenue/growth potential), "
                        "and confidence (how clear is the signal). "
                        "For each signal, suggest one concrete action to take this week."
                    ),
                    "tools": [],
                    "memory_type": "none",
                    "schedule": None,
                },
                {
                    "id": "briefing_agent",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Briefing Agent. Given the top 3 prioritized competitor signals, "
                        "compose a Monday morning brief and send it via telegram_send. "
                        "Format: Signal 1/2/3, what it means, suggested action. "
                        "Keep the entire message under 600 characters. Be direct and actionable."
                    ),
                    "tools": ["telegram_send"],
                    "memory_type": "none",
                    "schedule": None,
                },
            ],
            "edges": [
                {"source": "changelog_watcher", "target": "pattern_agent", "condition": "always"},
                {"source": "jobs_watcher", "target": "pattern_agent", "condition": "always"},
                {"source": "reviews_watcher", "target": "pattern_agent", "condition": "always"},
                {"source": "pattern_agent", "target": "prioritizer", "condition": "always"},
                {"source": "prioritizer", "target": "briefing_agent", "condition": "always"},
            ],
        },
    },
]

_TEMPLATE_BY_NAME = {t["name"]: t for t in TEMPLATES}


@router.get("/")
async def list_templates() -> list[dict[str, Any]]:
    return [
        {k: v for k, v in t.items() if k != "graph_json"}
        for t in TEMPLATES
    ]


@router.post("/{template_name}/deploy")
async def deploy_template(
    template_name: str, db: AsyncSession = Depends(get_db)
) -> dict[str, Any]:
    tmpl = _TEMPLATE_BY_NAME.get(template_name)
    if not tmpl:
        raise HTTPException(status_code=404, detail=f"Template '{template_name}' not found")

    graph_json: dict[str, Any] = tmpl["graph_json"]
    graph_nodes: list = graph_json.get("nodes", [])
    schedule_expr: str | None = graph_nodes[0].get("schedule") if graph_nodes else None

    wf = Workflow(
        name=tmpl["display_name"],
        description=tmpl["description"],
        intent=tmpl["intent"],
        status=WorkflowStatus.active,
        template_name=template_name,
        graph_json=graph_json,
        schedule_expr=schedule_expr,
    )
    db.add(wf)
    await db.flush()

    # Build canvas from graph nodes
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    node_x: dict[str, int] = {}

    for i, gnode in enumerate(graph_nodes):
        nid = gnode["id"]
        x = i * 280
        node_x[nid] = x

        agent = Agent(
            name=nid.replace("_", " ").title(),
            role=nid,
            system_prompt=gnode.get("system_prompt", ""),
            model_name=gnode.get("model_name", "claude-sonnet-4-5"),
            tools=gnode.get("tools", []),
            workflow_id=wf.id,
        )
        db.add(agent)
        await db.flush()

        nodes.append({
            "id": nid,
            "type": "agentNode",
            "position": {"x": x, "y": 100},
            "data": {
                "label": nid.replace("_", " ").title(),
                "role": nid,
                "layer": "generated",
                "model": gnode.get("model_name", "claude-sonnet-4-5"),
                "tools": gnode.get("tools", []),
                "status": "idle",
                "systemPromptPreview": gnode.get("system_prompt", "")[:80],
            },
        })

    for gedge in graph_json.get("edges", []):
        src, tgt = gedge.get("source"), gedge.get("target")
        if src and tgt:
            edges.append({
                "id": f"e-{src}-{tgt}",
                "source": src,
                "target": tgt,
                "animated": True,
            })

    canvas_json: dict[str, Any] = {"nodes": nodes, "edges": edges}
    wf.canvas_json = canvas_json
    await db.flush()
    await db.commit()
    await db.refresh(wf)

    if schedule_expr:
        try:
            from genesis.utils.scheduler import schedule_workflow
            await schedule_workflow(str(wf.id), schedule_expr)
            logger.info("Scheduled template workflow %s with cron '%s'", wf.id, schedule_expr)
        except Exception as exc:
            logger.error("Failed to schedule template workflow %s: %s", wf.id, exc)

    logger.info("Template '%s' deployed as workflow %s (schedule=%s)", template_name, wf.id, schedule_expr)
    return {
        "workflow_id": str(wf.id),
        "canvas_json": canvas_json,
        "schedule_expr": schedule_expr,
        "message": "Template deployed to canvas",
    }
