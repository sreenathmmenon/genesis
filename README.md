# Genesis — AI Agent Orchestration Platform

> *The last agent platform you will ever configure manually.*

---

## The Problem

Every agent platform shares one assumption — humans configure the agents. You write the prompt. You choose tools. You drag nodes. You are the architect. Before getting value you must become an expert in the platform itself. The configuration is the product.

What if you just described what you want to happen?

Genesis inverts this. Describe the outcome in one sentence on Telegram. Genesis decomposes your intent, designs the topology, generates the LangGraph 1.0 workflow, runs a Critic-Builder quality loop, validates in an isolated sandbox, asks for your approval. You don't configure agents. Genesis builds the agents that achieve your outcome.

---

## Quick Start

```shell
git clone https://github.com/YOUR_USERNAME/genesis
cd genesis
chmod +x setup.sh start.sh stop.sh
./setup.sh           # one-time setup ~3 minutes
```

Edit `.env` and add `ANTHROPIC_API_KEY` and `TELEGRAM_BOT_TOKEN`

```shell
./start.sh
```

Open http://localhost:3000

Send a message to your Telegram bot to start building.

---

## Architecture

### Three-Layer Architecture

```
┌──────────────────────────────────────────────────────────────────────┐
│                            UI LAYER                                  │
│          Next.js 15 + ReactFlow Canvas + Monitoring Panel            │
│                      http://localhost:3000                           │
└─────────────────────────────┬────────────────────────────────────────┘
                              │  REST + WebSocket
┌─────────────────────────────▼────────────────────────────────────────┐
│                      API + RUNTIME LAYER                             │
│               FastAPI + LangGraph 1.0 + APScheduler                  │
│                                                                      │
│   Genesis Build Pipeline:                                            │
│   [Architect] → [Decomposer] → [Builder] ↔ [Critic] → [Validator]   │
│                                                          → Human ✓  │
│                                                                      │
│                      http://localhost:8000                           │
└─────────────────────────────┬────────────────────────────────────────┘
                              │  SQLAlchemy async + Redis pub/sub
┌─────────────────────────────▼────────────────────────────────────────┐
│                       PERSISTENCE LAYER                              │
│                PostgreSQL + Redis + Qdrant Cloud                     │
└──────────────────────────────────────────────────────────────────────┘
```

Infrastructure via `docker compose up` (PostgreSQL + Redis + Qdrant). App runs directly via `uvicorn` + `npm run dev`.

---

### Genesis Build Pipeline

```
Human Intent → Telegram
      │
      ▼
 [Architect Agent]        Designs multi-agent topology from intent
      │
      ▼
 [Decomposer Agent]       Breaks design into executable tasks per agent
      │
      ▼
 [Builder Agent] ◄────────────────────────┐
      │                                   │  feedback loop
      ▼                                   │  (up to 3 iterations)
 [Critic Agent]  ──── not approved ───────┘
      │
      │ approved
      ▼
 [Validator Agent]        Safety checks, cost estimate, final report
      │
      ▼
 Human Approval (Telegram inline keyboard: Deploy / Cancel / Details)
      │
      ▼
   Live System            Deployed workflow runs on APScheduler
```

---

## Why LangGraph 1.0

**OpenClaw** is designed for always-on single agents with SOUL.md/MEMORY. Genesis needs to generate new StateGraphs programmatically at runtime. OpenClaw does not support this.

**CrewAI** has a fixed role-based crew definition. Too opinionated to generate dynamically. Builder Agent would fight the framework on every generation.

**AutoGen** uses a GroupChat model that is conversational, not graph-based. No visual canvas mapping. No durable state.

**LangGraph 1.0** exposes its execution model as a programmable StateGraph that can be constructed, compiled, and run entirely in code at runtime. Canvas nodes map 1:1 to LangGraph nodes. Canvas edges map 1:1 to LangGraph edges. What the user sees IS what executes. No translation layer. Only framework in the list that makes Genesis possible.

---

## Pre-Built Templates

### PR Guardian

**Intent:** "Monitor our GitHub repo. When any PR changes an API endpoint — adds, removes, or modifies parameters — detect it, post a diff summary to Telegram, block merge until approved."

**Builds:** PR Watcher → Contract Diff → Risk Assessor → Briefing Agent → Telegram Gateway

---

### Signal Scout

**Intent:** "Every Monday at 8am, scan my top 3 competitors changelogs, job postings, and G2 reviews. Brief me on the 3 most important signals I should act on this week."

**Builds:** 3 Watcher Agents → Pattern Agent → Prioritizer → Briefing Agent (runs weekly via APScheduler)

---

## Adding a New Template

1. Send the intent to your Genesis instance via Telegram
2. Genesis builds and validates the workflow
3. Export: `GET /api/workflows/{id}/export`
4. Save JSON to `backend/genesis/templates/your_template.json`
5. Add entry to `TEMPLATES` list in `backend/genesis/api/templates.py`

---

## Adding a New Messaging Channel (Slack, WhatsApp, Discord)

1. Create `backend/genesis/channels/slack.py`
2. Implement `ChannelBridge` abstract class — 5 methods: `send_message`, `send_approval_request`, `handle_callback`, `format_report`, `format_build_progress`
3. Register in `backend/genesis/channels/__init__.py`: `CHANNELS["slack"] = SlackBridge`
4. Add credentials to `.env`
5. Set `ACTIVE_CHANNEL=slack` in `.env`

---

## Tech Stack

| Layer | Technology | Why |
|---|---|---|
| Agent Runtime | LangGraph 1.0 | Programmable StateGraph — enables dynamic generation |
| Backend | Python 3.12 + FastAPI | Async-native, LangGraph is Python, zero glue |
| Canvas | ReactFlow @xyflow/react MIT | Node/edge model maps 1:1 to LangGraph StateGraph |
| Frontend | Next.js 15 App Router | Vercel deployment, co-located API routes |
| Real-time | WebSocket + Redis pub/sub | Event bus for canvas live updates, monitor stream |
| Primary DB | PostgreSQL 16 | ACID for workflow state, APScheduler job store |
| Vector Memory | Qdrant Cloud | Pattern learning, same API local and cloud |
| Code Sandbox | Modal.com | Isolated execution of generated workflows |
| Messaging | Telegram python-telegram-bot v21 | Zero-friction setup, async-native |
| Scheduling | APScheduler + PostgreSQL job store | Survives container restarts |

---

## Running Tests

```shell
cd backend && source .venv/bin/activate
pytest tests/ -v
pytest tests/unit/ -v
pytest tests/e2e/ -v --timeout=60
```

---

## Deploy Online

See [DEPLOYMENT.md](DEPLOYMENT.md) for Vercel + Railway deployment (~$20/month).

---

## Impact Metrics

- **Time from intent to deployed system:** ~4 minutes
- **Human actions required:** 3 (send intent, review Validator report, tap approve)
- **Lines of config written by human:** 0
- **Agent systems buildable:** unlimited

---

## Project Structure

```
genesis/
├── setup.sh / start.sh / stop.sh
├── docker-compose.yml          (PostgreSQL + Redis + Qdrant only)
├── .env.example
├── backend/
│   ├── main.py
│   ├── genesis/
│   │   ├── agents/             (Architect, Decomposer, Builder, Critic, Validator, Memory, Monitor)
│   │   ├── api/                (agents, workflows, runs, genesis, templates, websocket)
│   │   ├── channels/           (telegram, base — add Slack/WhatsApp here)
│   │   ├── models/             (Agent, Workflow, Run, Message, GenesisBuild)
│   │   ├── templates/          (pr_guardian.json, signal_scout.json)
│   │   └── utils/              (checkpointer, redis_client, scheduler, model_router, logger)
│   └── tests/                  (unit, integration, e2e)
└── frontend/
    ├── app/                    (canvas, monitor, history, templates pages)
    ├── components/             (canvas, panels, shared, ui)
    └── design-system/          (tokens.css)
```
