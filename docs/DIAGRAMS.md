# Genesis — Architecture & Flow Diagrams

*Mermaid source for the system architecture, the end-to-end workflow flow, and the
agent families. Paste any block into a Mermaid renderer (GitHub renders these
natively in Markdown) to view. All three validated as correct Mermaid.*

---

## 1. System Architecture (three layers)

```mermaid
flowchart TB
    subgraph UI["UI LAYER — Next.js 15 + ReactFlow + Zustand"]
        DASH["Dashboard /"]
        CANVAS["Canvas /canvas (ReactFlow = the graph)"]
        WFS["Workflows /workflows"]
        RUNS["Run trace /runs/[id]"]
        MORE["templates · history · audit · inbox"]
    end

    subgraph API["API + RUNTIME LAYER — FastAPI + LangGraph 1.0 + APScheduler"]
        ROUTERS["REST routers: agents · workflows · runs · genesis · templates · tools · scheduler · websocket · telegram · audit"]
        BUILD["BUILD pipeline — 5 meta-agents → graph_json"]
        EXEC["EXECUTE pipeline — compile_workflow_from_json → StateGraph"]
        SCHED["APScheduler (cron jobs)"]
        TG["Telegram bot (conversational + delivery)"]
        WS["WebSocket (live trace)"]
    end

    subgraph DATA["PERSISTENCE LAYER"]
        PG[("PostgreSQL — Workflow · Run · Message · Agent · GenesisBuild · AuditLog")]
        REDIS[("Redis — pub/sub + Telegram session")]
        QDRANT[("Qdrant — agent memory vectors")]
    end

    USER["User"] -->|browser| UI
    USER -->|chat| TG
    UI <-->|REST| ROUTERS
    UI <-.->|WebSocket| WS
    TG --> BUILD
    ROUTERS --> BUILD
    BUILD --> EXEC
    SCHED --> EXEC
    ROUTERS --> EXEC
    EXEC --> PG
    EXEC -->|publish events| REDIS
    REDIS --> WS
    BUILD --> PG
    EXEC <--> QDRANT
    EXEC -->|deliver| TG
```

---

## 2. End-to-End Workflow Flow (intent → delivered result)

```mermaid
flowchart TD
    A["User describes an outcome (Telegram or web)"] --> R{"Router classifies intent"}
    R -->|ANSWER one-shot| OS["Answer directly in chat (no deploy)"]
    R -->|CLARIFY| Q["Ask a clarifying question"]
    R -->|AUTOMATE| CONF["Bot: 'Here's what I'll build… reply yes / no / refine'"]
    Q --> R
    CONF -->|yes| BUILD

    subgraph BUILD["BUILD PIPELINE (5 meta-agents, ~60s)"]
        direction LR
        AR["Architect — design topology"] --> DE["Decomposer — per-node tasks"]
        DE --> BU["Builder — graph_json + canvas_json"]
        BU --> CR{"Critic — score ≥ 80?"}
        CR -->|no, < 3 iters| BU
        CR -->|yes| VA["Validator — safety + cost"]
    end

    BUILD -->|live progress over Redis → WebSocket| CV["Canvas draws nodes as designed"]
    VA --> APPROVE["Telegram approval card: Deploy / Cancel / Details"]
    APPROVE -->|Deploy| WF["Workflow row created (graph_json stored)"]
    WF -->|if scheduled| CRON["APScheduler registers cron"]

    WF --> TRIG{"Run triggered"}
    CRON -->|cron fires| TRIG
    TRIG -->|manual / scheduled| EXEC

    subgraph EXEC["EXECUTE PIPELINE"]
        E1["compile_workflow_from_json → live LangGraph StateGraph"] --> E2["Walk nodes — each runs a ReAct loop (LLM → tools → repeat)"]
        E2 --> E3["Each step → Message row + Redis RUN_EVENTS"]
    end

    EXEC -->|live trace over WebSocket| TRACE["/runs/[id] live timeline + token/cost meter"]
    EXEC -->|terminal tool: telegram_send| DELIVER["Result delivered to user"]
    EXEC --> DONE["Run finalized — output_data · tokens · cost"]
    EXEC -.->|on failure ≤3x| REPAIR["Auto-repair → retry"]
    REPAIR -.-> EXEC
```

---

## 3. The Two Families of Agents

```mermaid
flowchart TB
    subgraph META["META-AGENTS — they BUILD the workflow (run once per build)"]
        direction LR
        M1["Architect — intent → high-level design (which agents, edges)"]
        M2["Decomposer — design → per-node tasks + system prompts"]
        M3["Builder — tasks → graph_json + canvas_json"]
        M4["Critic — quality gate, score ≥ 80? loop back ≤ 3x"]
        M5["Validator — safety + cost → Telegram approval"]
        M1 --> M2 --> M3 --> M4 --> M5
        M4 -.retry.-> M3
    end

    META -->|produces| GJ["graph_json (the workflow definition)"]
    GJ -->|compiled at runtime| RUNTIME

    subgraph RUNTIME["RUNTIME AGENTS — they DO the work (run every execution)"]
        direction LR
        R1["Agent node 1 — e.g. Researcher (tools: web_search)"]
        R2["Agent node 2 — e.g. Writer"]
        R3["Agent node 3 — e.g. Editor"]
        R4["Agent node 4 — e.g. Reporter (tools: telegram_send)"]
        R1 --> R2 --> R3 --> R4
    end

    subgraph SUPPORT["SUPPORTING AGENTS / SERVICES"]
        direction LR
        S1["Router — classify intent"]
        S2["One-shot — answer simple requests directly"]
        S3["Memory agent — recall/store in Qdrant"]
        S4["Repair agent — auto-fix a failed node"]
        S5["Monitor agent — token/cost stats"]
    end

    INTENT["intent"] --> S1
    S1 -->|simple| S2
    S1 -->|build a system| META
    RUNTIME <-.->|per node| S3
    RUNTIME -.on failure.-> S4
    RUNTIME --> S5
```

> **Each RUNTIME agent node runs a ReAct loop:** call the LLM → if it returns tool
> calls, execute the tools and feed results back → repeat (up to `max_iterations`)
> → write the node's output to `intermediate_results` → pass to the next node.

---

## The agents, explained

Genesis has **two completely different families of agents** — this is the key thing
to understand:

### Family 1 — Meta-agents (the factory). They *build* a workflow.
They run **once**, when you describe an intent. They are hard-coded into Genesis
(`backend/genesis/agents/`):

| Agent | What it does |
|---|---|
| **Architect** | Reads your intent, designs the high-level multi-agent system — which agents exist, their roles, how they connect. |
| **Decomposer** | Turns that design into concrete per-node tasks, system prompts, and input/output schemas. |
| **Builder** | Emits the actual executable `graph_json` (the LangGraph definition) + `canvas_json` (the visual). |
| **Critic** | Quality-gates the result; if score < 80 it sends it back to the Builder (up to 3 times). |
| **Validator** | Safety + cost check, then sends you the Telegram approval card. |

Output: a `graph_json` — the definition of *your* workflow.

### Family 2 — Runtime agents (the product). They *do* the work.
These are the agents *inside* the workflow the meta-agents built. They run **every
time the workflow executes**. They are not hard-coded — they're defined by the
`graph_json` (each node = one agent with its own prompt, model, and tools). Example
for a content pipeline: Researcher → Writer → Editor → Reporter. Each node runs a
ReAct loop and hands its output to the next.

### Supporting agents/services
- **Router** — classifies a new intent (ANSWER / CONVERSE / RETRIEVE / AUTOMATE /
  CLARIFY) before the build pipeline.
- **One-shot** — answers simple requests directly, no workflow.
- **Memory agent** — recalls/stores per-node conclusions in Qdrant.
- **Repair agent** — auto-fixes a node that failed, then retries (≤3×).
- **Monitor agent** — records token/cost stats per run.

---

## Did it actually work? (verified on the live deployment, 2026-06-02)

**Yes — it works.** Checked against the live Railway backend:

- **32 workflows** deployed, all `active`.
- **40 most-recent runs: ALL completed** (zero failed in the recent window).
- **Scheduled runs fired automatically on their crons** (e.g. the 09:00 and 08:00
  jobs ran today without manual triggering) — APScheduler is working.
- **Real output, not stubs:** the HackerNews AI Digest run (2026-06-02) produced a
  genuine digest of *current* stories (Anthropic/OpenAI/SpaceX IPO analysis), with a
  **53-step trace: 22 tool calls, 22 tool results, 5 agent outputs** across multiple
  nodes — real multi-agent execution with real web tool use, persisted end to end.
- **Honest behavior where data is absent:** the Lead Enrichment Bot completed but
  *flagged that it ran on demo data* (no real CRM connected) rather than fabricating
  — correct, trustworthy behavior, not a failure.

So the agent flow someone built **does work** end-to-end: build → deploy → schedule
→ run → deliver, with a real persisted trace and live cost tracking. The known
limitations (in-memory durability, no multi-tenancy, the exec/eval footguns) are
documented in CURRENT_ARCHITECTURE.md and are what the future architecture addresses.
