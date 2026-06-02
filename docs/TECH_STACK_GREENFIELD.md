# Genesis — Greenfield Tech Stack (designed from zero, 5-year horizon)

*The current stack was built in 2 days as a proof-of-concept. Nothing here is
sacred. This is the answer to the real question: if I started clean today,
designing for the future and for WordPress-scale self-host — what would I choose,
and what would I do DIFFERENTLY from the obvious default?*

*This supersedes the earlier "keep ~90%" memo, which anchored on what exists
rather than what's best. Researched 2026-06.*

---

## The uncomfortable headline

**The obvious default — "AI platform ⇒ Python core ⇒ LangGraph ⇒ Postgres" — is
wrong for THIS product.** Not because the pieces are bad, but because they
optimize for the wrong constraint. Your hardest constraint is **trivial self-host
at WordPress scale + everything pluggable**. Two pieces of the default actively
fight that:

- **Python as the *core*** → its packaging/dependency story makes "download and own
  it" painful (interpreter + C libs + venv hell vs. a single static binary).
- **LangGraph as the *spine*** → couples your core's execution model to another
  project's roadmap. *Every serious self-host platform — n8n, Dify, Coze — built
  their OWN engine instead of depending on LangChain. That's not a coincidence.*

The contrarian-but-evidenced answer: **a Go (or TS) single-binary core + your own
lean orchestration engine + durable execution via DBOS-on-Postgres + Postgres-for-
everything + everything-else-pluggable.** Python is invited as an *optional guest*
(agent workers), not seated at the head of the table.

---

## The decision that reframes everything: modular by default ("bring your own")

You said it directly: *let the customer add options when needed — bring any GPT,
any Qdrant, any plugin, any concept, even custom.* **This isn't a feature; it's the
architecture.** It means the core must own as little as possible and define
**clean interfaces (ports)** for everything swappable. The WordPress parallel is
exact: a small, owned core + an open set of slots others fill.

The swappable slots (each a documented interface, with a simple default that ships
in the box):

| Slot | Default (in the box) | Bring-your-own |
|---|---|---|
| **Model provider** | one cheap default (Claude/GPT/local) | any — OpenAI, Anthropic, Gemini, Ollama/local, Bedrock, custom endpoint |
| **Vector store** | pgvector (Postgres) | Qdrant, Pinecone, Weaviate, custom |
| **Tools / capabilities** | first-party tool set | **any MCP server**, custom tool, any plugin |
| **Durable backend** | DBOS-on-Postgres | Temporal / Restate (enterprise scale) |
| **Queue** | pgmq (Postgres) | Redis/BullMQ, SQS, custom |
| **Channel** | Telegram | Slack, WhatsApp, web, email, custom bridge |
| **Agent runtime** | own engine | LangGraph / Mastra / PydanticAI as importable runtimes |
| **Auth / storage / etc.** | local default | enterprise SSO, S3, etc. |

**The rule:** the core depends on *interfaces*, never on a specific vendor. A solo
self-hoster runs all defaults (one binary + Postgres). An enterprise swaps any slot
without forking. *"Bring any plugin or concept like a tool"* = MCP servers + a
plugin interface; *"bring your own GPT/Qdrant"* = the model/vector slots. This is
how single→enterprise lives on one core.

---

## 1. Runtime language — "Python because LangChain" is a trap (for the core)

Python's dominance is a **library** moat (model SDKs, LangChain ecosystem) that
lives in the *agent execution layer* — NOT in the orchestration core, API server,
scheduler, or channels. Conflating the two is the mistake.

What the serious self-host platforms actually chose for their **core**:
- **Coze (ByteDance): Go** microservices + React/TS — explicitly for high-
  concurrency + clean self-host (Apache-2.0, download-and-own).
- **n8n: TypeScript/Node** core — ships via Docker, NPX, *and* local install.
- **Dify: Python/Flask** — and notably the *only* one whose self-host is
  Docker-Compose-multi-container, never a single binary.

**Self-host weighs decisively against a Python core.** Go binaries are static and
self-contained (`./genesis` and you're running). Python must ship the interpreter +
C libraries and fights you with venvs/Conda/freezing — for a non-expert on a cheap
VPS, that's the difference between owning it and filing a support ticket.

**TypeScript's real edge:** one language + one set of types across runtime +
frontend + SDK — which matters enormously *because others build on your platform*
(the WordPress-plugin analogy). Mastra validates the TS-agent thesis (~20K stars in
18 months, 300K weekly downloads, 1.0 Jan 2026). Caveat: LangGraph.js trails Python
by weeks per release — TS does *not* get you Python's ecosystem parity.

**Verdict — polyglot:**
- **Core = Go *or* TypeScript single binary.** Choose **Go** if the priority is the
  cleanest single-binary self-host + fan-out concurrency (Coze's reasoning).
  Choose **TS** if the priority is third-party extensibility (shared types/SDK
  across the whole platform — the stronger "WordPress for agents" bet).
- **Python = optional, sandboxed agent-worker runtime.** You get its ecosystem
  *without* a Python core.
- **Rust** only for a hot path you've actually measured. Premature for v1.

*My lean: **TypeScript core**, because "a platform others build on" is your thesis,
and one-language-one-types across core + canvas + plugin SDK is the multiplier that
makes a third-party ecosystem actually happen.*

---

## 2. Orchestration — build your own lean engine; don't make LangGraph the spine

The signal is screaming: **n8n, Dify, AND Coze each built their own engine** rather
than depend on LangChain/LangGraph. ByteDance wrote **Eino** ("LangGraph for Go") —
a typed graph engine that draws from LangChain/Google ADK but deliberately doesn't
build on them.

Why: a platform whose **core value is generating + running workflows** cannot
subordinate its execution model to another project's roadmap. Documented LangGraph
risks: frequent interface changes, over-abstraction, per-step latency/token tax.
LangGraph 1.0 (Oct 2025) is genuinely good *as a library a user's agent imports* —
but that's the boundary: **fine as one supported agent runtime; wrong as your
platform's spine.** Your canvas↔graph 1:1 mapping is your IP; it must be *yours*,
not a translation of LangGraph's internal state model that breaks on their next
minor.

**Verdict:** build a lean own engine (typed graph; if Go, adopt/fork Eino).
*Support* LangGraph / Mastra / PydanticAI as importable runtimes inside the worker
layer — that's the "bring your own agent framework" slot.

---

## 3. Durable execution — foundational from commit one, and the circle can be squared

Agents are long-running, fail mid-way, have side effects you can't blindly retry
(sent emails, payments), and pause for human approval for days. "A crash at step 9
of 10 means restarting from scratch." Durability is now consensus-foundational for
agents — *as fundamental as a database is to a web app.* Your product (scheduling,
human-in-the-loop, long-running channel agents) is a textbook durable workload.

**But Temporal is the wrong DEFAULT for self-host** — it's a cluster (3 services +
persistence + metrics + worker fleet, Helm-on-K8s). That kills WordPress-scale
self-host on arrival.

**The squared circle is DBOS** — a *library*, not a cluster. Import it, hand it a
Postgres connection string, decorate workflows/steps. **Zero new infrastructure.**
And critically for the polyglot plan: **DBOS ships in Go, TypeScript, Python, AND
Java with cross-language interop** — your Go/TS core and Python workers share one
durable substrate with no extra ops. Its ceiling is Postgres contention (~few-
thousand transitions/sec); beyond that, an enterprise tenant swaps in Temporal/
Restate *behind the same interface* (slot #4 above).

**Verdict:** durable execution in from commit one, on **DBOS-over-Postgres**, behind
an interface so hyperscale can swap the backend without a fork.

---

## 4. Data layer — Postgres-for-everything (the self-host story itself)

One Postgres = system-of-record (JSONB) + **pgvector** (embeddings) + **pgmq**
(queues as native tables) + LISTEN/NOTIFY (pub/sub) + DBOS workflow state. One
install, one backup, one connection string. *That is the self-host story.*

When it breaks (be precise, don't over-worry): pgvector is comfortable to ~10M
vectors, degrades past 10–20M; pgmq contends at very high throughput. Mitigation:
keep vector store and queue **behind interfaces** so a tenant swaps in Qdrant /
Redis / SQS without touching the core — exactly your "bring your own Qdrant" point.

**Verdict:** Postgres-as-the-one-datastore for v1 and the vast majority of
deployments; everything heavy is a pluggable slot, not a default.

---

## 5. Multi-tenancy — design it in from the first schema (cheap now, brutal later)

For single→enterprise on one core, tenancy must be in the **first commit**: RLS
pool model, `tenant_id` on every row, a session variable driving Postgres row-level
security. **The single-user case is the degenerate multi-tenant case** — the laptop
install is simply *tenant-of-one*; the solo user never notices; the enterprise
flips on tenant provisioning + per-tenant auth.

Retrofitting tenancy is where products bleed time and leak data (RLS silently skips
superusers; thread-local tenant context bleeds across requests; policy recursion
without `SECURITY DEFINER`) — all *retrofit* bugs discovered under audit pressure.

**Verdict:** tenant-of-one from day one, RLS pool model. Non-negotiable.

---

## 6. Packaging — this is the actual moat, and language gates it

WordPress won on trivial hosting. The ownership ladder, easiest → most-scalable:
1. **Single static binary** (`./genesis`) — cleanly only with **Go/Rust** (Coze's
   exact reasoning); Python can't do this cleanly.
2. **Single Docker image** (binary + bundled Postgres) — one-container demo.
3. **Docker Compose** (app + Postgres) — realistic production self-host (what Dify/
   Coze ship).
4. **Helm/K8s** — enterprise tier only.

**Postgres-for-everything + DBOS-as-library + a Go/TS single-binary core collapses
the whole runtime to one process + one database.** No Temporal cluster, no Redis,
no Kafka, no separate vector DB, no Python venv. That's the leanest footprint
physically possible for this feature set — and only reachable by rejecting the
Python+LangGraph+Temporal default.

---

## Synthesis — the greenfield stack

| Layer | Choice | Why |
|---|---|---|
| **Core runtime** | **TypeScript single deployable** (Go if single-binary self-host is the top priority) | one language/types across core+canvas+SDK = a real third-party ecosystem; the "platform others build on" bet |
| **Orchestration** | **Own lean typed engine** | n8n/Dify/Coze all did this; canvas↔graph is your IP |
| **Durable execution** | **DBOS on Postgres**, commit one, behind an interface | library not cluster; multi-language; trivially self-hostable; Temporal as enterprise swap |
| **Data** | **One Postgres**: JSONB + pgvector + pgmq + NOTIFY + DBOS | one install/backup = the self-host story |
| **Multi-tenancy** | **RLS pool, tenant-of-one from day one** | retrofitting is the brutal, leaky path |
| **Everything swappable** | **ports + adapters**: model, vector, tools(MCP), durable, queue, channel, agent-runtime | "bring your own GPT/Qdrant/plugin/custom" — the modularity you asked for |
| **Agent workers** | **pluggable, polyglot, optional** (Python LangGraph/PydanticAI, or TS Mastra) | Python's ecosystem *without* a Python core |
| **Packaging** | binary → Docker image → Compose → Helm | the WordPress-grade adoption lever |
| **Frontend** | Next.js + ReactFlow | still the canvas standard; shares types if core is TS |

**What's DIFFERENT from the obvious default:**
1. **Core is NOT Python** — Python becomes an optional sandboxed worker runtime, never the spine. (Packaging tax on the #1 goal.)
2. **Do NOT build on LangGraph** — build your own thin engine; *support* LangGraph/
   Mastra/PydanticAI as importable runtimes (a swappable slot).
3. **Durable execution from commit one** via DBOS-on-Postgres (durable *and* zero-
   infra), not Temporal, not bolted on later.
4. **Postgres is the only datastore by default** — vector/queue/durable behind
   interfaces so enterprise swaps pieces without forking.
5. **Multi-tenancy (RLS, tenant-of-one) in the first schema.**
6. **Everything is a port** — model, vector, tools, channel, durable backend, agent
   runtime all swappable. *The core owns as little as possible.*

The one thing kept from the default is **Postgres** — kept *harder*, made to do
everything. The reflex to abandon is "AI platform ⇒ Python core ⇒ LangGraph."

---

## Honest caveats (so this isn't overconfident)

- **Maturity risk:** Mastra (~18 months) and DBOS are younger than LangGraph/
  Temporal. Adopt them where the self-host win justifies it, and keep the worker +
  durable layers behind interfaces so a swap is cheap.
- **This is a rewrite, not a refactor.** The current 2-day PoC is Python/LangGraph.
  Moving the *core* to TS/Go is a from-scratch build of the spine (the agent logic
  and prompts port over; the runtime/orchestration/persistence do not). That's a
  real cost — worth it only if the 5-year, WordPress-scale ambition is the actual
  goal (you've said it is).
- **Go vs TS is the one call I'd want your gut on** — Go = cleanest single-binary
  ownership; TS = strongest third-party ecosystem. Both beat a Python core for this
  product. I lean TS for the ecosystem; Go is the right pick if "download one file
  and run it" is the sacred property.

---

*Sources: Jimmy Song open-source agent platform comparison; Coze Studio (GitHub);
Eino (cloudwego/eino); DBOS Transact + DBOS-vs-Temporal (dbos.dev, tiarebalbi.com);
durable execution for agents (zylos.ai, kai-waehner.de); Supabase × DBOS + pgmq
(supabase.com); pgvector limits (ParadeDB, alex-jacobs.com); Mastra vs LangGraph
(particula.tech); multi-tenant RLS (thenile.dev, AWS); LangChain criticisms
(designveloper.com); Python packaging (pythonspeed.com).*
