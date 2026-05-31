# Genesis — Product Reference Document

**Date:** May 2026  
**Status:** Active development · Core runtime operational

---

## What Is Genesis

Genesis is an AI agent orchestration platform where a user describes an outcome in plain English and Genesis automatically designs, builds, validates, and deploys a multi-agent system that runs the task autonomously.

The key distinction from workflow automation tools (Zapier, Make, IFTTT): Genesis agents *reason*. They don't just call tools — they observe results, decide what to do next, synthesize conclusions, and expose their full reasoning chain to the user on the web dashboard. The output is intelligence, not just a triggered action.

---

## Architecture Overview

```
User
  │
  ├── Next.js Frontend (port 3000)
  │     ├── Canvas (builds + ReactFlow visualization)
  │     ├── Workflows / My Agents
  │     ├── Run Detail (reasoning trace)
  │     ├── History
  │     ├── Templates
  │     ├── Audit Log
  │     └── Agent Inbox (Telegram in/out)
  │
  ├── Telegram Bot (secondary input channel)
  │
  └── FastAPI Backend (port 8001)
        ├── Genesis Build Pipeline (LangGraph meta-agents)
        ├── Workflow Executor (LangGraph runtime)
        ├── APScheduler (cron runs)
        ├── Redis pub/sub (real-time events)
        ├── WebSocket server
        ├── PostgreSQL 16
        └── Qdrant Cloud (vector store, Phase 4)
```

### Three Strict Layers

| Layer | Components |
|-------|-----------|
| **UI** | Next.js 15 App Router · ReactFlow canvas · Zustand state |
| **API + Runtime** | FastAPI · LangGraph 1.0 StateGraph · APScheduler · Redis |
| **Persistence** | PostgreSQL 16 · Redis 7 · Qdrant Cloud |

---

## The Two Pipelines

### Pipeline 1 — Genesis Build Pipeline (how workflows are created)

When a user describes their intent, Genesis runs this internal meta-agent pipeline:

```
User Intent
    ↓
Architect Agent    — defines the overall system design
    ↓
Decomposer Agent   — breaks down into discrete agent roles
    ↓
Builder Agent      — generates graph_json (nodes + edges + prompts + tools)
    ↓
Critic Agent       — reviews quality, approves or sends back to Builder (max 3 iterations)
    ↓
Validator Agent    — final safety + coherence check
    ↓
Deployed Workflow  — stored in PostgreSQL as a Workflow record
```

All meta-agents run on **Claude Sonnet 4.5** (hardcoded — not user-configurable).  
The Builder emits a `graph_json` that maps 1:1 to what ReactFlow renders on the canvas.

### Pipeline 2 — Workflow Execution (how deployed workflows actually run)

When a workflow is triggered (manually, via API, or on cron schedule):

```
WorkflowState { input_data, intermediate_results, ... }
    ↓
compile_workflow_from_json(graph_json)
    ↓ builds a LangGraph StateGraph dynamically
    ↓
For each node:
    ReAct Loop (up to 10 rounds):
        LLM call → tool calls → tool results → repeat
        On no more tool calls: agent writes conclusion
        On max rounds: forced synthesis call
    ↓
intermediate_results[node_id] = agent's final conclusion
    ↓
output_data stored on Run record in PostgreSQL
```

Every step of the ReAct loop emits a trace event via `db_writer`:
- `node_started` → Message row (type: state_update)
- `tool_called` → Message row (type: tool_call)  
- `tool_result` → Message row (type: tool_result)
- `agent_conclusion` → Message row (type: agent_output)

These appear in real-time on the `/runs/{id}` page as the reasoning trace.

---

## Frontend Pages

| Page | Route | Purpose |
|------|-------|---------|
| **Home** | `/` | Landing — start a new build or explore templates |
| **Canvas** | `/canvas` | Describe intent → watch Genesis build → ReactFlow visualization → deploy |
| **My Agents** | `/workflows` | All deployed workflows — status, schedule badge, Run Now button |
| **Run Detail** | `/runs/[id]` | Full reasoning trace for a specific run — tool calls, conclusions, output |
| **History** | `/history` | All past runs across all workflows |
| **Templates** | `/templates` | Pre-built agent templates — one-click deploy |
| **Agent Inbox** | `/inbox` | Telegram-based conversation interface (secondary channel) |
| **Audit Log** | `/audit` | Full event log of all system actions |

### Canvas Flow (step by step)

1. User types intent → `POST /api/v1/builds` 
2. Backend starts Genesis pipeline, streams `build_progress` events over WebSocket
3. Canvas shows typing indicator, then nodes appear as Builder emits each agent
4. User reviews the graph on ReactFlow canvas
5. User clicks Deploy → `POST /api/v1/builds/{id}/deploy`
6. Workflow created with `status=deployed`, `graph_json` stored

### Run Detail — Reasoning Trace

The primary content of a run page is the agent's reasoning:
- Each step is a colored card with icon
- `state_update` (indigo): "Starting..." with agent name
- `tool_call` (purple ⚙): monospace pill showing `tool_name(args)`
- `tool_result` (green ✓): expandable result box
- `agent_output` (blue 💡): expandable "Concluded:" block
- Long content is collapsed to 200-300 chars with "Show more" toggle

---

## Supported LLM Models

Each node in a workflow can independently select its model:

| Model | Provider |
|-------|---------|
| `claude-sonnet-4-5` | Anthropic (default) |
| `claude-opus-4-7` | Anthropic |
| `claude-haiku-4-5-20251001` | Anthropic |
| `gpt-4o` | OpenAI |
| `gpt-4o-mini` | OpenAI |
| `gemini-1.5-pro` | Google |
| `gemini-1.5-flash` | Google |

---

## Tools Available to Agents

### Web & Data

| Tool | What It Does |
|------|-------------|
| `web_search` | DuckDuckGo search — titles, URLs, excerpts |
| `fetch_page` | Full text of any URL (strips HTML, max 20KB) |
| `browser` | Real Chromium browser for JS-rendered pages (dashboards, LinkedIn, dynamic apps) |
| `http_request` | Any REST API — GET/POST/PUT/PATCH/DELETE with custom headers |
| `file_reader` | Read local files (config, CSVs, reports, max 50KB) |
| `code_executor` | Python in secure Modal.com sandbox — data analysis, math, transformations |

### Messaging & Delivery (secondary/tertiary)

| Tool | What It Does |
|------|-------------|
| `telegram_send` | Send to configured Telegram chat |
| `slack_send` | Post to Slack channel via webhook |
| `email_send` | Send via SendGrid or SMTP |
| `whatsapp_send` | WhatsApp via Twilio |
| `sms_send` | SMS via Twilio |
| `webhook_send` | POST JSON to any URL (Zapier, Make, n8n, custom) |

### Developer Integrations

| Tool | What It Does |
|------|-------------|
| `github_api` | GitHub REST API — PRs, issues, diffs, commits, file contents |
| `jira_api` | Jira — search, get tickets, project status, sprint data |

### Productivity

| Tool | What It Does |
|------|-------------|
| `notion_read` | Read Notion pages or search workspace |
| `calendar_read` | Google Calendar upcoming events |
| `sheets_read` | Read rows from Google Sheets |
| `sheets_write` | Write/update rows in Google Sheets |

### System

| Tool | What It Does |
|------|-------------|
| `scheduler` | Schedule a workflow on a cron expression |

**Terminal tools** (agents stop looping after calling these): `telegram_send`, `slack_send`, `email_send`, `whatsapp_send`, `sms_send`, `webhook_send`

---

## Templates

11 pre-built templates across 4 categories. One-click deploy.

### Engineering
| Template | Agents | What It Does |
|---------|--------|-------------|
| **PR Guardian** | 5 | Watches GitHub PRs for API contract changes. Detects, assesses risk, writes a full report in the dashboard. |
| **Weekly Changelog Reporter** | 3 | Every Friday: collects merged PRs, groups by type, publishes formatted changelog. |

### Intelligence
| Template | Agents | What It Does |
|---------|--------|-------------|
| **Signal Scout** | 6 | Weekly brief on top 3 competitors — changelogs, job postings, reviews. Dashboard report. |
| **Lead Enrichment Bot** | 3 | Research a company: products, pricing, contacts, ICP score. |
| **Competitor Intelligence** | 4 | Daily competitor monitoring — pricing, jobs, blog signals. Weekly summary. |
| **Market Research Assistant** | 3 | Give it any topic/company → full market brief with competitors, trends, key players. |
| **Content Researcher** | 3 | Give it a topic → trending angles, content gaps, ready-to-use writing brief. |

### Automation
| Template | Agents | What It Does |
|---------|--------|-------------|
| **Daily Standup Digest** | 4 | 9am weekdays: GitHub + Jira + Slack highlights → team standup summary. |
| **Support Ticket Triage** | 4 | Classify tickets by urgency, auto-respond to common questions, escalate critical issues. |
| **Job Scout** | 3 | Search for jobs matching your role/skills, filter by quality, return ranked curated list. |

### Ops
| Template | Agents | What It Does |
|---------|--------|-------------|
| **Infra Cost Watchdog** | 3 | Daily AWS/GCP cost monitoring — spike alerts, top cost drivers. |

---

## API Surface

All endpoints at `/api/v1/`.

### Genesis Build Pipeline
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/builds` | Start a new Genesis build from intent |
| GET | `/builds` | List all builds |
| GET | `/builds/{id}` | Get build status and output |
| POST | `/builds/{id}/deploy` | Deploy a validated build as a workflow |
| POST | `/builds/{id}/cancel` | Cancel a running build |

### Workflows
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/workflows` | Create workflow manually |
| GET | `/workflows` | List all workflows |
| GET | `/workflows/{id}` | Get workflow detail |
| PUT | `/workflows/{id}` | Full update |
| PATCH | `/workflows/{id}` | Partial update (status, name, etc.) |
| DELETE | `/workflows/{id}` | Delete workflow and all runs |
| POST | `/workflows/{id}/deploy` | Change status to deployed |
| POST | `/workflows/{id}/pause` | Pause workflow |
| POST | `/workflows/{id}/run` | Trigger immediate run |
| POST | `/workflows/{id}/schedule` | Set cron schedule (body: `{"cron_expr": "0 9 * * 1-5"}`) |
| DELETE | `/workflows/{id}/schedule` | Remove cron schedule |
| GET | `/workflows/{id}/export` | Export workflow as JSON |

### Runs
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/runs` | List all runs (filterable by workflow_id, status) |
| GET | `/runs/{id}` | Get run detail + output |
| GET | `/runs/{id}/messages` | Get full reasoning trace messages |
| GET | `/runs/{id}/output` | Get structured output payload |
| GET | `/runs/{id}/download` | Download output as file |
| POST | `/runs/{id}/rerun` | Re-run with same input |

### Templates
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/templates` | List all templates |
| POST | `/templates/{name}/deploy` | Deploy a template as a workflow |

### Agents
| Method | Path | Purpose |
|--------|------|---------|
| POST | `/agents` | Create agent |
| GET | `/agents` | List agents |
| GET | `/agents/{id}` | Get agent |
| PUT | `/agents/{id}` | Update agent |
| PATCH | `/agents/{id}` | Partial update |
| DELETE | `/agents/{id}` | Delete agent |

### Tools
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/tools` | List all tools with catalogue metadata |
| GET | `/tools/names` | List tool names only |
| GET | `/tools/{name}` | Get tool detail |

### Scheduler
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/scheduler/jobs` | List active scheduled jobs with next run times |

### Audit
| Method | Path | Purpose |
|--------|------|---------|
| GET | `/audit` | Full audit log |
| GET | `/audit/event-types` | List all event type enums |

---

## Database Schema

### `workflows`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | — |
| `name` | String | Display name |
| `description` | Text | — |
| `intent` | Text | Original user intent |
| `status` | Enum | draft / deployed / paused / failed |
| `graph_json` | JSONB | Agent graph: nodes + edges |
| `canvas_json` | JSONB | ReactFlow layout positions |
| `template_name` | String | Set if deployed from a template |
| `schedule_expr` | String | 5-field cron (null = on-demand) |
| `webhook_url` | Text | Delivered to after every run |
| `repair_count` | Integer | Auto-repair attempts made |
| `last_repair_at` | Timestamp | Last auto-repair time |

### `runs`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | — |
| `workflow_id` | UUID FK | Parent workflow |
| `status` | Enum | running / completed / failed |
| `started_at` | Timestamp | — |
| `completed_at` | Timestamp | — |
| `error` | Text | Error message if failed |
| `token_count_total` | Integer | Approximate tokens used |
| `estimated_cost_usd` | Numeric | Estimated cost |
| `repair_attempted` | Boolean | Whether auto-repair was tried |
| `output_data` | JSONB | Structured output payload |

### `messages`
| Column | Type | Purpose |
|--------|------|---------|
| `id` | UUID PK | — |
| `run_id` | UUID FK | Parent run |
| `sender_agent` | String | Node ID or "system"/"executor" |
| `receiver_agent` | String | "user"/"tool"/"system" |
| `content` | Text | Message content |
| `message_type` | Enum | state_update / tool_call / tool_result / agent_output |
| `created_at` | Timestamp | — |

### `agents`
Individual agent records linked to a workflow. Stores name, role, model_name, system_prompt, tools list.

### `audit_logs`
Full event trail. Every API action, run lifecycle event, repair, and schedule change logged here.

### `apscheduler_jobs`
APScheduler's native job store — cron job registry.

---

## Real-time System

### Redis Channels
| Channel | Events Carried |
|---------|---------------|
| `genesis:canvas_updates` | Node added/updated during build |
| `genesis:build_progress` | Build pipeline stage updates |
| `genesis:agent_messages` | Agent-to-agent messages during build |
| `genesis:monitor_stream` | System health / monitor updates |
| `genesis:system_events` | Global system events |
| `genesis:run_events` | Run lifecycle + trace events |

### WebSocket Events (frontend receives)
| Event type | Triggered by |
|------------|-------------|
| `canvas_node_added` | Builder adds a node |
| `build_progress` | Genesis pipeline stage change |
| `agent_message` | Meta-agent communication |
| `run_event` | `run_started`, `run_completed`, `run_failed`, `workflow_repaired` |
| `trace_event` | Per-step agent trace during execution |

WebSocket endpoint: `ws://localhost:8001/api/v1/ws/{client_id}`

---

## Scheduling

APScheduler backed by PostgreSQL (jobs survive restarts).

- Cron expressions: standard 5-field UTC (`"0 9 * * 1-5"` = weekdays at 9am UTC)
- Jobs named `workflow_{workflow_id}`
- Pausing a workflow does not remove the APScheduler job — use DELETE /schedule
- `GET /scheduler/jobs` returns `{workflow_id, next_run_time, cron_expr}` for each active job

---

## Auto-Repair

When a workflow run fails:
1. Genesis checks if `repair_count < 3`
2. Calls `repair_agent` — analyzes error + node intent, rewrites system prompt + tools
3. Patches `graph_json` in the database
4. Publishes `workflow_repaired` event to Redis
5. Retries the workflow with `_repair_run=True` in input to prevent repair loops

---

## Output Delivery

After every run, Genesis builds a structured output payload and:
1. Stores it in `runs.output_data` (JSONB)
2. Fires it to `workflow.webhook_url` if configured (POST with auth headers)

Output payload structure:
```json
{
  "run_id": "...",
  "workflow_id": "...",
  "workflow_name": "...",
  "status": "completed",
  "summary": "Agent's final conclusion (up to 1000 chars)",
  "agent_outputs": {
    "node_id": "Full agent conclusion (up to 4000 chars)"
  },
  "token_count": 1200,
  "estimated_cost_usd": 0.003,
  "duration_seconds": 42.1,
  "started_at": "2026-05-31T09:00:00Z",
  "completed_at": "2026-05-31T09:00:42Z"
}
```

---

## Telegram Integration (Secondary Channel)

- Users can describe an intent via Telegram → Genesis builds and deploys the workflow
- Genesis sends progress updates during build via Telegram
- After deploy, users can trigger runs by chatting
- **Policy:** Telegram is a delivery/trigger channel only. Primary output is always the web dashboard. Messaging tools (telegram_send, slack_send, etc.) are available but not the default.

---

## Current State

### What's Working
- Full Genesis build pipeline (intent → deployed workflow in ~60 seconds)
- ReactFlow canvas visualization with live node streaming
- Workflow execution with real ReAct tool loops
- Reasoning trace: every tool call, result, and conclusion visible in dashboard
- Scheduled runs (APScheduler + PostgreSQL job store)
- Manual run triggering via UI and API
- Auto-repair on failure (up to 3 attempts)
- Webhook output delivery
- 11 templates across 4 categories
- Full audit log
- Real-time WebSocket events

### What's Paused
- 13 Telegram-focused workflows (paused to stop spam, available to re-enable)
- Telegram notification on repair (best-effort, silently skipped if bot not configured)

### Roadmap (Planned)
1. **Run with parameters** — dialog for templates that need a user-supplied topic/query before running
2. **Human in the Loop** — `awaiting_approval` run status, approve/reject from dashboard
3. **Memory across runs** — Qdrant namespace per workflow, embed key facts, retrieve on next run
4. **Public run URL** — shareable trigger link, form-based input, no login required
5. **Agent collaboration** — agents that can call other deployed Genesis workflows as sub-agents
