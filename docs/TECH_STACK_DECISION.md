# Genesis — Tech Stack Decision

*The stack question is really the architecture question. If Genesis is the
"WordPress moment for agents" — owned, self-hostable, scaling on ONE core from a
single individual to an enterprise with no fork — then the stack must serve that
span. This is the evidence-based verdict.*

*Researched 2026-06. Benchmarks/figures from cited sources.*

---

## TL;DR — the verdict

**Keep ~90% of the current stack. The biggest risk is NOT picking the wrong
language — it's accreting too many stateful services (Temporal + Qdrant + Redis +
Postgres) into a 4-service beast nobody can `docker compose up` on a laptop, which
quietly breaks the whole "owned & self-hostable" promise.**

The single highest-leverage decision: **use LangGraph's own Postgres checkpointer
as the durable execution backbone, and keep the core to Postgres + Redis + one app
image.** Make the heavy engines (Temporal, Qdrant) *optional plug-ins behind clean
interfaces* — not defaults.

---

## Why the stack IS the strategy

The "WordPress moment" requires two things that pull in opposite directions:

- **A single person must be able to `docker compose up` and own it** on a laptop or
  a $5 VPS. Every stateful service you add is a service they have to run, secure,
  back up, and understand. Complexity here = the ownership gate quietly closing.
- **An enterprise must scale on the same core** — no fork, no rewrite, no "and now
  you need the Pro architecture."

Every platform that nailed this span (n8n, Dify, Supabase, PostHog) won it the same
way: **minimize stateful infrastructure, and scale the *same image's* workers
horizontally.** That principle drives every call below.

---

## What the winning platforms actually run on

| Platform | Backend | Orchestration | DB | Queue/Worker | Frontend |
|---|---|---|---|---|---|
| **Dify** *(closest twin)* | **Python** (Flask) | own engine | **Postgres** (+Weaviate) | **Celery + Redis** | **Next.js** |
| **n8n** | Node/TS | own node engine | SQLite **or** Postgres | **BullMQ + Redis** | Vue |
| **Flowise** | Node/TS | LangChain.js | SQLite/Postgres | — | React |
| **LangGraph (LC)** | **Python** (primary) | StateGraph + checkpointer | Postgres checkpointer | own task queue | (library) |
| **CrewAI / PydanticAI / OpenAI Agents SDK** | **Python** | own | — | external (Temporal/DBOS) | — |
| **Mastra / Vercel AI SDK** | TypeScript | own | — | serverless | — |

**The pattern:** Python dominates the *agent-reasoning runtime* (LangGraph,
LangChain, CrewAI, PydanticAI, OpenAI Agents SDK, Dify's backend). TypeScript
dominates the *integrations/workflow-tool* layer (n8n, Flowise) — because their
value is connecting SaaS APIs and rendering a canvas, not running model-reasoning
loops.

**Dify independently arrived at Genesis's exact stack** — Python + Postgres +
Celery/Redis + Next.js — and scales from self-host to enterprise. That's strong
external validation that the current choice is right.

---

## The key fork: Python vs TypeScript for the runtime

This is the one decision that, if wrong, is a multi-month rewrite. The 2025-26
trend: TypeScript is genuinely surging for greenfield, type-safe, serverless agent
apps (LangGraph.js hit production parity mid-2025; Mastra is the poster child). The
pull is a TS monorepo sharing types with the Next.js frontend.

**Verdict: stay Python.** For *this specific product*:

1. **Genesis's differentiator is generating real LangGraph code at runtime.** The
   richest, most-documented, most-example-covered LangGraph surface is Python.
   Generating Python LangGraph is materially lower-risk than generating TS.
2. **Modal.com sandbox execution** (the generated-code runtime) is Python-native.
3. **Dify — same goals — runs Python and scales fine.**
4. The TS monorepo benefit (shared types) is recoverable *without* a rewrite:
   generate typed TS API clients from FastAPI's OpenAPI schema
   (`openapi-typescript`). The frontend gets typed API access; the runtime stays
   Python.

A TS rewrite would be a fork-in-disguise of the roadmap — the exact thing the
"one core, no fork" goal forbids. Don't.

---

## How "laptop AND enterprise" works on one core

The proven pattern (n8n's "queue mode", Dify's worker pool):

- **One codebase, one container image, environment-driven topology.**
- **Single user** → run web + worker + scheduler in *one* process/container.
- **Enterprise** → run the *same image* with different entrypoints (`web`,
  `worker`, `scheduler`) and scale worker replicas horizontally. All share one
  Postgres + one Redis.

**On SQLite-for-single-user:** tempting, but *don't*. Supporting two DB dialects
doubles the migration/testing surface and breaks "no fork" (pgvector, JSONB-heavy
checkpointers, Postgres-native queues won't run on SQLite). Postgres runs fine in a
small container on a laptop. The honest single-user story is **"`docker compose up`
= app + Postgres + Redis"** — exactly what Dify and Supabase ship.

---

## The highest-leverage decision: durable execution

Agents are long-running, fail mid-way, need retries and human-in-the-loop pauses.
The instinct is to reach for Temporal. **Resist it.**

- **LangGraph's checkpointer + PostgresSaver is genuinely durable** — writes a
  checkpoint on every node transition, survives restarts, natively supports
  `interrupt`/resume for human-in-the-loop. LangGraph 1.0 (Oct 2025) made this
  production-grade. *It's already in the runtime — it costs nothing new.*
- **Temporal/Restate** add host-crash-level durability but at real operational cost
  (a separate cluster, verbose model, awkward fit for dynamic LangGraph routing) —
  directly fighting the "runs on a laptop" goal.
- **The one real LangGraph limit:** checkpoints save state *between* nodes, not
  *inside* one. A 10,000-item loop inside a single node that dies halfway loses
  intermediate work. (Mitigate by keeping nodes small — already the design.)
- **2026 consensus:** if workflows run in minutes, failure rate is low, and you're
  in the Python/LangChain ecosystem, **LangGraph alone is the right answer.**

**The decision:**
- **Backbone = LangGraph PostgresSaver checkpointer.** Free, no new infra, keeps the
  laptop story intact.
- **Keep Celery/Redis** (or move to a Postgres-native queue like `pgmq` to drop
  Redis too) for *triggering and fan-out* of runs — the "enqueue → worker picks it
  up" pattern.
- **Define a clean "durable task" seam** so an enterprise tenant can later plug in
  Temporal or **DBOS** (DBOS stores workflow state in Postgres — no new cluster, so
  it fits the self-host story far better than Temporal) for rare ultra-long
  workflows. Build the seam; do **not** build the backend now.

---

## Consolidate to "just Postgres" — drop Qdrant

Second-highest-leverage change.

- **pgvector (+ pgvectorscale) beats a separate Qdrant** for Genesis's use case
  (agent memory/retrieval). Benchmarks: Postgres+pgvector+pgvectorscale hits ~10×
  higher throughput than Qdrant at 99% recall, sub-100ms latency, and is the clear
  winner under ~5M vectors, when you need transactional consistency, and when you
  want embeddings + metadata in one table (no sync bugs).
- **Qdrant only wins decisively at 10M+ vectors needing sub-5ms ANN** — which a
  self-hostable single→mid platform rarely hits per tenant.
- **The self-host clincher:** adding vectors to Postgres is *one migration*, not a
  new service. Qdrant always needs its own deployment.

**Decision: drop Qdrant from the default; use pgvector. Keep a pluggable
vector-store interface** so a 10M+-vector enterprise tenant can attach Qdrant later
— no fork. This takes `docker compose` from **4 stateful services → 2** (Postgres +
Redis). Directly serves the goal.

---

## Frontend / canvas — no change

**Keep Next.js 15 + React Flow (@xyflow).** Still the de-facto standard for
node-graph builder UIs in 2026: DOM-based nodes (rich forms/buttons inside nodes),
selective re-rendering, actively maintained. Alternatives (JsPlumb, Konva/Fabric)
are lower-level or less React-idiomatic with no compelling reason to switch. The
"what ReactFlow renders IS what executes" framing is exactly right and well
supported.

---

## Final scorecard

**KEEP (already correct):**
- Python 3.12 / FastAPI — right runtime for a platform that *generates LangGraph
  code*; validated by Dify.
- LangGraph as the orchestration engine.
- PostgreSQL as the system of record.
- Redis for cache / pub-sub / queue broker.
- Next.js 15 + React Flow for the canvas.

**CHANGE / DO:**
1. **Drop Qdrant → pgvector** (+ pgvectorscale for scale). Keep a vector-store
   interface for an optional Qdrant enterprise plug-in. → 4 services → 2.
2. **One Docker image, selectable roles** (web / worker / scheduler) + true
   one-command `docker compose up`. Single user = all roles in one container;
   enterprise = scale worker replicas. → same core, single→enterprise.
3. **LangGraph PostgresSaver = durable backbone.** Celery/Redis (or pgmq) for
   triggering/fan-out. A "durable task" seam for optional Temporal/DBOS later —
   don't build it now.
4. **Generate typed TS clients from FastAPI OpenAPI** → most of the "shared types"
   benefit without a runtime rewrite.

**THE ONE DECISION:**
> Make **LangGraph's checkpointer + Postgres the durable execution backbone, and
> keep the core to Postgres + Redis + one app image.** Resist Temporal and a
> separate vector DB as *defaults*; make them optional plug-ins behind clean
> interfaces. Minimizing stateful infrastructure is *how* every winning
> self-hostable platform earns the laptop→enterprise span. This keeps the stack
> ~90% intact, removes one stateful service, and turns durability from a "buy
> Temporal" problem into a "use what LangGraph already gives you" feature.

---

## How this maps to the democratization gates (from THE_GENESIS_MOMENT.md)

- **Ownership** → fewer services + self-hostable Postgres core = a person can
  genuinely own and run it. Every dropped service widens ownership.
- **Low floor / high ceiling, one core** → one image, role-scaled. No fork.
- **No cliff** → the same Postgres core grows from laptop to enterprise; heavy
  engines attach *behind interfaces* without migrating off the core.
- **Trust + predictable cost** → fewer moving parts = fewer failure modes = easier
  to make "what did it do, why, what did it cost" legible. Simplicity is a trust
  feature.

The simplest stack that spans single→enterprise *is* the most democratizing stack.

---

*Sources: Dify self-host (docs.dify.ai), n8n queue mode (docs.n8n.io), LangGraph
durable execution (docs.langchain.com), LangGraph vs Temporal (agentmarketcap.ai,
Medium/data-science-collective), DBOS (dbos.dev), pgvector vs Qdrant (tigerdata.com,
encore.dev), agent framework trends (speakeasy.com), React Flow (reactflow.dev).*
