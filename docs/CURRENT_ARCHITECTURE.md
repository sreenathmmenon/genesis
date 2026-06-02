# Genesis — Current Architecture & Workflow (as built today)

*A map of the project AS IT EXISTS NOW (the 2-day PoC, since extended). This is
descriptive — what's actually in the code — not the future design. For where it's
going, see ARCHITECT_FUTURE_PLAN.md / INTERNAL_ARCHITECTURE.md.*

---

## The one-sentence summary

> Genesis is a FastAPI + LangGraph backend with a Next.js + ReactFlow frontend:
> you describe an outcome in natural language, **five meta-agents build a real
> LangGraph workflow** (`graph_json`), you approve it, it deploys as a live
> workflow that can run **on demand, on a schedule, or via Telegram**, and every
> step streams to the UI over Redis + WebSocket and persists to Postgres.

---

## Three layers (the stack)

```
┌──────────────────────────────────────────────────────────────────┐
│  UI LAYER — Next.js 15 (App Router) + ReactFlow (@xyflow) + Zustand│
│  pages: / (dashboard) · /canvas · /workflows · /runs/[id] ·        │
│         /templates · /history · /audit · /inbox                    │
└───────────────────────────┬──────────────────────────────────────┘
              REST (fetch)   │   WebSocket (live trace)
┌───────────────────────────┴──────────────────────────────────────┐
│  API + RUNTIME LAYER — FastAPI + LangGraph 1.0 + APScheduler       │
│  routers: agents · workflows · runs · genesis(build) · templates · │
│           tools · scheduler · websocket · telegram · audit · health│
│  pipelines: BUILD (5 meta-agents)  ·  EXECUTE (compile graph_json) │
│  channel: Telegram bot (python-telegram-bot)                       │
└───────────────────────────┬──────────────────────────────────────┘
                            │
┌───────────────────────────┴──────────────────────────────────────┐
│  PERSISTENCE LAYER                                                  │
│  PostgreSQL (Workflow · Run · Message · Agent · GenesisBuild ·      │
│              AuditLog)  ·  Redis (pub/sub + Telegram session state) │
│              ·  Qdrant (agent memory vectors)                      │
└────────────────────────────────────────────────────────────────────┘
```

- **UI:** Next.js + ReactFlow canvas (canvas maps 1:1 to the LangGraph graph),
  Zustand state, talks to the backend over REST + a WebSocket for live run traces.
- **Runtime:** FastAPI app (`main.py`) mounts all routers under `/api/v1`. On
  startup (`lifespan`) it: inits the DB, connects Redis, **cleans up orphaned
  runs**, starts the **Telegram bot**, and starts **APScheduler**.
- **Persistence:** Postgres (async SQLAlchemy 2.0) is the system of record; Redis is
  pub/sub + Telegram session state; Qdrant holds per-node memory vectors.

---

## The two pipelines (this is the heart of it)

Genesis has **two distinct LangGraph graphs**, with two distinct state shapes
(`backend/genesis/agents/state.py`):

### A) The BUILD pipeline — `GenesisState` — turns intent → a workflow
Five meta-agents, wired in `compile_genesis_graph()`:

```
intent ─► Architect ─► Decomposer ─► Builder ─► Critic ──approved?──► Validator ─► awaiting_approval
                                        ▲           │ (rejected, <3 iters)
                                        └───────────┘
```

| Meta-agent | File | Job |
|---|---|---|
| **Architect** | `agents/architect.py` | intent → high-level multi-agent design (agents, layers, edges) |
| **Decomposer** | `agents/decomposer.py` | design → concrete per-node tasks + system prompts + schemas |
| **Builder** | `agents/builder.py` | tasks → the executable **`graph_json`** + **`canvas_json`** |
| **Critic** | `agents/critic.py` | quality gate; approve (score ≥ 80) or send back (≤ 3 iterations) |
| **Validator** | `agents/validator.py` | safety + cost check; sends the **Telegram approval request** with Deploy/Cancel buttons |

Result: a `GenesisBuild` row in status `awaiting_approval`, holding each agent's
output. The user approves → a `Workflow` row is created from `builder_output.graph_json`.

### B) The EXECUTE pipeline — `WorkflowState` — runs a deployed workflow
`compile_workflow_from_json()` (`agents/graph_compiler.py`) turns the stored
`graph_json` into a **real LangGraph `StateGraph` at runtime** and runs it. Each
node runs a **ReAct loop**: call the LLM → if it returns tool calls, execute tools
and feed results back → repeat (up to `max_iterations`) → store the node's output in
`intermediate_results` → pass to the next node. Conditional edges are evaluated
against the live state; terminal tools (telegram_send, etc.) stop the loop.

> The Router (`agents/router.py`) + one-shot (`agents/oneshot.py`) are recent
> additions: a new intent is classified (ANSWER / CONVERSE / RETRIEVE / AUTOMATE /
> CLARIFY) before it enters the build pipeline, so a one-shot request is answered
> directly instead of being forced into a deployed workflow.

---

## End-to-end flow: from a Telegram message to a delivered result

```
1. USER (Telegram)  ──"every morning send me HN AI stories"──►  telegram.py
2. Router classifies → AUTOMATE → bot replies "here's what I'll build… yes?"
3. USER replies "yes"  ──►  start_build_from_intent()  (api/genesis.py)
4. BUILD PIPELINE runs (Architect→…→Validator), streaming progress over Redis
   BUILD_PROGRESS → WebSocket → the /canvas page draws nodes as they're designed
5. Validator sends Telegram approval card (✅ Deploy / ❌ Cancel / 🔍 Details)
6. USER taps ✅ Deploy  ──►  _trigger_deploy()  creates a Workflow row
   → if graph has a schedule, APScheduler registers a cron job
7. RUN happens 3 ways:
     • manual:    POST /api/v1/workflows/{id}/run
     • scheduled: APScheduler fires at cron time
     • (build-from-chat is step 3–6)
8. execute_deployed_workflow()  (utils/workflow_executor.py)
     • creates a Run row (status=running)
     • compile_workflow_from_json(graph_json) → live StateGraph
     • walks nodes; each emits events via a db_writer callback:
         - writes a Message row per step (the trace)
         - publishes to Redis RUN_EVENTS → WebSocket → /runs/[id] live trace
     • 600s timeout; on failure → auto-repair attempt (repair_agent.py, ≤3x)
9. A node calls telegram_send → result delivered back to the user in Telegram
10. Run row finalized (completed/failed) with output_data, token_count, cost
```

---

## The data models (`backend/genesis/models/`)

| Model | Holds | Key fields |
|---|---|---|
| **GenesisBuild** | one build pipeline run | `intent`, `status`, `architect/decomposer/builder/validator` outputs, `critic_feedback`, `iterations`, `workflow_id` |
| **Workflow** | a deployed agent system | `name`, `intent`, `status`, **`graph_json`**, `canvas_json`, `schedule_expr`, `webhook_url`, `repair_count` |
| **Run** | one execution of a workflow | `workflow_id`, `status`, `started/completed_at`, `output_data`, `token_count_total`, `estimated_cost_usd` |
| **Message** | one step in a run's trace | `run_id`, `sender_agent`, `receiver_agent`, `content`, `message_type` (state_update / tool_call / tool_result / agent_output) |
| **Agent** | a configurable agent | `name`, `role`, `system_prompt`, `model_name`, `tools`, `memory_type`, `schedule`, `guardrails`, `interaction_rules`, `channel` |
| **AuditLog** | immutable event trail | `event_type`, `entity_type`, `entity_id`, `detail` |

---

## How the pieces talk (the moving parts)

- **Model router** (`utils/model_router.py`) — `get_llm(model_name)` + a fallback
  chain (Anthropic → OpenAI → Gemini on credit errors). Allowed models include
  Claude Haiku/Sonnet/Opus, GPT-4o, Gemini.
- **Tools** (`tools/implementations.py`) — ~20 tools registered: web_search,
  fetch_page, browser, http_request, file_reader, code_executor, telegram_send,
  slack/email/whatsapp/sms/webhook_send, github_api, jira_api, notion_read,
  calendar/sheets, scheduler. `get_tools_for_agent(names)` binds them per node.
  `TERMINAL_TOOLS` (the send/notify ones) stop the ReAct loop.
- **Scheduler** (`utils/scheduler.py`) — APScheduler with a SQLAlchemy job store
  (jobs survive restarts); cron jobs call `execute_deployed_workflow`.
- **Channels** (`channels/telegram.py`) — the Telegram bot: Redis-backed
  conversational state (survives redeploys), the yes/no/refine flow, inline Deploy
  buttons, and `telegram_send` delivery.
- **Redis channels** — `CANVAS_UPDATES`, `BUILD_PROGRESS`, `AGENT_MESSAGES`,
  `MONITOR_STREAM`, `SYSTEM_EVENTS`, `RUN_EVENTS` — the backend publishes; the
  WebSocket router (`api/websocket.py`) subscribes and pushes to the browser.
- **Memory** (`agents/memory_agent.py` + Qdrant) — per-node `_recall_memory` /
  `_store_memory`: a node with `memory_type != none` recalls past conclusions from
  its Qdrant collection and stores new ones.

---

## Deployment (today)

- **Backend:** Railway — `genesis-backend-production-360a.up.railway.app`
- **Frontend:** Railway — `genesis-ai.up.railway.app`
- **Infra:** Postgres + Redis (Railway), Qdrant (cloud). `docker-compose.yml` runs
  Postgres/Redis/Qdrant locally; the app runs directly. `make setup` / `make start`.

---

## The current architecture, honestly

**What it does well today:** the build pipeline genuinely generates real LangGraph
graphs; the canvas maps 1:1 to what executes; the full run trace persists and
streams live; Telegram is a working conversational + delivery channel; scheduling,
auto-repair, and a model-fallback chain all work.

**Known limitations (the gap the future docs address):**
- Durability is **in-memory** during a run — no crash-safe resume (uses LangGraph's
  per-run compile, not a durable checkpointer).
- Two security footguns: `code_executor` runs `exec` with full builtins;
  conditional edges use `eval` (restricted builtins, but still `eval`).
- **No multi-tenancy** (no `tenant_id` / RLS) — single-owner today.
- Qdrant + Redis are hard dependencies (heavier self-host than ideal).
- Orchestration sits **on** LangGraph rather than owning the engine.

These are exactly the things the target architecture (own ledger-based engine,
manifest-as-data, MCP plugins, Postgres-for-everything, RLS, TS core) is designed to
fix — but the description above is the system as it runs **right now.**
