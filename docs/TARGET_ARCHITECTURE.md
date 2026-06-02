# Genesis — Target Architecture (reasoned from the future)

*A five-expert council reasoned PURELY from the destination — no existing code, no
current stack, clean sheet, AI writes the implementation. Five future-only lenses
(AI futurist, self-host-movement founder, platform/ecosystem architect, trust
architect, distributed-systems architect), adversarial cross-examination, then a
chief-architect synthesis. This is the target to aim at — not a critique of
anything that exists.*

*Fixed mission: the WordPress moment for AI agents. Phase 1 = download-and-own-it
(WordPress.org) is the foundation. Phase 2 = hosted/cloud, later, same core, no
fork. All tech open.*

---

## THE ONE PRINCIPLE (everything is downstream of this)

> **The ledger IS the runtime.** Execution is a *projection* of an append-only,
> content-addressed, signed event log. The running graph, the canvas, the live
> monitor, the cost meter, the audit timeline — every surface is a *read* of that
> one source of truth.

This is the inversion that makes the whole thing work. Today, in most systems,
execution happens and *then* emits logs that drift out of sync with reality. Invert
it: the log is primary; execution is what you get when you project the log. The
payoffs are structural, not bolted-on:

- **"What you see is exactly what executed"** becomes a *guarantee*, not a hope —
  the canvas can't lie because the canvas IS the program's record.
- **Replay, resume, and undo come for free** — they're just re-projections.
- **Third-party plugin attestation becomes possible** — the core writes ledger
  events, never the plugin.
- It's the substrate the other three primitives (suspension, cost, autonomy) all
  read from and write to.

Get this inversion right and everything else falls out of it. Get it wrong and no
amount of elegant orchestration matters.

---

## The target architecture in one paragraph

Genesis is **one statically-linked, zero-dependency binary** that boots into a
working agent platform **offline, in the first minute.** Its runtime *is* a signed,
append-only event ledger. On top sits a **tiny interpreter** that walks a
declarative, model-agnostic **Agent Manifest** the user owns as a portable file,
dispatching all non-deterministic and side-effecting work (models, tools, memory,
channels, sandboxes) through **one capability contract**. The LLM is never the
substrate — it's a *compiler* from natural language into the manifest, and itself
just one swappable capability. Hosted Phase 2 is the **byte-identical core** with
cloud adapters bound and a control plane wrapped around it — structurally
incapable of being a fork, because all durable truth lives in the portable
manifest + ledger that export and re-import identically between laptop and cloud.

---

## The tiny core — six things, and it refuses everything else

1. **The signed, content-addressed, append-only EVENT LEDGER + projection/replay
   engine** — the single source of truth. Replay *re-serves* recorded effects; it
   does not recompute them.
2. **The declarative, model-agnostic AGENT MANIFEST + interpreter** — explicit
   nodes/edges/state-schema/triggers/capability-references/policies. The one
   artifact the canvas renders 1:1 and the runtime executes. A portable plain file
   the user owns.
3. **ONE durable-suspension primitive — "park-until-event"** — the single mechanism
   behind human approval, scheduling/cron, slow tools, channel replies, and crash/
   migration recovery. Works for 50ms or 5 days, across reboots and machine moves.
4. **The transport-agnostic CAPABILITY CONTRACT** — `resolve / describe / invoke /
   cost-estimate`, plus declared typed I/O, declared cost function, **declared
   side-effect class**, required permissions, and an idempotency key. Carries the
   non-negotiable **record-on-execute / serve-from-ledger** discipline so
   non-determinism never breaks replay or double-fires a side effect.
5. **The POLICY + COST + PERMISSION enforcement point** — the autonomy gradient,
   deny-by-default capability grants in plain language, irreversibility
   classification, hard budget ceilings. Enforced by the core, **never by the model
   being governed.**
6. **The local SECRETS VAULT + manifest PROVENANCE** (who authored it, what version,
   was it altered) — a distinct *pre-run* trust gate for a download-and-run
   ecosystem.

**The core contains no specific LLM, prompt strategy, vector DB, channel, tool, or
isolation mechanism.** Those age out. The manifest, the ledger, the contract, the
loop, the suspension primitive, and the enforcement point are the load-bearing
abstractions that survive when models are 100× better.

---

## The pluggable parts — everything else

Models (local GGUF/Ollama, any API, future agentic models), vector/memory stores,
tools (MCP servers, custom plugins, **any "concept"**), channels (chat/web/voice/
Telegram/email), execution sandboxes, the durable-store backend (embedded file →
Postgres → distributed), tenancy/billing, and — critically — **the natural-language
builder itself** (NL→manifest is a swappable adapter, because the best way to
author keeps changing).

**The boundary rule (decided):** a thing is **core** if swapping it could change
what is *auditable, gateable, or billable*; otherwise it's a **plugin.** Every
plugin declares a manifest (capability kind, version, typed I/O, cost function,
side-effect class, required permissions/egress) and is reached only through the
contract, never by importing internals.

**The LLM is just one plugin.** Genesis is not "an LLM app" — it's a runtime that
*happens to default to one.*

---

## The unit that compounds: Manifest + Ledger

- **Agent Manifest** — the durable, model-agnostic, optionally-signed artifact the
  user authors, owns, forks, git-commits, shares, and installs *like a WordPress
  theme/plugin.* It declares **intent, policy, and capability-references** — not
  prompts, weights, or vendor calls — so the same manifest runs better and cheaper
  on a 100×-better model **with no rewrite.**
- **Ledger** — the immutable, model-independent record of every Run. The substrate
  for replay, audit, debugging, memory, evaluation, fine-tuning data, and the
  future "agents improving agents" loop (an autonomous agent reads past traces and
  proposes manifest edits).

Prompts, weights, frameworks, and the isolation mechanism are *transient* and
deliberately excluded from the durable layer. **Whoever owns the most durable,
portable, legible manifest format + the signed ledger around it — not the smartest
generator — wins the WordPress moment.**

---

## Self-host first (the soul of Phase 1)

One statically-linked binary, zero prerequisites, durable by default: **download,
run one command (or double-click), open the browser → a working agent platform**
with a bundled small local model, embedded ledger/store, embedded scheduler, local
sandbox, and the canvas served from the same process — **fully air-gapped before
any account, API key, or config.** A non-expert never installs a database, broker,
vector store, container runtime, or reverse proxy; it terminates its own TLS,
defaults are embedded, and **the network is opt-in, not opt-out.**

The property that makes it trivial for a non-expert: **ownership is literal and
behavior is legible by default.** Your manifests and ledger are portable files in
one data directory you can `tar`, copy, back up, and walk away with — losing
nothing. And because the ledger IS the runtime, the canvas shows in plain language
exactly what each agent did, what data left the box (nothing, by default), and the
live cost (zero, locally), with consequential actions parking for one-click
approval.

> *"It runs on my computer, I can read everything it does, and the recording cannot
> lie because the recording IS the program."* — the strongest trust primitive a
> non-expert understands.

Signing is **optional** — it matters for registries and enterprise, never a
ceremony that gates you from running your own edited file. **Self-host is the
architectural forcing function, not a packaging afterthought.**

---

## Phase 2 hosted — the same binary, never a fork

Hosted is the **identical core** with only adapter bindings swapped + a control
plane added: embedded store → managed Postgres/object storage, local sandbox →
remote worker pool, single-tenant ledger → partitioned, tenancy/billing adapter on.
The manifest format, ledger format, capability contract, suspension primitive, and
interpreter loop are **byte-identical** across laptop and cloud. A user exports
agents from the hosted service and runs the same manifest on their laptop — and
back — with no migration.

**The .com cannot diverge from the .org, because the .com is literally the same
executable.** There is no separate hosted core to fork.

---

## Trust & cost (the gate websites never had)

- **Trust = evidentiary fidelity, NOT reproducibility.** The council explicitly
  *rejected* marketing "deterministic replay" — LLMs are irreducibly stochastic.
  The honest, durable guarantee is **faithful record-and-replay of recorded
  effects + signed provenance** — "what you see is exactly what executed," not "it
  would choose identically again."
- **Typed side effects** (read-only / reversible-with-recorded-inverse /
  irreversible) declared in the contract → reversible effects get **one-click undo
  for free**; irreversible ones can't fire without a gate matched to the agent's
  autonomy level.
- **Grants are deny-by-default, in human sentences** ("can read your Calendar and
  send Telegram; will not otherwise touch the network"), readable and revocable.
- **Manifest provenance** answers "can I trust this *before* I run it" — a distinct
  gate from "what did it do after."
- **Cost is a kernel enforcement primitive, not a dashboard.** Every capability
  declares a cost function; the meter prices each step pre-flight in a normalized
  unit; hard per-run/per-agent/per-day ceilings **durably park the run at a human
  gate before spend** (no surprise billing); the local-default floor is a visible
  zero. You own the keys, the data, and the bill.

---

## The bet on where the world is going

In 5–10 years: inference is near-free and local-capable; agents are highly
autonomous, re-plan and self-modify; agents write and improve other agents. **The
fastest-deprecating part of any system is the model**; today's prompt strategies
and orchestration frameworks age out with it. What accrues lasting value is the
portable, auditable **description of intent** (manifest) and the permanent **record
of what happened** (ledger) — graphs and capability plugins accumulate in a
registry while models churn underneath, exactly as themes/plugins outlasted PHP
versions. The architecture rides this by making the **LLM a compiler and a plugin,
never the substrate** — so the platform doesn't die when the model paradigm shifts.
The **durable-suspension primitive** is what lets long-horizon autonomy coexist
with governance (a system that can always safely pause and ask is one you can let
act), and the **autonomy gradient** lets owners dial trust up as an agent proves
itself — absorbing increasing model autonomy without rearchitecting.

---

## The honored dissent (not papered over)

**The process-isolation boundary.** The platform architect argued plugins MUST run
out-of-process behind the host ABI — because in-process plugins force one language,
share a trust/memory domain, can forge ledger events, and make per-plugin sandboxing
impossible; "the provenance/permission boundary is unenforceable if a third party's
code runs in my address space." A genuine risk.

**Ruling:** isolation level is a **selectable engine property, not a contract
mandate** — in-process is the laptop default (mandating IPC + signature checks on
every model/tool call would contaminate the zero-dependency, air-gapped,
first-five-minutes soul of Phase 1); out-of-process is opt-in for untrusted/fleet
code. The dissent is honored concretely: **the core writes ledger events, never the
plugin** (so even an in-process plugin can't forge the ledger), and the hosted fleet
+ any untrusted registry plugin default to out-of-process. If the in-process
boundary proves unenforceable for third-party code in practice, the fallback is to
require out-of-process for any plugin not authored by the operator — **without ever
changing the contract or forcing it on the air-gapped single-author laptop case.**

Secondary, partly-resolved: the word "deterministic." Keep the airtight
record-on-execute / serve-from-ledger discipline (it prevents double-sends on
resume) but reject "deterministic" as the trust promise. Honest guarantee:
evidentiary fidelity + faithful effect-replay, not reproducibility.

---

## The first three bets (AI writes the code, so order by load-bearing, not effort)

1. **Build the EVENT LEDGER + projection engine first, and prove the inversion
   end-to-end:** an append-only, content-addressed, signed log where a trivial
   two-node run's graph, canvas, monitor, and cost meter are all *reads* of the
   same log, and the run can be killed mid-flight and resumed from the log with no
   double-execution. *Nothing else is real until "what you see is what executed" is
   demonstrable.*
2. **Decide the CAPABILITY CONTRACT**, specifically its two hardest clauses: the
   record-on-execute / serve-from-ledger effect discipline (typed result,
   idempotency key, side-effect class) and the cost-function + permission
   declaration — proven with two deliberately different adapters (a local model + an
   external tool) and the rule that **the core writes ledger events, never the
   plugin.** Minimal-but-complete and backward-compatibly versioned; the decade
   rides on this interface.
3. **Decide the MANIFEST ALTITUDE and ship the durable-suspension primitive against
   it:** pitch the manifest at explicit nodes/edges/state/triggers/capability-refs/
   policies (low enough to stay diffable, forkable, signable, grant-checkable), with
   **autonomy as a NODE TYPE rather than a property of the format** — this resolves
   the calcification worry by keeping the format low while letting an
   autonomous-planner node emit sub-graphs into the ledger at runtime. Then prove
   one manifest can park for a human approval and resume days later via the single
   park-until-event mechanism, with a hard budget ceiling that halts before spend.

---

## One-line target

> **The ledger is the runtime; the manifest is the program; the LLM is a compiler
> and a plugin, never the substrate. One binary you download and own, where the
> recording cannot lie because the recording IS the program — and the hosted cloud
> is the same executable, never a fork.** That is the WordPress moment for agents.
