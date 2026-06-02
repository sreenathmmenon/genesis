# Genesis — Internal Architecture (the building blocks)

*A future-council on the INSIDE of Genesis: six subsystem architects
(orchestration, memory, meta-agent compiler, tools/MCP, channels, observability)
each designed their block for the 5-10 year future on four axes — FUTURE /
CUSTOMERS / SECURITY / WOW — then cross-examined for coherence, then a chief
architect synthesized. The LangGraph question was answered head-on.*

*Fits the locked outer architecture (see ARCHITECT_FUTURE_PLAN.md): TS core,
ledger-is-runtime, model-agnostic manifest, MCP-native plugins, self-host first.*

---

## The verdict in one paragraph

The internal architecture is **one append-only, content-addressed, signed event
LEDGER and a small set of pure reducers over it.** Execution, memory, conversation,
cost, audit, and trust are all *projections* of that single log — "what you see is
exactly what executed" holds **by construction, not by a side-channel.** The
orchestration engine is a strict split: a **pure kernel** —
`reduce(manifest, ledger_slice) → proposed_events` — and a thin **impure
effect-runner shell** that is the only side-effecting code. The durable, compounding
artifacts users own are the declarative **manifest** + its signed compilation
lineage; the **LLM is an untrusted, swappable compiler frontend and a sandboxed
plugin, never the substrate.** The non-negotiable invariant: **every causal step
emits a signed, determinism-tagged event, or its run renders UNVERIFIABLE** — loud
failure, never confident-but-wrong.

---

## LangGraph — the final ruling: DROP it as the substrate

**All six subsystems independently refused to sit on LangGraph.** That unanimity is
the finding. The verdict:

> **Build the lean OWN engine (a pure reducer over the signed ledger). Keep
> LangGraph ONLY as a thin, optional, sandboxed adapter** for importing/running
> legacy or third-party LangGraph graphs — and only if they project their steps
> into our event schema with determinism tags. If such a graph does hidden
> side-effecting work, its re-fold hash won't reconcile and the run is marked
> UNVERIFIABLE.

Why every expert rejected it as the foundation: LangGraph's checkpointer is a
per-thread state blob with **no content-addressing, no signed provenance, no durable
cross-channel resume, no effect typing, no determinism declaration**, and its edges
run on **Python `eval()`** (the current line-418 RCE). HITL, crash-resume,
time-travel, runtime sub-graphs all fall out of "replay the log" *for free* in the
own-engine — things a third-party framework will never give natively. **We never
again inherit another project's runtime, lifecycle, or risk model.**

---

## The subsystems

### 1. Orchestration & execution engine
A **pure kernel** + a thin **impure effect-runner**. The kernel reconstructs the
frontier from the ledger, picks ready nodes, evaluates conditional edges via a
**non-Turing-complete evaluator (CEL/JSONLogic, never `eval`)**, and proposes events.
Every atomic fact is **three causally-chained signed events**:
`AdmissionDecision` (pure in-kernel check of the requested effect vs the
content-addressed CapabilityGrant + live budget + autonomy policy) →
`EffectRequest/Dispatched` (idempotency key = `hash(node_id, input-CA, branch-id)`)
→ `EffectResult` (signed by the supervisor; real egress, metered cost, determinism
tag). **Crash safety:** an EffectRequest with no matching Result for a
write-irreversible/spend/message-human effect is a HOLE that **HALTS and re-gates** —
never silently re-executed. **Suspension/resume is one primitive** (`AwaitRequested`
with a single-use, branch-scoped correlation_id). **Runtime graph growth is data:**
the planner emits a sub-manifest, routed through the compiler's Constraint Checker
against the parent's pinned budget before splicing.

### 2. Memory & knowledge
Four planes, **all signed events on the one ledger**, two disciplines:
- **WORKING** — run-scoped fold, never persisted.
- **EPISODIC** — per-run trace; Channels own raw ingest, Memory owns summarization +
  recency/confidence decay on an owner-priced schedule (kills the unbounded-thread
  cost bomb).
- **SEMANTIC** — distillation is NOT a pure projection; it's a **captured
  non-deterministic boundary EFFECT** (inputs = episode hashes + model id + prompt;
  output = signed fact tagged `non-deterministic` so Observability never tries to
  hash-reconcile it). A better model **re-distills as a new versioned event**, never
  mutates in place.
- **SOUL** — signed identity section; edits need owner-authority + a distinct signed
  adoption event (a new "identity-mutation" effect class).

**Retrieval result-sets are captured by content-hash and re-fed (never re-queried) on
replay** — this is what keeps time-travel honest. **Channel-origin content carries an
"untrusted-inbound" tag** that rides into distillation, **barring any fact derived
from untrusted inbound from influencing spend/irreversible decisions without
re-passing the autonomy gate** — closing instruction-laundering across runs. Default
embedded store (SQLite + local vector index) ships in the binary for offline minute
one; same contract scales to Qdrant/pgvector.

### 3. Meta-agent / NL→manifest compiler
A deterministic, content-addressed pipeline (Intent → Synthesis → Constraint-Check →
Repair → Sign). **The LLM is an untrusted, swappable frontend.** Five binding rules:
1. **Capability monotonicity at compile time** — output grants must be a *subset* of
   the triggering principal's authority; untrusted-origin (channel/memory/agent)
   intents can **never widen scope**; only an owner-key-signed compile widens grants.
   *(The front-door fix for prompt-injection-driven recompilation that no single
   expert owned.)*
2. **Single effect-profile source of truth** — the compiler never authors effect
   classes; it references capabilities by content-hash and copies their signed
   profile verbatim. One profile, two gates (compile + runtime admission), no drift.
3. **Sectioned manifest with per-section authority** — ORCHESTRATION / CAPABILITIES /
   AUTONOMY+INTERACTION / SOUL-IDENTITY / EVALS each sign independently; SOUL and
   autonomy-widening need owner authority, not the synthesis LLM.
4. **Evals are compiled, not assumed** — NL acceptance criteria compile to pinned
   pure-function assertions; "recompile on the new model" is **gated on pinned evals
   re-passing.** Auto-upgrade is eval-gated or it doesn't ship.
5. Conditional edges are CEL/JSONLogic only; checker rejects undeclared state keys.

### 4. Tools / capability plane (MCP)
Every capability is a **signed, content-addressed Plugin Manifest** with a
**three-axis effect profile**: (1) **authority** (egress allowlist, fs scope, secret
refs, cost ceiling), (2) **side-effect class** (read | write-reversible |
write-irreversible | spend | message-human | identity-mutation), (3) **determinism
class** (pure | idempotent-keyed | side-effecting-irreversible). MCP-native,
deny-by-default sandbox (WASM/WASI in-proc; out-of-proc for native). **Secrets never
touch plugins** — a broker mints scoped short-lived tokens at egress; the egress
allowlist proxy + sandbox supervisor are the **trust root** and **co-sign** observed
effect/cost/usage events. **Plugins do NOT self-sign ledger facts about their own
behavior** — their self-report is a separate, explicitly-untrusted CLAIM event.
Grants are portable as content-addressed *requests*, but binding to real
secrets/egress is instance-local and **re-consented on import** — no silent authority
inheritance. *WOW: a grant tightens itself — "approved this exact effect-shape 5×,
promote to act-with-veto?" — from lived ledger evidence.*

### 5. Channels & human interaction
A channel is a **sandboxed, stateless MCP transport adapter** that does exactly two
things: emit `channel.message.received` (content is DATA) and render outbound events.
**No conversational state, no secrets, no manifest access, no cross-tenant reads.**
Conversation = a ledger thread keyed by `(principal_id, thread_id)`, replaying
identically across web/Telegram/voice. **Corrected resume primitive:** the adapter is
NOT trusted to approve — it emits a raw `channel.reply{correlation_id, payload}`; a
**trusted in-core Interaction Resolver** is the single enforcement point that
verifies the single-use branch-scoped token, checks the channel's **identity-
assurance level** is sufficient for the effect class (recycled-SMS/voice may not
authorize spend without step-up), then emits `ApprovalGranted` **and atomically mints
the matching CapabilityGrant** — so **approval IS authorization** (no stale-grant
re-park). Autonomy ladder (propose / act-with-veto+countdown / full) is one shared
policy projection. Voice pins the transcript-at-ingest as canonical; audio is an
attachment-by-hash.

### 6. Observability, evals & trust surface
A set of **pure, sandboxed reducers** (zero ambient authority) folding the one ledger
into canvas, cost meter, audit timeline, eval verdicts, and the autonomy gate. Key
commitments:
- **Two distinct replay modes:** **VERIFICATION-replay** (pure fold, zero side
  effects, reconciles cost to the cent; non-reconciling = UNVERIFIABLE) and
  **COUNTERFACTUAL-replay** (forks at a node, re-dispatches every downstream effect
  through the SAME admission gate, so spend/irreversible effects re-prompt). *Kills
  "scrub a timeline and accidentally re-send 500 emails."*
- **Reserve-then-settle cost accounting** — hard ceiling halts BEFORE overspend.
- **Mandatory determinism declaration** per plugin/model adapter.
- **Evals and provenance unified** — "did it work?" and "why do you believe this?"
  are the same primitive: a content-addressed pure function over an event subtree.
- **The closed trust loop:** eval verdict events feed the autonomy gate, so **autonomy
  is policy-bound to passing eval evidence** — trust earned/revoked by signed evidence
  at machine speed.

---

## THE WOW — provably-honest time-travel + a self-improving fleet under a trust interlock

Scrub a **live** run's timeline backward like video; verification-replay reconstitutes
the agent's exact past mind (it answers only with what it knew at that timestamp,
because memory is a fold and retrieval result-sets were captured) at **zero cost,
zero re-execution.** Change one input, hit "replay from here" — counterfactual-replay
forks a **new signed branch under a narrowed capability subset**, memoizes
byte-identical deterministic effects, and **re-gates every irreversible/spend effect
through the autonomy ladder**, so the alternate run materializes side-by-side with
projected cost ticking in real cents — *magic that cannot spend your money by
accident.* The encore: **"recompile my whole fleet on the new model overnight,"
eval-gated with a fleet-wide diff**, and agents that **earn autonomy by passing
evals** — you watch trust get granted by evidence at machine speed, every escalation
reversible. And the planner **draws new branches onto the canvas mid-run** as
ledgered, replayable, reversible sub-manifests — the agent rewrites itself in front of
you.

---

## The biggest security decision

> **Plugins MUST NOT self-sign ledger facts about their own behavior.**

The signing/egress/sandbox trust root — the broker + supervisor the runtime controls
— **co-signs** effect/cost/usage events based on what it *mechanically observed*
(destinations, bytes, broker-token scope, exit status). The plugin's self-reported
payload is recorded only as a separate, explicitly-untrusted CLAIM event. This is
load-bearing because *every* other subsystem's trust (tamper-evidence, cost
reconcile-to-the-cent, eval pass/fail, approval authority, SOUL-edit authority)
reduces to "the signature verifies" — and a third-party plugin's key necessarily
lives inside the sandbox we assume is hostile. Co-signing by the mechanically-
observing supervisor is the only thing that makes "signed event" mean "true."

---

## The big finding: a missing subsystem nobody had owned

Five seams no single expert owned, now resolved — the most important:

> **A new first-class IDENTITY, SECRETS & TIME subsystem is mandated (release
> blocker).** Four subsystems silently depended on key custody, principal-binding,
> and a trustworthy clock, and nobody owned them. It owns: key custody/rotation/
> revocation, the cross-channel principal-binding ceremony with per-channel assurance
> levels + step-up auth, the broker for scoped short-lived tokens, and a monotonic
> notarized clock emitting signed `timer.elapsed` events. Observability *verifies*
> all three but does not own custody.

The other four resolved seams: replay-as-exfiltration (fork authority + mandatory
re-gating, owned by Orchestration); prompt-injection recompilation (capability
monotonicity, owned by Compiler); compromised-plugin-as-ledger-writer (supervisor
co-signing, owned by Tools); cross-agent memory-pack laundering (quarantined imports,
SOUL never auto-merges, owned by Memory).

---

## The honored dissent (not papered over)

The Observability architect's warning: the signed-ledger model proves **internal
consistency, not authenticity, on an offline download-and-run binary.** If an attacker
with local-disk access holds the signing key, they re-sign a forged chain; and an
offline machine's clock is attacker-controllable, so every time-based guarantee
(cost-over-time, countdown auto-resume, decay, multi-day waits) trusts a number the
attacker can set. **Honest concession:** the elegant "tamper breaks the hash chain"
story is materially weaker offline than the WOW demos imply. The Identity/Secrets/Time
subsystem is mandated, but **the Phase-1 single-laptop threat model cannot fully solve
local-root key theft without hardware (TPM/Secure Enclave)** — which is in tension
with "works offline in minute one." Ruling: default to OS-keystore/Secure-Enclave-
backed keys where present; degrade explicitly and **visibly mark runs
"locally-anchored, not hardware-attested"** where absent. The gap is real and must be
designed against, not waved away.

---

## Build order (by load-bearing dependency)

1. **LEDGER + event schema + signing/verification** — content-addressed, append-only,
   monotonic offsets, tenant keyspaces, cheap frontier reconstruction. *Everything is
   a projection of this.*
2. **IDENTITY, SECRETS & TIME** — key custody/rotation/revocation, principal binding +
   channel assurance, scoped-token broker, monotonic notarized clock. *The trust
   anchor four subsystems depend on; build before anything that signs or gates.*
3. **CAPABILITY PLANE** — signed Plugin Manifests, three-axis effect profile,
   deny-by-default sandbox, egress proxy + supervisor co-signing, two-phase admission.
4. **ORCHESTRATION KERNEL + EFFECT-RUNNER** — pure reducer, CEL/JSONLogic edges,
   three-event effect chain, idempotency/holes, await/resume, fork-authority + narrowing.
5. **MANIFEST + COMPILER** — sectioned manifest, per-section authority, capability
   monotonicity, single-source effect profiles, compiled evals.
6. **MEMORY** — four planes, distillation-as-captured-effect, retrieval-result
   capture, SOUL gating, quarantined imports.
7. **CHANNELS + INTERACTION RESOLVER** — stateless adapters, approval-IS-authorization,
   autonomy ladder. (Depends on Identity assurance + grant minting.)
8. **OBSERVABILITY** — pure projection reducers, two replay modes, reserve-then-settle
   metering, unified evals/provenance, eval-gated autonomy loop. *Last, because it
   folds everything below and is only as honest as their event completeness.*

---

## One-line internal architecture

> **One signed event ledger; pure reducers over it for everything; a pure
> orchestration kernel + an impure effect-runner; LangGraph dropped to an optional
> sandboxed adapter; the LLM an untrusted swappable compiler-and-plugin; plugins never
> self-sign their own behavior; and a mandated Identity/Secrets/Time trust anchor.
> The wow is provably-honest time-travel and a self-improving fleet that earns autonomy
> by passing evals — magic that cannot spend your money by accident.**
