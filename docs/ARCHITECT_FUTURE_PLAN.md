# Genesis — Architect's Future Plan

*The locked-in architecture and stack decision for Genesis, reasoned from the
destination (not the current 2-day PoC). This is the plan to build toward.*

*Success criteria that drove every choice, in priority order:*
1. **Maximize user base / adoption velocity.**
2. **Get acquired by a major AI company quickly** (OpenAI / Anthropic / Google / Microsoft / Databricks …).
3. **10-year maintainability.**

*The mission (fixed): the WordPress moment for AI agents — anyone (person, SMB,
enterprise) can OWN and run their own agents. Phase 1 = download-and-own-it
(WordPress.org). Phase 2 = hosted (WordPress.com), later, same core, no fork.*

---

## 0. The decisions, in one table

| Decision | Choice | One-line why |
|---|---|---|
| **Core language** | **TypeScript** | #1 language on GitHub (2.6M contributors, +66% YoY) = the biggest plugin-author + contributor pool; typed (AI writes it safely); mainstream → acquirable. |
| **Plugin / capability boundary** | **MCP-native, language-neutral** (MCP servers / sidecars / WASM) | The open, copyable format IS the moat. Plugins can be any language — Python AI libs come in as guests. |
| **The runtime model** | **The ledger IS the runtime** | Execution is a projection of a signed, append-only event log. "What you see is exactly what executed" becomes structural. |
| **The program** | **A declarative, model-agnostic Agent Manifest** | A portable file the user owns/forks/shares like a WordPress plugin. Declares intent + policy + capability-refs — never prompts/weights. |
| **The LLM** | **A compiler + a plugin — never the substrate** | Models are the most disposable layer; the manifest + ledger are what compound. |
| **Data** | **Postgres-for-everything** (pgvector, pgmq/LISTEN-NOTIFY, JSONB, RLS) | One stateful thing to install/back up/audit. Specialized stores are optional adapters. |
| **Durable execution** | **One "park-until-event" primitive**, Postgres-backed (DBOS-style) | Crash-safe pause/resume for approval, scheduling, slow tools, channel replies — 50ms or 5 days. No Temporal cluster. |
| **Tenancy** | **RLS, tenant-of-one from row zero** | Solo user = degenerate multi-tenant. The one thing you can't retrofit. |
| **Packaging** | **Docker one-liner + bundled single-file binary** (Bun/SEA) | Erases Go's install-friction edge; download → working platform offline in minute one. |
| **Frontend / canvas** | **Next.js + React Flow (@xyflow)** | The canvas maps 1:1 to the executing graph; shares the TS language/types with the core. |
| **The moat** | **Open format + ecosystem + trusted registry + install base** | Publish the format like WordPress. Competitors adopting it *ratify* it. |

---

## 1. Why TypeScript for the core (the question that kept coming up)

The conventional reflex is "AI platform ⇒ Python." **That reflex is wrong for
THESE goals.** It optimizes for *building models and libraries* — which is exactly
the layer this architecture treats as **pluggable and disposable.** You do not pick
your core language to match the most throwaway layer.

Scored against the three success criteria:

| Criterion | **TypeScript** | Python | Go |
|---|---|---|---|
| **① Adoption / install base** | **#1 on GitHub, 2.6M monthly contributors, +66% YoY** — the largest fuel for stars, contributors, and plugin authors | #2, skewed to AI-library people, not platform contributors | Smaller pool; best *install* friction but pool is the bottleneck |
| **② Acquisition by an AI giant** | Mainstream; matches acquirers' product/SDK surfaces; 2024-26 deals show **install base, not stack, drives acquisition** | Mainstream + research-fit; strong #2 | Weakest *agent-platform* cultural fit (Go = infra, not app/agent) |
| **③ 10-yr maintainability w/ AI code** | **Typed — catches ~94% of the type errors AI-written code makes**; huge typed-dev hiring pool | Dynamism = long-run liability at scale | Stable but verbose for plugin-glue; smaller app-layer hiring pool |

TypeScript is the only option that scores at-or-near-top on **all three at once.**
Go wins exactly one (install friction — mitigable with a bundled binary). Python
wins only the *narrative*.

**The reframe that shrinks the whole debate:** because the plugin boundary is
**MCP / language-neutral**, the core language no longer matters for plugins. It only
affects (a) install friction — solved with a Docker one-liner + bundled binary;
(b) the *core-contributor* pool — TS wins outright; (c) acquisition fit — TS and
Python both fine, Go weakest. **Python's whole ecosystem still comes in — as
plugins/sidecars — without paying Python's packaging tax on the binary you hand a
non-expert, or its dynamism tax on the 10-year core.**

**Honest caveat (the one real counter):** if the single most sacred property were
"lowest-friction local single binary above all else," **Go** is defensible — it's
why Ollama broke out. For an *adoption + acquisition + ecosystem* play, TypeScript
is the higher-expected-value bet, and the bundled-binary buys back most of Go's edge.

---

## 2. The one principle everything is downstream of

> **The ledger IS the runtime.** Execution is a projection of an append-only,
> content-addressed, signed event log. The running graph, the canvas, the live
> monitor, the cost meter, the audit timeline — every surface is a *read* of that
> one source of truth.

Why this is the highest-leverage decision:
- **"What you see is exactly what executed"** becomes a guarantee, not a hope — the
  canvas can't drift from reality because the canvas IS the record.
- **Replay, resume, and undo come for free** (they're re-projections).
- **Plugin attestation is possible** — the core writes ledger events, never the plugin.
- For an agent product where **trust is the gate that decides adoption**, the
  recording that cannot lie *is* the trust primitive a non-expert understands.

---

## 3. The tiny core (owned; never a plugin)

Six things, and it refuses everything else:

1. **Event ledger + projection/replay engine** — the single source of truth; replay
   *re-serves* recorded effects, never recomputes them.
2. **Agent Manifest + interpreter** — declarative, model-agnostic; the portable file
   the user owns; rendered 1:1 by the canvas, walked by the interpreter.
3. **One "park-until-event" durable-suspension primitive** — the single mechanism
   behind human approval, scheduling, slow tools, channel replies, crash/migration
   recovery.
4. **The capability contract** — `resolve / describe / invoke / cost-estimate` +
   typed I/O + declared cost function + **declared side-effect class** + required
   permissions + idempotency key. Carries the **record-on-execute / serve-from-
   ledger** discipline so non-determinism never breaks replay or double-fires an
   effect.
5. **Policy + cost + permission enforcement** — autonomy gradient, deny-by-default
   plain-language grants, irreversibility classification, hard budget ceilings.
   Enforced by the core, never by the model being governed.
6. **Secrets vault + manifest provenance** — a pre-run trust gate ("can I trust this
   *before* I run it").

**The core contains no specific LLM, prompt strategy, vector DB, channel, tool, or
isolation mechanism** — those age out.

---

## 4. The pluggable parts (the open ecosystem)

Everything that touches a fast-moving reality is a swappable adapter with a sane
default in the box: **models** (local Ollama → any API → future agentic models),
**vector/memory stores** (pgvector default → Qdrant/Pinecone for scale),
**tools** (MCP servers / custom plugins / *any concept*), **channels** (Telegram →
Slack / WhatsApp / web / voice / email), **execution sandboxes**, **store backend**
(embedded → Postgres → distributed), **tenancy/billing**, and **the NL-builder
itself** (NL→manifest is a swappable adapter).

**The boundary rule:** a thing is **core** if swapping it could change what is
*auditable, gateable, or billable*; otherwise it's a **plugin.** Every plugin
declares a manifest (capability kind, version, typed I/O, cost function, side-effect
class, permissions/egress) and is reached only through the contract. **The LLM is
just one plugin** — Genesis is a runtime that *defaults* to one, not an LLM app.

---

## 5. The unit that compounds: Manifest + Ledger

- **Agent Manifest** — declares intent + policy + capability-references (not prompts,
  weights, or vendor calls), so the same manifest runs *better and cheaper* on a
  100×-better model **with no rewrite.** The thing users author, own, fork,
  git-commit, share, and install like a WordPress plugin.
- **Ledger** — the immutable, model-independent record of every Run; the substrate
  for replay, audit, debug, memory, evaluation, fine-tuning data, and the future
  "agents improving agents" loop.

Prompts, weights, frameworks, and the host language are *transient* and deliberately
excluded from the durable layer. **Whoever owns the most durable, portable, legible
manifest format + the trusted registry around it — not the smartest generator —
wins the WordPress moment.**

---

## 6. Self-host first (Phase 1 — the soul) → hosted (Phase 2 — same binary)

**Phase 1:** one download, one command (or double-click), open the browser → a
working agent platform with a bundled local model, embedded ledger/store, embedded
scheduler, local sandbox, served canvas — **fully air-gapped before any account or
API key.** A non-expert installs no database, broker, vector store, container
runtime, or proxy. Network is **opt-in, not opt-out.** Your data is portable files
in one directory you can `tar` and own.

**Phase 2:** the **byte-identical core** with cloud adapters bound (managed Postgres/
object storage, remote sandbox pool, partitioned ledger, tenancy/billing on) + a
control plane wrapped around it. The manifest format, ledger format, capability
contract, suspension primitive, and interpreter are identical across laptop and
cloud. **The .com cannot fork the .org because the .com is literally the same
executable.** Users export from hosted and run the same manifest locally — and back.

---

## 7. Trust & cost (the gate websites never had)

- **Trust = evidentiary fidelity, NOT reproducibility.** Reject marketing
  "deterministic replay" — LLMs are stochastic. The durable guarantee is **faithful
  record-and-replay of recorded effects + signed provenance** — "what you see is
  exactly what executed," not "it would choose identically again."
- **Typed side effects** (read-only / reversible-with-recorded-inverse /
  irreversible) → reversible effects get **one-click undo for free**; irreversible
  ones gate on the agent's autonomy level.
- **Grants are deny-by-default, in plain sentences**, readable and revocable.
- **Cost is a kernel primitive, not a dashboard** — every capability declares a cost
  function; each step priced pre-flight; hard ceilings **park before spend** (no
  surprise billing); local-default floor is a visible zero. You own keys, data, bill.

---

## 8. The moat & the competitor question

> "If we publish the format, competitors can build on it." — **Yes, and you want
> that.**

WordPress's format was fully copyable; Drupal/Joomla existed; WordPress took ~43% of
the web anyway. The open format is **what created the ecosystem.** A competitor
adopting your manifest format **ratifies it as the standard** and grows the pool of
plugins/manifests that run best on your runtime + registry.

**Defend the ecosystem, not the spec:**
- **Open, published manifest + MCP plugin format** → become the de-facto standard.
- **Install base** → the real acquisition magnet (2024-26 deals confirm: bought for
  users/distribution, not stack).
- **Trusted registry** → vetted/signed plugins; this is where trust + governance
  live, and the GPT-Store failure shows it's the hard, defensible part.

A startup whose open format is the standard, with a large install base, is exactly
what an AI giant acquires to own the category — which serves success-criterion #2.

---

## 9. The build sequence (AI writes the code, so order by load-bearing, not effort)

1. **Build the EVENT LEDGER + projection engine** and prove the inversion end-to-end:
   a trivial 2-node run whose graph, canvas, monitor, and cost meter are all *reads*
   of one log, killable mid-flight and resumable with **no double-execution.**
   *Nothing else is real until "what you see is what executed" is demonstrable.*
2. **Lock the CAPABILITY CONTRACT** — the record-on-execute / serve-from-ledger
   effect discipline (typed result, idempotency key, side-effect class) + the
   cost-function + permission declaration — proven with two deliberately different
   adapters (a local model + an external tool), with the rule that **the core writes
   ledger events, never the plugin.** Minimal-but-complete, backward-compatibly
   versioned. *The decade rides on this interface.*
3. **Set the MANIFEST ALTITUDE + ship park-until-event:** pitch the manifest at
   explicit nodes/edges/state/triggers/capability-refs/policies (low enough to stay
   diffable, forkable, signable, grant-checkable), with **autonomy as a NODE TYPE,
   not a property of the format** (so it never calcifies; an autonomous-planner node
   can emit sub-graphs into the ledger at runtime). Prove one manifest can park for
   human approval and resume days later, with a hard budget ceiling that halts
   before spend.
4. **RLS tenant-of-one from row zero** — in the first schema.
5. **Postgres-for-everything**, specialized stores behind ports.
6. **The TS core as a downloadable binary** + the Next.js/ReactFlow canvas as a
   read of the ledger.

Steps 1–3 are the load-bearing spine; do them first.

---

## 10. The honored dissents (not papered over)

- **Process isolation:** isolation level is a *selectable engine property* (in-process
  = laptop default; out-of-process = untrusted/fleet), **but the core writes ledger
  events, never the plugin** — so in-process plugins still can't forge the ledger.
  Fallback: require out-of-process for any non-operator plugin, without forcing it on
  the air-gapped single-author laptop case.
- **Language (the live one):** an enterprise-security lens prefers a Go static binary
  for a minimal-CVE, signed-SBOM review. TypeScript was chosen for adoption +
  ecosystem + acquisition; **revisit the language first** if field experience shows
  AI-giant buyers or regulated CISOs reject a TS/Node runtime specifically.

---

## One-line plan

> **A TypeScript core you download as one binary, where a signed event ledger IS the
> runtime and a portable Agent Manifest is the program; the LLM is a compiler and a
> plugin; every capability is an MCP-native, language-neutral, swappable part; trust
> and cost are kernel primitives; the format is open so it becomes the standard — and
> the hosted cloud is the same executable, never a fork.** That is the WordPress
> moment for AI agents, built to be adopted widely and acquired fast.
