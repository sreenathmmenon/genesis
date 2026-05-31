# Genesis — Autonomous Multi-Agent Platform

<div align="center">

[![Live Demo](https://img.shields.io/badge/Live%20Demo-genesis--ai.up.railway.app-brightgreen?style=for-the-badge)](https://genesis-ai.up.railway.app)
[![Python](https://img.shields.io/badge/Python-3.12-blue?style=for-the-badge&logo=python)](https://python.org)
[![FastAPI](https://img.shields.io/badge/FastAPI-async-009688?style=for-the-badge&logo=fastapi)](https://fastapi.tiangolo.com)
[![LangGraph](https://img.shields.io/badge/LangGraph-1.0-orange?style=for-the-badge)](https://langchain-ai.github.io/langgraph)
[![Next.js](https://img.shields.io/badge/Next.js-15-black?style=for-the-badge&logo=next.js)](https://nextjs.org)
[![Claude](https://img.shields.io/badge/Claude-Haiku%20%7C%20Sonnet%20%7C%20Opus-purple?style=for-the-badge)](https://anthropic.com)

**Describe what you want. Get a live multi-agent system in 60 seconds.**

*No code. No config. No workflow diagrams. Just your intent.*

</div>

---

![Dashboard](docs/screenshots/dashboard.png)

---

You have an idea: *"Every Monday, tell me which of my top three competitors changed their pricing, what changed, and what it means for me."*

Before Genesis, this takes a day. You open five browser tabs. You write a Python script that breaks in two weeks. You build a Zapier flow that tells you "competitor changed price" with no context and no reasoning. You still do all the thinking yourself. The tools outsourced the clicking — not the judgment.

With Genesis, you type the intent. Sixty seconds later, a 5-node LangGraph pipeline is running. Each agent observes results, decides what to do next, calls real tools, and hands state to the next agent. A structured brief appears in your dashboard. You didn't write a line of code. You didn't think through the steps. You just described the outcome you wanted.

**Genesis doesn't automate tasks. It replaces the reasoning loop.**

---

## See It Running

<table>
<tr>
<td width="50%">

**My Agents — 2 live pipelines deployed**

![My Agents](docs/screenshots/my-agents.png)

Built from a single sentence each. Run, pause, or inspect any agent.

</td>
<td width="50%">

**Telegram Bot — send intent, get results**

![Telegram Bot](docs/screenshots/telegram-bot.png)

Message the bot. It builds, deploys, and delivers — all in Telegram.

</td>
</tr>
<tr>
<td colspan="2">

**Real agent output — AI News Digest delivered to Telegram**

![Telegram Output](docs/screenshots/telegram-output.png)

The agent searched Hacker News, ranked stories by relevance (88, 82, 71), summarized each one, and delivered a structured brief. Zero human involvement after the initial intent.

</td>
</tr>
</table>

---

## What Genesis Actually Does

**The build pipeline** takes your natural-language intent and runs it through five meta-agents — Architect, Decomposer, Builder, Critic, and Validator — powered by Claude Haiku 4.5 (fast, ~60 seconds end-to-end). The Architect designs the multi-agent topology. The Decomposer breaks it into per-node responsibilities. The Builder generates executable LangGraph `graph_json`. The Critic reviews it and can send it back up to three times. The Validator runs safety checks and produces a cost estimate. If you approve, the workflow is deployed as a live, scheduled system.

**The execution pipeline** takes the deployed `graph_json` and compiles it into a real LangGraph `StateGraph` at runtime — no template expansion, no code generation you can't inspect. Each node runs a ReAct loop: call the LLM, invoke tools, observe results, iterate up to 10 rounds, then pass state to the next node. Every step is written to PostgreSQL and streamed over Redis pub/sub so the web dashboard shows you the full reasoning trace in real time, as it happens.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              UI LAYER                                   │
│            Next.js 15 + ReactFlow canvas + Monitoring panel             │
│                   https://genesis-ai.up.railway.app                     │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │  REST + WebSocket
┌──────────────────────────────▼──────────────────────────────────────────┐
│                        API + RUNTIME LAYER                              │
│                  FastAPI + LangGraph 1.0 + APScheduler                  │
│                                                                         │
│  Build pipeline (meta-agents, Claude Haiku 4.5):                        │
│  User Intent → Architect → Decomposer → Builder ↔ Critic → Validator   │
│                                          (max 3 retries)    → Deploy   │
│                                                                         │
│  Execution pipeline (deployed workflows):                               │
│  WorkflowState → compile_workflow_from_json → LangGraph StateGraph      │
│  Each node: LLM call → tool calls → tool results (up to 10 rounds)     │
│  Every step → PostgreSQL Messages table + Redis RUN_EVENTS channel      │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │  SQLAlchemy 2.0 async + Redis pub/sub
┌──────────────────────────────▼──────────────────────────────────────────┐
│                         PERSISTENCE LAYER                               │
│               PostgreSQL 16 · Redis 7 · Qdrant Cloud                   │
│         Workflow · Run · Message · Agent · GenesisBuild · AuditLog      │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## Why LangGraph

- **StateGraph maps 1:1 to the visual canvas.** ReactFlow nodes are LangGraph nodes; ReactFlow edges are LangGraph edges. The canvas IS the execution graph — no translation layer, no impedance mismatch.
- **Conditional edges enable the Critic retry loop.** The `_critic_router` function inspects `GenesisState.critic_approved` and routes back to the Builder or forward to the Validator. This pattern is trivial in LangGraph and painful in every alternative.
- **MemorySaver checkpointer for the build pipeline.** The meta-agent graph uses an in-memory checkpointer (no external dependencies). Deployed workflow runs are persisted to PostgreSQL via the Run/Message tables.
- **Async-native.** LangGraph's async execution model matches FastAPI and SQLAlchemy 2.0 async — no `loop.run_until_complete` gymnastics, no thread pools to manage.

---

## Quick Start

**Step 1 — Bring up infrastructure**

```bash
git clone https://github.com/sreenathmmenon/genesis
cd genesis
docker compose up -d
```

This starts PostgreSQL 16, Redis 7, and Qdrant. The application itself runs directly.

**Step 2 — Configure environment**

```bash
cp .env.example .env
```

Minimum required variables:

```env
# Core
DATABASE_URL=postgresql+asyncpg://genesis:genesis_dev@localhost:5432/genesis
REDIS_URL=redis://localhost:6379
SECRET_KEY=change_this_to_random_32_char_string

# LLMs
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...          # optional
GOOGLE_API_KEY=AIza...         # optional

# Telegram (for build approval flow + agent delivery)
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# Qdrant Cloud (or leave as localhost for local)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
```

Optional integrations:

```env
SLACK_WEBHOOK_URL=
SENDGRID_API_KEY=
EMAIL_FROM=
GITHUB_TOKEN=
NOTION_API_KEY=
JIRA_URL=
JIRA_EMAIL=
JIRA_API_TOKEN=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
GOOGLE_CALENDAR_CREDENTIALS_JSON=
GOOGLE_SHEETS_CREDENTIALS_JSON=
```

**Step 3 — Run the backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
alembic upgrade head
uvicorn main:app --reload --port 8001
```

**Step 4 — Run the frontend**

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). API at [http://localhost:8001](http://localhost:8001). Docs at [http://localhost:8001/docs](http://localhost:8001/docs).

---

## A Real Run, Step by Step

You open the canvas. You type: *"Every Monday morning, check my top three competitors' pricing pages, compare to last week, identify what changed and why it matters, and send me a brief I can act on."* You click Build.

Over the next 60 seconds you watch five meta-agents run in sequence. The Architect outputs a topology: five nodes — Scraper, Diff Analyzer, Context Researcher, Synthesis Agent, Delivery Agent. The Decomposer assigns each node a precise responsibility and tool list. The Builder generates the full `graph_json`. The Critic flags that the Diff Analyzer needs last week's run output; sends it back. The Builder revises. The Critic approves. The Validator estimates cost at $0.04 per run and clears it.

You click Deploy. Five nodes appear on the ReactFlow canvas, connected by directed edges. The graph is live.

You click Run Now. Node by node, messages stream in over WebSocket: the Scraper calling `fetch_page` three times; the Diff Analyzer noting Competitor B dropped their Pro tier by 15%; the Context Researcher calling `web_search` to find whether that coincides with a product announcement; the Synthesis Agent writing a two-paragraph brief. The Delivery Agent calls `telegram_send`. Done.

Next Monday, APScheduler fires at 09:00 UTC. You get the brief without opening a browser.

---

## Directory Structure

```
genesis/
├── docker-compose.yml              # PostgreSQL + Redis + Qdrant only
├── .env.example
├── docs/screenshots/               # README screenshots
├── backend/
│   ├── main.py                     # FastAPI app, lifespan, CORS
│   ├── requirements.txt
│   ├── genesis/
│   │   ├── agents/
│   │   │   ├── architect.py        # Meta-agent: designs multi-agent topology
│   │   │   ├── decomposer.py       # Meta-agent: breaks design into per-agent tasks
│   │   │   ├── builder.py          # Meta-agent: generates graph_json (nodes + edges)
│   │   │   ├── critic.py           # Meta-agent: reviews builder output, max 3 retries
│   │   │   ├── validator.py        # Meta-agent: safety checks, cost estimate
│   │   │   ├── graph_compiler.py   # compile_workflow_from_json + compile_genesis_graph
│   │   │   ├── state.py            # GenesisState, WorkflowState TypedDicts
│   │   │   ├── monitor_agent.py
│   │   │   ├── repair_agent.py
│   │   │   └── memory_agent.py
│   │   ├── api/
│   │   │   ├── genesis.py          # POST /genesis/build, deploy, cancel
│   │   │   ├── workflows.py        # CRUD + run + schedule endpoints
│   │   │   ├── runs.py             # Run detail, messages, output, download
│   │   │   ├── templates.py        # Template gallery + one-click deploy
│   │   │   ├── agents.py           # Agent CRUD
│   │   │   ├── scheduler.py        # GET /scheduler/jobs
│   │   │   ├── audit.py            # Audit log
│   │   │   ├── tools.py            # GET /tools (tool catalogue)
│   │   │   ├── telegram_webhook.py # POST /telegram/webhook
│   │   │   └── websocket.py        # WS /ws/runs/{run_id}
│   │   ├── channels/
│   │   │   ├── base.py             # ChannelBridge abstract base
│   │   │   └── telegram.py         # python-telegram-bot v20 async, webhook mode
│   │   ├── models/
│   │   │   ├── workflow.py
│   │   │   ├── run.py
│   │   │   ├── agent.py
│   │   │   ├── genesis_build.py
│   │   │   └── audit_log.py
│   │   ├── tools/
│   │   │   └── implementations.py  # 19 tools: _TOOL_MAP, TERMINAL_TOOLS, TOOL_CATALOGUE
│   │   └── utils/
│   │       ├── workflow_executor.py
│   │       ├── model_router.py
│   │       ├── scheduler.py
│   │       ├── redis_client.py
│   │       ├── output_delivery.py
│   │       └── audit.py
│   └── alembic/                    # DB migrations
└── frontend/
    └── app/                        # Next.js App Router
        ├── canvas/                 # Agent builder + ReactFlow canvas
        ├── workflows/              # My Agents page
        ├── runs/[id]/              # Run detail + reasoning trace
        ├── history/                # Run history
        ├── templates/              # Template gallery
        ├── inbox/                  # Completed runs inbox
        └── audit/                  # Audit log
```

---

## Available Tools

| Tool | Category | What it does |
|---|---|---|
| `web_search` | Web | DuckDuckGo search — returns titles, URLs, and excerpts |
| `fetch_page` | Web | Fetches full text of a URL, strips HTML, max 20 KB |
| `browser` | Web | Playwright-controlled Chromium for JavaScript-rendered pages |
| `http_request` | Web | Generic HTTP client — GET / POST / PUT / PATCH / DELETE to any REST API |
| `file_reader` | Files | Read a local file (text formats), max 50 KB |
| `code_executor` | Compute | Execute Python in a sandboxed environment, captures stdout + variables |
| `telegram_send` | Messaging | Send Markdown or HTML message to configured Telegram chat |
| `slack_send` | Messaging | Send to a Slack channel via incoming webhook |
| `email_send` | Messaging | Send email via SendGrid (primary) or SMTP fallback |
| `whatsapp_send` | Messaging | Send WhatsApp message via Twilio |
| `sms_send` | Messaging | Send SMS via Twilio |
| `webhook_send` | Automation | POST JSON to any webhook — triggers Zapier, Make, n8n |
| `scheduler` | Automation | Schedule a workflow to run on a 5-field UTC cron expression |
| `github_api` | Developer | GitHub REST API calls against the configured owner/repo |
| `jira_api` | Developer | Jira: search issues (JQL), get ticket, list projects |
| `notion_read` | Productivity | Read a Notion page by ID or search across the workspace |
| `calendar_read` | Productivity | Read upcoming Google Calendar events |
| `sheets_read` | Productivity | Read rows from a Google Sheet |
| `sheets_write` | Productivity | Write or update rows in a Google Sheet |

---

## Supported LLMs

| Model | Provider | Use |
|---|---|---|
| `claude-haiku-4-5-20251001` | Anthropic | Default for all meta-agents (fast, ~60s build) |
| `claude-sonnet-4-6` | Anthropic | Higher quality; use for complex reasoning nodes |
| `claude-opus-4-7` | Anthropic | Highest capability; most demanding nodes |
| `gpt-4o` | OpenAI | Full capability GPT-4 class |
| `gpt-4o-mini` | OpenAI | Low-cost GPT-4 class |
| `gemini-1.5-pro` | Google | Google's full capability model |
| `gemini-1.5-flash` | Google | Google's fast, low-cost model |

---

## API Reference

All routes are prefixed with `/api/v1`. Interactive docs at `/docs`.

| Method | Path | Description |
|---|---|---|
| `POST` | `/genesis/build` | Start a build from natural language intent |
| `GET` | `/genesis/builds/{id}` | Get build status and all agent outputs |
| `POST` | `/genesis/deploy/{id}` | Deploy a completed build as live workflow |
| `POST` | `/genesis/cancel/{id}` | Cancel a running build |
| `GET` | `/workflows/` | List all workflows |
| `POST` | `/workflows/{id}/run` | Trigger immediate run |
| `POST` | `/workflows/{id}/schedule` | Set cron schedule |
| `GET` | `/runs/{id}/output` | Structured output with per-agent results, token count, cost |
| `GET` | `/runs/{id}/download` | Download as `text`, `json`, or `csv` |
| `POST` | `/runs/{id}/rerun` | Re-execute the same workflow |
| `GET` | `/templates/` | List template gallery |
| `POST` | `/templates/{name}/deploy` | One-click deploy a template |
| `GET` | `/scheduler/jobs` | List scheduled jobs |
| `GET` | `/audit` | Paginated audit log |
| `GET` | `/health` | Health check (db + redis status) |
| `WS` | `/ws/runs/{run_id}` | WebSocket stream of live reasoning trace |

---

## Architecture Decisions

- **FastAPI** — async-first, automatic OpenAPI from Pydantic models, lifespan hooks for LangGraph and APScheduler. No Django weight, no Flask assembly.
- **PostgreSQL + Redis + Qdrant** — three tools that don't overlap. PostgreSQL for structured relational data with ACID guarantees. Redis for pub/sub event streaming to WebSocket clients. Qdrant for vector memory retrieval SQL cannot do.
- **ReactFlow** — the visual graph IS the execution graph. Builder emits `graph_json`; frontend renders it as ReactFlow nodes; backend compiles it as LangGraph nodes from the same structure. No translation layer.
- **Async throughout** — every layer is async. A synchronous tool call blocks the thread and prevents concurrent execution. With `asyncio` throughout, hundreds of concurrent tool calls and WebSocket streams run on a single process.

---

## What's Next

- **Human-in-the-loop** — pause mid-run for approval before continuing
- **Memory across runs** — agents remember context from previous executions
- **Shareable run URLs** — read-only reasoning trace links, no auth required
- **More channels** — Discord, WhatsApp, email delivery from the same pipeline

---

## Database

Migrations via Alembic. Six tables: `workflows`, `agents`, `runs`, `messages`, `genesis_builds`, `audit_logs`.

```bash
cd backend
alembic upgrade head                                      # apply migrations
alembic revision --autogenerate -m "describe_change"     # create new migration
```

The async engine uses `asyncpg`; Alembic uses `psycopg2` for its sync runner (`sync_database_url` in `config.py` handles the swap automatically).

---

## How to Add a New Workflow Template

Templates live in `backend/genesis/api/templates.py` as entries in the `TEMPLATES` list. Add a dict with these fields:

```python
{
    "name": "my-template",                     # URL slug — must be unique
    "display_name": "My Template",
    "category": "automation",                  # automation | intelligence | ops | engineering
    "description": "One sentence shown in the gallery.",
    "intent": "The plain-English intent sent to the Genesis build pipeline.",
    "estimated_time": "~60s",
    "tools": ["web_search", "telegram_send"],  # informational only — Builder decides actual tools
    "agents": 3,                               # informational node count shown in UI
}
```

That's it. The template immediately appears in the gallery at `/templates` and is deployable via `POST /api/v1/templates/{name}/deploy`. No other files to change.

---

## How to Add a New Messaging Channel

Genesis uses a `ChannelBridge` base class in `backend/genesis/channels/base.py`. To add a new channel (e.g. Discord):

**1. Create the bridge** — `backend/genesis/channels/discord.py`:

```python
from genesis.channels.base import ChannelBridge

class DiscordBridge(ChannelBridge):
    async def setup(self) -> None:
        # initialise your client, register handlers
        ...

    async def teardown(self) -> None:
        # clean shutdown
        ...

    async def send_message(self, chat_id: str, text: str) -> None:
        # send a message to the channel
        ...
```

**2. Add a tool** — in `backend/genesis/tools/implementations.py`, add a `discord_send` entry to `_TOOL_MAP` following the pattern of `telegram_send`.

**3. Wire up in `main.py`** — import your bridge and add it to the lifespan startup/shutdown alongside `TelegramBridge`.

**4. Add config** — add any tokens/webhook URLs to `backend/genesis/config.py` and `.env.example`.

The new tool is immediately available to all agents in the Builder's tool list.
