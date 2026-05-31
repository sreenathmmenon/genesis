# Genesis — Autonomous Multi-Agent Platform

You have an idea: "Every Monday, tell me which of my top three competitors changed their pricing, what changed, and what it means for me."

Before Genesis, this takes a day. You open five browser tabs. You write a Python script that breaks in two weeks. You build a Zapier flow that tells you "competitor changed price" with no context and no reasoning. You still do all the thinking yourself. The tools outsourced the clicking — not the judgment.

With Genesis, you type the intent. Sixty seconds later, a 5-node LangGraph pipeline is running. Each agent observes results, decides what to do next, calls real tools, and hands state to the next agent. A structured brief appears in your dashboard. You didn't write a line of code. You didn't think through the steps. You just described the outcome you wanted.

That is the difference: Genesis doesn't automate tasks. It replaces the reasoning loop.

---

## What Genesis Actually Does

**The build pipeline** takes your natural-language intent and runs it through five meta-agents — Architect, Decomposer, Builder, Critic, and Validator — each powered by Claude Sonnet 4. The Architect designs the multi-agent topology. The Decomposer breaks it into per-node responsibilities. The Builder generates executable LangGraph `graph_json`. The Critic reviews it and can send it back up to three times. The Validator runs safety checks and produces a cost estimate. If you approve, the workflow is deployed as a live, scheduled system.

**The execution pipeline** takes the deployed `graph_json` and compiles it into a real LangGraph `StateGraph` at runtime — no template expansion, no code generation you can't inspect. Each node runs a ReAct loop: call the LLM, invoke tools, observe results, iterate up to 10 rounds, then pass state to the next node. Every step is written to PostgreSQL and streamed over Redis pub/sub so the web dashboard shows you the full reasoning trace in real time, as it happens.

---

## Architecture

```
┌─────────────────────────────────────────────────────────────────────────┐
│                              UI LAYER                                   │
│            Next.js 15 + ReactFlow canvas + Monitoring panel             │
│                         http://localhost:3000                           │
└──────────────────────────────┬──────────────────────────────────────────┘
                               │  REST + WebSocket
┌──────────────────────────────▼──────────────────────────────────────────┐
│                        API + RUNTIME LAYER                              │
│                  FastAPI + LangGraph 1.0 + APScheduler                  │
│                                                                         │
│  Build pipeline (meta-agents, Claude Sonnet 4):                         │
│  User Intent → Architect → Decomposer → Builder ↔ Critic → Validator   │
│                                          (max 3 retries)    → Approve  │
│                                                                         │
│  Execution pipeline (deployed workflows):                               │
│  WorkflowState → compile_workflow_from_json → LangGraph StateGraph      │
│  Each node: LLM call → tool calls → tool results (up to 10 rounds)     │
│  Every step → PostgreSQL Messages table + Redis RUN_EVENTS channel      │
│                                                                         │
│                         http://localhost:8000                           │
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
- **AsyncPostgresSaver checkpointer enables run recovery.** Every intermediate state is checkpointed to PostgreSQL. A crashed run can be resumed from the last checkpoint without replaying completed nodes.
- **Async-native.** LangGraph's async execution model matches FastAPI and SQLAlchemy 2.0 async — no `loop.run_until_complete` gymnastics, no thread pools to manage.

---

## Quick Start

**Step 1 — Bring up infrastructure**

```bash
git clone https://github.com/YOUR_USERNAME/genesis
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

# LLMs (add providers you want to use)
ANTHROPIC_API_KEY=sk-ant-...
OPENAI_API_KEY=sk-...
GOOGLE_API_KEY=AIza...

# Telegram (required for the build pipeline approval flow)
TELEGRAM_BOT_TOKEN=...
TELEGRAM_CHAT_ID=...

# Qdrant Cloud (or leave as localhost for local)
QDRANT_URL=http://localhost:6333
QDRANT_API_KEY=
```

Optional integrations (add only what your workflows need):

```env
SLACK_WEBHOOK_URL=
SENDGRID_API_KEY=
EMAIL_FROM=
GITHUB_TOKEN=
GITHUB_REPO_OWNER=
GITHUB_REPO_NAME=
NOTION_API_KEY=
JIRA_URL=
JIRA_EMAIL=
JIRA_API_TOKEN=
TWILIO_ACCOUNT_SID=
TWILIO_AUTH_TOKEN=
TWILIO_WHATSAPP_FROM=
TWILIO_SMS_FROM=
GOOGLE_CALENDAR_CREDENTIALS_JSON=
GOOGLE_SHEETS_CREDENTIALS_JSON=
```

**Step 3 — Run the backend**

```bash
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -e .
alembic upgrade head
uvicorn genesis.main:app --reload --port 8000
```

**Step 4 — Run the frontend**

```bash
cd frontend
npm install
npm run dev
```

Open [http://localhost:3000](http://localhost:3000). The API is at [http://localhost:8000](http://localhost:8000). Interactive docs: [http://localhost:8000/docs](http://localhost:8000/docs).

---

## A Real Run, Step by Step

Here is what it looks like to watch Genesis work.

You open the canvas at `localhost:3000`. There is a single text field. You type: "Every Monday morning, check my top three competitors' pricing pages, compare to last week, identify what changed and why it matters, and send me a brief I can act on." You click Build.

The build panel opens. Over the next 45 seconds you watch five meta-agents run in sequence. The Architect outputs a topology: five nodes — a Scraper, a Diff Analyzer, a Context Researcher, a Synthesis Agent, and a Delivery Agent. The Decomposer assigns each node a precise responsibility and a tool list. The Builder generates the full `graph_json` — node IDs, system prompts, tool assignments, edges. The Critic reads the output and flags that the Diff Analyzer needs access to last week's run output; it sends the spec back. The Builder revises. The Critic approves. The Validator estimates cost at $0.04 per run and clears it.

You click Deploy. Five nodes appear on the ReactFlow canvas, connected by directed edges. The graph is live.

You click Run Now to watch the first execution. The monitoring panel opens. Node by node, messages stream in over WebSocket: the Scraper calling `fetch_page` three times and logging what it retrieved; the Diff Analyzer comparing current prices to stored state and noting that Competitor B dropped their Pro tier by 15%; the Context Researcher calling `web_search` to find whether that coincides with a product announcement; the Synthesis Agent writing a two-paragraph brief. The Delivery Agent calls `email_send`. The run completes. The full reasoning trace — every tool call, every LLM response, every intermediate result — is in the run detail view, downloadable as JSON.

Next Monday, APScheduler fires the workflow at 09:00 UTC. You get the brief without opening a browser.

---

## Directory Structure

```
genesis/
├── docker-compose.yml              # PostgreSQL + Redis + Qdrant only
├── .env.example
├── setup.sh / start.sh / stop.sh
├── backend/
│   ├── main.py                     # FastAPI app, lifespan, CORS
│   ├── pyproject.toml
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
│   │   │   └── websocket.py        # WS /ws/runs/{run_id}
│   │   ├── channels/
│   │   │   ├── base.py             # ChannelBridge abstract base
│   │   │   └── telegram.py         # python-telegram-bot v20 async bridge
│   │   ├── models/
│   │   │   ├── workflow.py         # Workflow, WorkflowStatus
│   │   │   ├── run.py              # Run, Message, RunStatus, MessageType
│   │   │   ├── agent.py            # Agent, MemoryType
│   │   │   ├── genesis_build.py    # GenesisBuild, BuildStatus
│   │   │   └── audit_log.py        # AuditLog
│   │   ├── tools/
│   │   │   └── implementations.py  # 19 tools: _TOOL_MAP, TERMINAL_TOOLS, TOOL_CATALOGUE
│   │   └── utils/
│   │       ├── workflow_executor.py
│   │       ├── model_router.py     # get_llm — routes to Anthropic / OpenAI / Google
│   │       ├── scheduler.py        # APScheduler wrapper
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

## How to Add a Template

Templates live in `backend/genesis/api/templates.py` as dicts in the `TEMPLATES` list. Each template with a `graph_json` key is deployed immediately with full node definitions; templates without `graph_json` are deployed as linear pipelines from the `agents` list.

**1. Add a dict to the `TEMPLATES` list in `backend/genesis/api/templates.py`:**

```python
{
    "name": "my-template",                 # URL slug — used in POST /templates/{name}/deploy
    "display_name": "My Template",
    "description": "One sentence for the gallery card.",
    "intent": "Full natural-language intent sent to Genesis if the user customises it.",
    "category": "engineering",             # engineering | automation | intelligence | ops
    "agent_count": 3,
    "agents": ["Agent One", "Agent Two", "Agent Three"],
    "schedule": "0 9 * * 1-5",            # optional 5-field UTC cron; None if on-demand
    "graph_json": {                        # omit (or set None) for linear pipeline
        "nodes": [
            {
                "id": "agent_one",
                "model_name": "claude-sonnet-4-5",
                "system_prompt": "You are Agent One. ...",
                "tools": ["web_search", "fetch_page"],
                "memory_type": "none",
                "schedule": None,
            },
            # ... more nodes
        ],
        "edges": [
            {"source": "agent_one", "target": "agent_two", "condition": "always"},
            # ... more edges
        ],
    },
},
```

**2. Choose tools from `TOOL_CATALOGUE` in `implementations.py`** — use the exact string names from `_TOOL_MAP` (e.g. `"web_search"`, `"github_api"`, `"email_send"`).

**3. Set `"model_name"` per node** to any value from `ALLOWED_MODELS` in `model_router.py`. Each node can use a different model.

**4. Set `"schedule"` on the first node** (or at the template's top level for no-`graph_json` templates) if the workflow should run on a cron. Set `None` for on-demand.

**5. Restart the backend.** The template appears immediately at `GET /api/v1/templates/` and can be deployed via `POST /api/v1/templates/my-template/deploy`. No migration needed — templates are in-process Python dicts.

---

## How to Add a Delivery Channel

The following steps add Discord as a new output channel. The same pattern applies to any messaging service.

**1. Add a tool to `backend/genesis/tools/implementations.py`:**

```python
@tool
async def discord_send(message: str, webhook_url: str = "") -> str:
    """Send a message to a Discord channel via webhook.
    webhook_url: Discord webhook URL (overrides DISCORD_WEBHOOK_URL env var).
    message: plain text or Discord markdown."""
    import httpx
    url = webhook_url or settings.discord_webhook_url
    if not url:
        return json.dumps({"error": "DISCORD_WEBHOOK_URL not configured."})
    try:
        async with httpx.AsyncClient(timeout=10.0) as client:
            resp = await client.post(url, json={"content": message[:2000]})
            resp.raise_for_status()
        logger.info("discord_send succeeded: chars=%d", len(message))
        return json.dumps({"ok": True})
    except Exception as exc:
        logger.warning("discord_send failed: %s", exc)
        return json.dumps({"error": str(exc)})
```

**2. Register the tool in the three registries in `implementations.py`:**

```python
# _TOOL_MAP — makes the tool callable by agents
_TOOL_MAP: dict[str, Any] = {
    ...
    "discord_send": discord_send,
}

# TERMINAL_TOOLS — stops the ReAct loop after this tool fires (side-effect tools)
TERMINAL_TOOLS: set[str] = {
    ..., "discord_send"
}

# TOOL_CATALOGUE — exposes the tool to the Builder agent prompt and /api/v1/tools
TOOL_CATALOGUE: list[dict[str, Any]] = [
    ...
    {
        "name": "discord_send",
        "category": "messaging",
        "description": "Send a message to a Discord channel via webhook.",
        "use_when": "Delivering results, alerts, or reports to Discord",
        "parameters": {"message": "str", "webhook_url": "str (optional, overrides env)"},
    },
]
```

**3. Add the config key to `backend/genesis/config.py`:**

```python
class Settings(BaseSettings):
    ...
    discord_webhook_url: str = ""
```

**4. Add the credential to `.env`:**

```env
DISCORD_WEBHOOK_URL=https://discord.com/api/webhooks/...
```

**5. The Builder agent discovers new tools automatically.** `TOOL_CATALOGUE` is injected into the Builder's system prompt at build time via `GET /api/v1/tools`. Any workflow the Builder generates going forward can include `"discord_send"` in a node's `tools` list. No prompt editing required.

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
| `whatsapp_send` | Messaging | Send WhatsApp message via Twilio, supports media attachments |
| `sms_send` | Messaging | Send SMS via Twilio to any E.164 phone number |
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
| `claude-sonnet-4-5` | Anthropic | Default for all meta-agents and generated nodes |
| `claude-opus-4-7` | Anthropic | Highest capability; use for complex reasoning nodes |
| `claude-haiku-4-5-20251001` | Anthropic | Fast and cheap; Repair Agent default |
| `gpt-4o` | OpenAI | Full capability GPT-4 class |
| `gpt-4o-mini` | OpenAI | Low-cost GPT-4 class |
| `gemini-1.5-pro` | Google | Google's full capability model |
| `gemini-1.5-flash` | Google | Google's fast, low-cost model |

Set the model per node in `graph_json.nodes[*].model_name`. All routing is handled by `genesis/utils/model_router.py` which selects the correct SDK based on the model name prefix.

---

## API Reference

All routes are prefixed with `/api/v1`. Interactive docs at `/docs`.

### Builds (`/genesis`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/genesis/build` | Start a build from a natural language intent. Returns `build_id`. |
| `GET` | `/genesis/builds` | List recent builds (default limit 20). |
| `GET` | `/genesis/builds/{build_id}` | Get build status and all agent outputs. |
| `POST` | `/genesis/deploy/{build_id}` | Approve and deploy a build to an active workflow. |
| `POST` | `/genesis/cancel/{build_id}` | Cancel a running build. |

### Workflows (`/workflows`)

| Method | Path | Description |
|---|---|---|
| `POST` | `/workflows/` | Create a workflow manually. |
| `GET` | `/workflows/` | List all workflows. |
| `GET` | `/workflows/{id}` | Get workflow detail including `graph_json` and `canvas_json`. |
| `PATCH` | `/workflows/{id}` | Update workflow fields. |
| `DELETE` | `/workflows/{id}` | Delete a workflow. |
| `POST` | `/workflows/{id}/run` | Trigger an immediate run. Returns `run_id`. |
| `POST` | `/workflows/{id}/deploy` | Set workflow status to active. |
| `POST` | `/workflows/{id}/pause` | Pause a workflow (stops scheduled runs). |
| `POST` | `/workflows/{id}/schedule` | Set or update the cron schedule (`{"cron_expr": "0 9 * * 1-5"}`). |
| `DELETE` | `/workflows/{id}/schedule` | Remove the cron schedule. |
| `GET` | `/workflows/{id}/export` | Export workflow definition as JSON (nodes, edges, agent prompts). |

### Runs (`/runs`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/runs/` | List runs. Filter by `workflow_id`, paginate with `limit` and `offset`. |
| `GET` | `/runs/{id}` | Get run detail with all messages (reasoning trace). |
| `GET` | `/runs/{id}/messages` | Get paginated message list for a run. |
| `GET` | `/runs/{id}/output` | Structured output: summary, per-agent outputs, token count, cost. |
| `GET` | `/runs/{id}/download` | Download output as `text`, `json`, or `csv` (query param `fmt`). |
| `POST` | `/runs/{id}/rerun` | Re-execute the same workflow. Returns a new `run_id`. |

### Templates (`/templates`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/templates/` | List all templates (excludes `graph_json` for size). |
| `POST` | `/templates/{name}/deploy` | Deploy a template to a live workflow with canvas and agents. |

### Scheduler (`/scheduler`)

| Method | Path | Description |
|---|---|---|
| `GET` | `/scheduler/jobs` | List all currently scheduled jobs with their cron expressions. |

### Other

| Method | Path | Description |
|---|---|---|
| `GET` | `/tools` | Full tool catalogue with descriptions and parameter schemas. |
| `GET` | `/audit` | Paginated audit log for all platform events. |
| `GET` | `/health` | Health check. |
| `WS` | `/ws/runs/{run_id}` | WebSocket stream of live trace events for a run. |

---

## Architecture Decisions

- **FastAPI over Django or Flask.** Django's ORM is synchronous by default and its weight is unjustified for an API-only backend. Flask requires too much assembly. FastAPI gives us async-first request handling, automatic OpenAPI generation from Pydantic models, and lifespan hooks for managing the LangGraph and APScheduler instances — all with less boilerplate than either alternative.

- **PostgreSQL + Redis + Qdrant, not a single database.** These three do different things and the tradeoffs don't overlap. PostgreSQL is the system of record for structured, relational data (workflows, runs, messages, audit logs) with full ACID guarantees and SQLAlchemy 2.0 async. Redis is the event bus: pub/sub on `RUN_EVENTS` is how the WebSocket layer streams reasoning traces to the browser without polling. Qdrant is the vector store for semantic memory — retrieval that SQL cannot do. Collapsing these into one system means either losing a capability or fighting the wrong tool for the job.

- **ReactFlow for the canvas.** The constraint was that the visual graph had to be the execution graph — not a diagram of it, not a representation of it. ReactFlow's node/edge model maps directly to LangGraph's `StateGraph` node/edge model. When the Builder agent emits `graph_json`, the frontend renders it as ReactFlow nodes and the backend compiles it as LangGraph nodes from the same data structure. There is no translation layer to maintain.

- **Async throughout.** Every layer — FastAPI request handlers, SQLAlchemy queries, LangGraph node execution, tool calls, Redis pub/sub — is async. This is not a style preference. A synchronous tool call inside a node (e.g. a 3-second HTTP request to an external API) would block the thread and prevent other nodes or requests from running concurrently. With `asyncio` throughout, the event loop handles hundreds of concurrent tool calls and WebSocket streams on a single process without thread pools.

---

## What's Next

- **Memory persistence across runs.** The Memory Agent and `MemoryType` model are already wired into the schema. The next step is surfacing per-agent memory in the UI and giving the Builder agent the ability to declare which nodes retain state between executions.
- **Human-in-the-loop approval.** The Validator already produces a cost estimate and a risk assessment before deploy. The next step is a pause-and-approve gate mid-run — a node can emit a `PENDING_APPROVAL` status, the dashboard shows the pending decision, and execution resumes only after explicit confirmation.
- **Public shareable run URLs.** Every run already has a unique ID and a full reasoning trace stored in PostgreSQL. Shareable URLs are a read-only view of that trace — no auth required, time-limited, useful for sharing what an agent concluded and how it got there.

---

## Database

Migrations are managed with Alembic. The schema covers six tables: `workflows`, `agents`, `runs`, `messages`, `genesis_builds`, and `audit_logs`.

```bash
# Apply all migrations (run after pulling new commits)
cd backend
alembic upgrade head

# Create a new migration after model changes
alembic revision --autogenerate -m "describe_your_change"
```

Migration files live in `backend/alembic/versions/`. The async SQLAlchemy engine uses the `asyncpg` driver at runtime; Alembic uses `psycopg2` for its synchronous migration runner (the `sync_database_url` property in `config.py` handles the driver swap automatically).
