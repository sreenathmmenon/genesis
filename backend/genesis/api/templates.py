import logging
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession

from genesis.database import get_db
from genesis.models import Agent, Workflow
from genesis.models.workflow import WorkflowStatus
from genesis.utils.audit import audit

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
            "Report Writer",
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
                    "id": "report_writer",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Report Writer. Your context contains the complete risk assessment from previous agents. "
                        "Write a clear PR review report in this format:\n\n"
                        "## API Change Report\n\n"
                        "### Summary\n[1-2 sentences: how many PRs found, overall risk level]\n\n"
                        "### PRs Requiring Review\n"
                        "For each PR: **PR #[number]: [title]**\nRisk: [HIGH/MEDIUM/LOW]\nChanges: [what changed]\nRecommendation: [approve/request changes/block]\n\n"
                        "### No-Action PRs\n[list PRs with LOW risk that can be merged]\n\n"
                        "If no PRs were found, write: 'No API changes detected in open PRs.'\n\n"
                        "This report is shown directly in the Genesis dashboard — make it readable and actionable."
                    ),
                    "tools": [],
                    "memory_type": "none",
                    "schedule": None,
                },
            ],
            "edges": [
                {"source": "pr_watcher", "target": "contract_diff", "condition": "always"},
                {"source": "contract_diff", "target": "risk_assessor", "condition": "always"},
                {"source": "risk_assessor", "target": "briefing_agent", "condition": "always"},
                {"source": "briefing_agent", "target": "report_writer", "condition": "always"},
            ],
        },
    },
    {
        "name": "daily-standup-digest",
        "display_name": "Daily Standup Digest",
        "category": "automation",
        "description": "Every morning, pull updates from GitHub, Jira, and Slack, then generate and send a team standup summary to your channel.",
        "intent": "Every weekday at 9am, collect yesterday's merged PRs, closed tickets, and Slack highlights, then send a standup digest to our team channel.",
        "agent_count": 4,
        "agents": ["GitHub Collector", "Jira Collector", "Slack Collector", "Digest Writer"],
        "graph_json": None,
        "schedule": "0 9 * * 1-5",
    },
    {
        "name": "lead-enrichment-bot",
        "display_name": "Lead Enrichment Bot",
        "category": "intelligence",
        "description": "When a new lead appears in your CRM, automatically research their company, find contact details, and score them before your sales team reaches out.",
        "intent": "When a new lead is added to our CRM, search the web for their company info, LinkedIn profile, and recent news, then add a research summary and lead score to the CRM record.",
        "agent_count": 3,
        "agents": ["CRM Watcher", "Research Agent", "Lead Scorer"],
        "graph_json": None,
        "schedule": None,
    },
    {
        "name": "infra-cost-watchdog",
        "display_name": "Infra Cost Watchdog",
        "category": "ops",
        "description": "Monitor your AWS/GCP costs daily. Alert your team when spending spikes above threshold and identify the top cost drivers automatically.",
        "intent": "Every day at 8am check our cloud spending. If daily cost exceeds $500 or grows more than 20% day-over-day, send an alert with the top 3 cost drivers to our Slack channel.",
        "agent_count": 3,
        "agents": ["Cost Fetcher", "Anomaly Detector", "Alert Sender"],
        "graph_json": None,
        "schedule": "0 8 * * *",
    },
    {
        "name": "changelog-reporter",
        "display_name": "Weekly Changelog Reporter",
        "category": "engineering",
        "description": "Every Friday, collect all merged PRs from your repos, group them by type, and publish a formatted changelog to Notion or your docs site.",
        "intent": "Every Friday at 5pm, collect all GitHub PRs merged this week, categorize them as features, fixes, or refactors, and post a formatted changelog to our Notion workspace.",
        "agent_count": 3,
        "agents": ["PR Collector", "Categorizer", "Notion Publisher"],
        "graph_json": None,
        "schedule": "0 17 * * 5",
    },
    {
        "name": "support-triage-agent",
        "display_name": "Support Ticket Triage",
        "category": "automation",
        "description": "Monitor your support inbox. Classify incoming tickets by urgency and category, auto-respond to common questions, and escalate critical issues instantly.",
        "intent": "Watch our support inbox. Classify each ticket as critical, high, medium, or low. Auto-reply to FAQs, create Jira tickets for bugs, and page on-call for critical issues.",
        "agent_count": 4,
        "agents": ["Inbox Watcher", "Classifier", "Auto Responder", "Escalation Agent"],
        "graph_json": None,
        "schedule": None,
    },
    {
        "name": "competitor-monitor",
        "display_name": "Competitor Intelligence",
        "category": "intelligence",
        "description": "Track your top competitors daily. Monitor their pricing pages, job postings, and blog for signals. Weekly summary delivered to your inbox.",
        "intent": "Every Monday morning, scan my top 5 competitors' websites, pricing pages, and job boards for changes. Summarize the 3 most important competitive signals of the week.",
        "agent_count": 4,
        "agents": ["Web Scraper", "Change Detector", "Signal Analyst", "Report Writer"],
        "graph_json": None,
        "schedule": "0 8 * * 1",
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
                        "You are Briefing Agent. Your context contains the prioritized signals from previous agents. "
                        "Compose a structured Monday morning competitive intelligence brief. "
                        "Format it as:\n"
                        "SIGNAL 1: [title]\nWhat it means: [2 sentences]\nAction: [1 concrete action]\n\n"
                        "SIGNAL 2: ...\nSIGNAL 3: ...\n\n"
                        "SUMMARY: [1-2 sentences on the most important takeaway this week]\n\n"
                        "Be direct, specific, and actionable. No filler. "
                        "This output is displayed directly to the user in their Genesis dashboard."
                    ),
                    "tools": [],
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
    {
        "name": "market-research",
        "display_name": "Market Research Assistant",
        "description": "Give it any topic or company — it researches the market, finds competitors, trends, and key players, then writes a full brief you can read in your dashboard.",
        "intent": "Research the market for a topic. Find top competitors, current trends, market size, key players, and recent news. Write a structured market brief.",
        "agent_count": 3,
        "category": "intelligence",
        "agents": ["Web Researcher", "Data Analyst", "Report Writer"],
        "graph_json": {
            "nodes": [
                {
                    "id": "web_researcher",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Web Researcher. Research the topic given in your input. "
                        "Use web_search to find: (1) top companies in this space with brief descriptions, "
                        "(2) current market trends, (3) recent news in the last 3 months, "
                        "(4) key industry numbers or market size if available. "
                        "Run 4-5 different searches and compile the raw findings. Include source URLs."
                    ),
                    "tools": ["web_search", "fetch_page"],
                    "memory_type": "none",
                    "schedule": None,
                },
                {
                    "id": "data_analyst",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Data Analyst. Given raw research findings, extract and structure the key facts: "
                        "- Top 5 competitors with 1-line description each "
                        "- 3 most important market trends "
                        "- Market size or growth rate (if found) "
                        "- 3 recent notable news events "
                        "- Key opportunities or risks "
                        "Be factual. Only include information from the research."
                    ),
                    "tools": [],
                    "memory_type": "none",
                    "schedule": None,
                },
                {
                    "id": "report_writer",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Report Writer. Write a professional market research brief using this format:\n\n"
                        "## Market Research Brief: [Topic]\n\n"
                        "### Market Overview\n[2-3 sentences: size, growth, maturity]\n\n"
                        "### Top Competitors\n[bulleted list: company — what they do — key differentiator]\n\n"
                        "### Key Trends\n[numbered list: trend — why it matters]\n\n"
                        "### Recent Developments\n[2-3 news items with dates]\n\n"
                        "### Opportunities & Risks\n[2 opportunities, 2 risks]\n\n"
                        "### Bottom Line\n[3-sentence executive summary]\n\n"
                        "Write for a non-technical business person. No jargon. Clear, actionable."
                    ),
                    "tools": [],
                    "memory_type": "none",
                    "schedule": None,
                },
            ],
            "edges": [
                {"source": "web_researcher", "target": "data_analyst", "condition": "always"},
                {"source": "data_analyst", "target": "report_writer", "condition": "always"},
            ],
        },
    },
    {
        "name": "job-scout",
        "display_name": "Job Scout",
        "description": "Searches for jobs matching your role and skills, filters by quality, and gives you a curated ranked list — saves hours of manual searching.",
        "intent": "Find the best remote software engineer jobs posted recently. Filter for companies with good culture and fair pay. Give me a ranked list with key details and apply links.",
        "agent_count": 3,
        "category": "automation",
        "agents": ["Job Searcher", "Quality Filter", "Rankings Writer"],
        "graph_json": {
            "nodes": [
                {
                    "id": "job_searcher",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Job Searcher. Search for job postings using web_search. "
                        "Search on LinkedIn, Hacker News 'Who is hiring', RemoteOK, and company career pages. "
                        "Use multiple query variations. Collect 15-20 job postings with: "
                        "title, company, salary if listed, remote/hybrid/onsite, job URL, and posting date. "
                        "Focus on jobs posted in the last 14 days."
                    ),
                    "tools": ["web_search", "fetch_page"],
                    "memory_type": "none",
                    "schedule": None,
                },
                {
                    "id": "quality_filter",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Quality Filter. Evaluate each job posting and score it 1-10 on: "
                        "role match, company quality, compensation, and remote authenticity. "
                        "Remove jobs scoring below 6. "
                        "For each remaining job, write a 1-line reason why it's worth applying."
                    ),
                    "tools": [],
                    "memory_type": "none",
                    "schedule": None,
                },
                {
                    "id": "rankings_writer",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Rankings Writer. Write a curated job report:\n\n"
                        "## Job Report: [Role]\n\n"
                        "### Top Picks\n\n"
                        "**[Company] — [Title]**\n"
                        "Pay: [salary or 'not listed'] | Remote: [yes/hybrid/no] | Posted: [date]\n"
                        "Why apply: [1-2 sentences]\nApply: [URL]\n\n"
                        "[Repeat ranked best-first]\n\n"
                        "### Summary\n[Total found, how many made cut, best opportunity]\n\n"
                        "Link directly to application pages."
                    ),
                    "tools": [],
                    "memory_type": "none",
                    "schedule": None,
                },
            ],
            "edges": [
                {"source": "job_searcher", "target": "quality_filter", "condition": "always"},
                {"source": "quality_filter", "target": "rankings_writer", "condition": "always"},
            ],
        },
    },
    {
        "name": "content-research",
        "display_name": "Content Researcher",
        "description": "Give it a topic — it finds trending angles, unanswered questions, content gaps, and writes a ready-to-use brief for any writer.",
        "intent": "Research content ideas for a given topic. Find what people search for, what questions are unanswered, what content exists, and write a brief with 5 article ideas.",
        "agent_count": 3,
        "category": "intelligence",
        "agents": ["Trend Finder", "Gap Analyzer", "Brief Writer"],
        "graph_json": {
            "nodes": [
                {
                    "id": "trend_finder",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Trend Finder. Given a content topic, use web_search to find: "
                        "(1) what people are searching for related to this topic, "
                        "(2) top 5 existing articles and their angles, "
                        "(3) recent news that makes this topic timely, "
                        "(4) questions people ask on Reddit, Quora, forums. "
                        "Return structured findings with source URLs."
                    ),
                    "tools": ["web_search", "fetch_page"],
                    "memory_type": "none",
                    "schedule": None,
                },
                {
                    "id": "gap_analyzer",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Gap Analyzer. Given trend research, identify: "
                        "(1) What existing content misses or gets wrong "
                        "(2) Questions not well answered "
                        "(3) Angles and perspectives underrepresented "
                        "(4) Audience segments not served by current content "
                        "Be specific — point to actual gaps."
                    ),
                    "tools": [],
                    "memory_type": "none",
                    "schedule": None,
                },
                {
                    "id": "brief_writer",
                    "model_name": "claude-sonnet-4-5",
                    "system_prompt": (
                        "You are Brief Writer. Write a content brief with 5 ideas:\n\n"
                        "## Content Brief: [Topic]\n\n"
                        "### Why Now\n[1-2 sentences: why this matters right now]\n\n"
                        "**Idea 1: [Headline]**\nAngle: [unique perspective]\nTarget reader: [who]\n"
                        "Key points: [3 bullets]\nLength: [word count]\n\n"
                        "[Repeat for ideas 2-5]\n\n"
                        "### SEO Angles\n[3 long-tail search phrases to target]\n\n"
                        "Write like a senior content strategist. Be opinionated and specific."
                    ),
                    "tools": [],
                    "memory_type": "none",
                    "schedule": None,
                },
            ],
            "edges": [
                {"source": "trend_finder", "target": "gap_analyzer", "condition": "always"},
                {"source": "gap_analyzer", "target": "brief_writer", "condition": "always"},
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

    raw_graph_json: dict[str, Any] | None = tmpl["graph_json"]
    graph_json: dict[str, Any] = raw_graph_json if raw_graph_json else {}
    graph_nodes: list = graph_json.get("nodes", [])

    # For templates without graph_json, derive schedule from template-level field
    if raw_graph_json is None:
        schedule_expr: str | None = tmpl.get("schedule")
    else:
        schedule_expr = graph_nodes[0].get("schedule") if graph_nodes else None

    wf = Workflow(
        name=tmpl["display_name"],
        description=tmpl["description"],
        intent=tmpl["intent"],
        status=WorkflowStatus.active,
        template_name=template_name,
        graph_json=graph_json if graph_json else None,
        schedule_expr=schedule_expr,
    )
    db.add(wf)
    await db.flush()

    # Build canvas from graph nodes (or agent names for simple templates)
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    node_x: dict[str, int] = {}

    if graph_nodes:
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
    else:
        # Build simple linear canvas from agent names list
        agent_names: list[str] = tmpl.get("agents", [])
        for i, agent_name in enumerate(agent_names):
            nid = agent_name.lower().replace(" ", "_")
            x = i * 280
            agent = Agent(
                name=agent_name,
                role=nid,
                system_prompt="",
                model_name="claude-sonnet-4-5",
                tools=[],
                workflow_id=wf.id,
            )
            db.add(agent)
            await db.flush()

            nodes.append({
                "id": nid,
                "type": "agentNode",
                "position": {"x": x, "y": 100},
                "data": {
                    "label": agent_name,
                    "role": nid,
                    "layer": "generated",
                    "model": "claude-sonnet-4-5",
                    "tools": [],
                    "status": "idle",
                    "systemPromptPreview": "",
                },
            })

            if i > 0:
                prev_nid = agent_names[i - 1].lower().replace(" ", "_")
                edges.append({
                    "id": f"e-{prev_nid}-{nid}",
                    "source": prev_nid,
                    "target": nid,
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
    await audit("template.deployed", "workflow", str(wf.id), wf.name, {"template_name": template_name, "schedule_expr": schedule_expr})
    return {
        "workflow_id": str(wf.id),
        "canvas_json": canvas_json,
        "schedule_expr": schedule_expr,
        "message": "Template deployed to canvas",
    }
