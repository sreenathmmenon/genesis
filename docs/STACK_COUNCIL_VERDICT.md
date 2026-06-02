# Genesis Stack — Council Verdict (the decision)

*A five-expert council (infra architect, OSS founder, AI researcher, enterprise
CTO, pragmatist) argued the greenfield stack from their own angles, cross-examined
each other adversarially, then a chief architect synthesized. This is the
authoritative decision. It supersedes the earlier greenfield memo on one major
point — the core language — and surfaces something the prior research missed
entirely.*

*Framing held throughout: AI writes the code in days, so optimize for what's RIGHT
for the 10-year arc, not what's cheap to build.*

---

## THE ONE BET (if only one decision could be made)

> **Generated agent logic must be DATA — a typed, versioned, signed declarative
> graph IR, interpreted by a fixed, audited runtime that executes NO generated
> code.**

All five experts converged on this *after seeing the code*. It is the moat:
- It neutralizes two **live security holes** in the current PoC (see below).
- It is what makes **trust legible to a non-expert** and **auditable to a CISO** —
  the gate that decides agent adoption.
- It lets the model, the framework, and even the host language be swapped **without
  a rewrite** — the IR + run-ledger is the only thing that compounds across model
  generations.

Get this right and language/packaging/store become tractable adapter choices. Get
it wrong and no amount of elegant orchestration earns the WordPress moment or the
enterprise signature.

---

## The thing the prior research missed: two live vulnerabilities

The council read the actual code and found the current PoC has **two
remote-code-execution / injection paths** that fail every security review:

1. **`exec(code, ...)` with full builtins** in `tools/implementations.py` — the
   code-executor tool runs generated code with full Python builtins.
2. **`eval(condition_expr, ...)`** in `graph_compiler.py` — conditional edges are
   evaluated with Python `eval` on spec-authored strings.

These aren't 5-year concerns — they're present-tense. **This is why "agent logic =
data, never executed code" is the #1 invariant, not a nice-to-have.** Fix:
- Replace `exec` → a fixed, allowlisted tool registry + out-of-process/sandboxed
  execution (Modal / WASM).
- Replace `eval` → a typed, restricted expression evaluator (parse, don't eval).

---

## The decisions

### Core language → **Python 3.12 + FastAPI** (a reversal — and an honest one)

The greenfield memo leaned TS/Go. **The council reversed it, and every expert who
started on Go moved to Python after seeing the code.** Why:

- The orchestrator is **already a thin IR-walker isolated to ~2 files**; LangGraph
  is a removable adapter, not a deep spine. So owning the engine is cheap *in any
  language* — which removes the main reason to switch.
- Every node's hot path is **model calls, MCP clients, embeddings, tool glue** —
  overwhelmingly Python-first. A Go core forces a chatty IPC seam at exactly the
  layer evolving fastest.
- In an **AI-writes-the-code** world, the bottleneck is MCP/eval/model-SDK
  availability (Python-first) and generated agent code is most idiomatic in Python.
- **The CTO's real objection was never the language — it was `exec`/`eval`.** That's
  fixable in Python. A lean Python core with the no-codegen invariant passes his
  review; a Go core that kept a leaky sandbox would not.

**Honored dissent:** the enterprise CTO still prefers a Go static binary for a
minimal-CVE, signed-SBOM attack surface. The resolution: Python core for everyone;
a **Go/Rust supervisor binary as the artifact for the air-gapped/regulated tier**
only. Because the IR/ledger schema is the contract, a future Go reimplementation of
the interpreter is possible *without breaking the compounding asset*. **Language is
negotiable; the no-codegen invariant and the IR/ledger schema are not.**

### Orchestration → **own a thin interpreter over the graph IR; demote LangGraph to one optional adapter**

The canvas-maps-1:1-to-graph promise must be *owned*: the executing graph has to be
Genesis's own first-class persisted artifact, not LangGraph's internal pregel
state. The interpreter does graph-walking only (fan-out, conditional edges,
human-in-the-loop pause/resume, cost accounting); durability/retries lean on DBOS.
**Honest note (conceded by the OSS founder + infra architect):** today
`compile_workflow_from_json` translates `graph_json` *into* a LangGraph StateGraph
and `.compile()`s it — so de-LangGraphing is a real piece of work, not a config
flip. Accepted deliberately, because build-time isn't the constraint.

### Durable execution → **DBOS-on-Postgres semantics, behind a port; reject Temporal day-1**

Verified reality: **durability doesn't exist today** — deployed runs use an
in-memory `MemorySaver` + best-effort `redis.publish`. No crash-safe resume, no
replay. So this is the **highest-value missing build**, not an afterthought. Every
node step becomes an idempotent, checkpointed row keyed by step-id → exactly-once-
on-retry + replay, from the same Postgres you already back up. Temporal/Restate are
correct for hyperscale managed cloud but add a second clustered stateful system
that breaks the single-Postgres / `pg_dump`-is-my-backup mandate. DBOS's maturity
risk is contained by the port — swap the adapter without touching the IR/ledger.

### Data → **Postgres-for-everything by default**

pgvector (memory) + pgmq or LISTEN/NOTIFY (queue + pub/sub) + JSONB (IR +
run-ledger) + RLS (tenancy). Verified self-host tax: compose ships
postgres+redis+qdrant; `requirements.txt` hard-pins redis + qdrant-client; **Qdrant
is imported inline in the `graph_compiler` hot path.** One stateful dependency is
the difference between WordPress-scale adoption and a DevOps project — and the
enterprise win (one thing to encrypt, key-rotate, back up, prove residency for,
keep in SOC2 scope). Qdrant/Redis demoted to swappable adapters, never the default.

### Tenancy → **per-tenant Postgres RLS, tenant-of-one from row zero** (non-negotiable)

Verified: **zero tenant/org_id/RLS references in the backend today.** This is the
one property you genuinely **cannot retrofit** cleanly onto a live multi-tenant
dataset. Tenant-of-one is just the degenerate case of the same RLS model — so it
serves the whole "one person → enterprise on one core, no fork" span. Ranks just
below killing codegen-execution.

### Packaging → **two tiers, one core**

- **Primary (solo/SMB):** a single Docker image with embedded/bundled Postgres →
  `docker run` is the WordPress-grade install for the Docker-capable majority.
- **Secondary (air-gapped/regulated):** a signed static supervisor binary + SBOM +
  reproducible build — what passes vendor security review.
- Compose-of-six-services is explicitly **not** the product; k8s/Helm is a customer
  choice, never imposed. Honest tension: a Python core can't be a pure static
  binary, so the binary tier is a supervisor wrapping the runtime — acceptable
  because no-codegen + single-Postgres + signed-IR are what actually gate the
  security review, not the host language.

### Modularity → **ports/adapters for everything, one default in the box**

model · vector · tools(MCP) · channel · durable · queue — each a port with a sane
default compiled in. Defaults: chosen LLM via model-router port, pgvector, MCP +
out-of-process sidecars for tools (community node-types are **DATA-described, never
arbitrary code in every host's trust boundary**), Postgres queue, DBOS durable,
Telegram channel. **The plugin contract — language-neutral node-types + MCP tools —
IS a first-class product surface** (the OSS founder's strongest point): Python
contributors extend without touching the core, and the trust boundary stays intact.
**The IR schema + run-ledger schema are the stable, versioned public API;** adapters
churn, the schema is governed like an API.

---

## Sequencing (by irreversibility + trust-gating, NOT by effort)

Because AI writes the code fast, order by what's *ruinous to defer*, not what's hard:

1. **Kill both code-execution paths** — `exec(full-builtins)` → allowlisted registry
   + sandbox; `eval(condition_expr)` → typed restricted evaluator. *Present-tense
   vulnerability; the absolute adoption gate.*
2. **Add `tenant_id` + RLS from row zero** across all models + the ledger. *Cannot be
   retrofitted.*
3. **Freeze + version the IR schema + a signed, append-only per-node run-ledger** as
   the public API.
4. **Build durable execution** (DBOS-on-Postgres step-checkpointing) to replace
   MemorySaver. *Highest-value missing capability.*
5. **Collapse data to Postgres-by-default**, demoting Qdrant + Redis behind ports.
6. **Extract the in-house IR interpreter**, demote LangGraph to an adapter.
7. **Defer:** static-binary supervisor packaging, Temporal/Restate adapters,
   dedicated-store adapters — until a specific tenant's scale/attestation forces it.

Steps 1–3 ship essentially together: cheap now, ruinous later.

---

## The dissents (not papered over)

- **Host language (enterprise CTO, infra-architect sympathy):** a statically-compiled
  Go core gives a minimal-CVE, no-interpreter, signed-binary-with-SBOM surface that
  turns a 6-month security review into 2 weeks; Python's pip supply-chain + runtime
  dynamism is a standing liability no amount of fixing `exec`/`eval` fully erases.
  **Ruling:** Python core, betting that no-codegen + single-Postgres + signed-IR +
  RLS are what actually gate regulated adoption, with the Go *supervisor binary*
  confined to the air-gapped tier. **If field experience shows CISOs reject the
  Python runtime itself regardless of those controls, the language call is the first
  thing to revisit** — and the IR/ledger contract makes a future Go interpreter
  possible without breaking the compounding asset.
- **De-LangGraphing cost (OSS founder, infra-architect):** it's a genuine rewrite,
  not the cheap swap the pragmatist/researcher implied. Accepted deliberately.

---

## How the council changed my earlier memos

- `TECH_STACK_GREENFIELD.md` recommended a **TS/Go core**. The council **reversed
  this to Python** after reading the actual code (orchestrator already thin;
  hot-path is Python-first; AI-writes-code favors Python). The greenfield memo's
  *other* calls (own engine, DBOS, Postgres-everything, ports-for-everything) all
  **survived and strengthened.**
- The council added what no prior memo had: **the no-codegen invariant + the two
  live vulnerabilities + the IR/ledger as the public API.** That is the real moat.

---

## One-line verdict

> **The host language was never the question. The moat is: agent logic is signed,
> versioned DATA interpreted by a fixed runtime that runs no generated code; state
> is one Postgres you can `pg_dump`; tenancy is RLS from row zero; durability is
> DBOS-on-Postgres; and everything else is a swappable port. Build those, in that
> order, and the WordPress moment is reachable.**
