# Genesis — Architecture & Design Vision

*Written as the architect of the product, not a patcher of bugs. This document
explains what Genesis is today, the single structural flaw that produced every
visible failure, the redesign that fixes it, and where the platform goes over
the next year.*

---

## Part 0 — The honest diagnosis

Genesis today is a beautiful machine that does exactly **one** thing:

> Take any natural-language intent → run it through 5 meta-agents
> (Architect → Decomposer → Builder → Critic → Validator) → produce a deployable
> LangGraph workflow → schedule it → fire tools on a cron.

That machine works. The meta-agent pipeline is genuinely good. The runtime
compiles real LangGraph `StateGraph`s. The persistence and trace layer is solid.

**The flaw is not in the machine. It is that the machine has no concept that
different requests are different *kinds* of work.** Every intent is forced down
the same build→deploy→schedule pipe. Look at what real users actually typed:

| What the user wanted | What Genesis did | Why it was wrong |
|---|---|---|
| "Write a 100-word essay on Virat Kohli" | Built a workflow, "deployed and live", told them to manage it on a dashboard | It was a **one-shot answer**. There is nothing to deploy or schedule. |
| "Find my biggest invisible problem and tell me what to do" | Built a rigid linear pipeline that demanded structured data | It was a **conversation**. It needed to ask questions first. |
| "Find latest FIFA World Cup news" | Returned fabricated 2024 data with invented timestamps | It was **live retrieval**. With no fresh data it should have said so, not invented. |
| "Alert me when AAPL drops 5%" | Sent a Telegram message *every 15 minutes* saying "no alert" | It was a **monitor**. The one case the pipeline was built for — but it force-sent every cycle. |

Four requests, four fundamentally different *shapes* of work, one pipeline.
Every failure was a shape-mismatch, not a bug. You can patch bugs forever; the
shape-mismatch will keep generating new ones.

**The architectural correction is to teach Genesis the shape of work before it
decides how to execute it.**

---

## Part 1 — The current architecture (what exists today)

```
                          ┌──────────────────────────────────────┐
   intent (Telegram /     │           BUILD PIPELINE               │
   API / canvas) ───────► │  Architect → Decomposer → Builder      │
                          │       ↑__________│ (Critic loop ≤3)     │
                          │  Critic → Validator → awaiting_approval │
                          └──────────────────┬───────────────────┘
                                             │ user taps ✅ Deploy
                                             ▼
                          ┌──────────────────────────────────────┐
                          │   Workflow row (graph_json, schedule) │
                          └──────────────────┬───────────────────┘
                          ┌──────────┬───────┴────────┐
                   manual run    APScheduler cron   webhook
                          └──────────┴────────────────┘
                                     ▼
                          ┌──────────────────────────────────────┐
                          │   EXECUTION RUNTIME                    │
                          │   compile_workflow_from_json()         │
                          │   per-node ReAct loop, tools, memory   │
                          │   → Run + Message trace (Postgres)     │
                          │   → Redis pub/sub → WebSocket → UI      │
                          └──────────────────────────────────────┘
```

**Three clean layers** (these are good and stay):
- **UI** — Next.js + ReactFlow canvas, run trace, monitoring.
- **Runtime** — FastAPI + LangGraph; meta-agents *and* the dynamic compiler.
- **Persistence** — Postgres (Workflow/Run/Message/Agent/GenesisBuild/AuditLog),
  Redis (pub/sub + session state), Qdrant (agent memory).

**What's strong and must be preserved:**
- The meta-agent build pipeline (it's the differentiator).
- `compile_workflow_from_json` — real graphs, inspectable, 1:1 with the canvas.
- Full message-level trace + audit log (replay, debugging, trust).
- Redis-backed conversational state (already survives redeploys).
- The `NO_RESULTS` honesty signal and conditional-send fixes (just landed).

**The single missing concept:** an *intent classifier* / *router*. Everything
that follows is built around adding it.

---

## Part 2 — The redesign: Intent Router + Execution Lanes

### The one change

Put a **Router** in front of everything. It classifies the intent into one of a
small set of **execution lanes**, and routes accordingly. Only one lane is the
current build→deploy→schedule pipeline.

```
                         ┌──────────────┐
   intent ─────────────► │    ROUTER    │  classifies: what SHAPE of work?
                         │ (cheap LLM   │  returns {lane, confidence, params}
                         │  classify)   │
                         └──────┬───────┘
        ┌───────────┬──────────┼───────────┬──────────────┐
        ▼           ▼          ▼           ▼              ▼
   ┌─────────┐ ┌──────────┐ ┌─────────┐ ┌──────────┐ ┌──────────────┐
   │ ANSWER  │ │ CONVERSE │ │ RETRIEVE│ │ AUTOMATE │ │  CLARIFY     │
   │ one-shot│ │multi-turn│ │ live    │ │ build +  │ │ (low conf →  │
   │         │ │ dialogue │ │ fetch   │ │ deploy + │ │  ask user)   │
   │         │ │          │ │         │ │ schedule │ │              │
   └─────────┘ └──────────┘ └─────────┘ └──────────┘ └──────────────┘
```

### The lanes

| Lane | Intent signals | Behavior | Build? | Deploy? | Schedule? |
|---|---|---|---|---|---|
| **ANSWER** (one-shot) | write, summarize, explain, draft, calculate, translate | Spin up a tiny ephemeral agent (or 2-3 if it needs research→write→review), run once, return the answer in chat. Persist as a Run for history, **no Workflow row, no deploy, no schedule**. | ephemeral | no | no |
| **CONVERSE** | diagnose, advise, "help me figure out", coach, *anything vague* | Multi-turn. Ask clarifying questions, hold session in Redis, gather until it has enough, then answer. Can *graduate* to AUTOMATE ("want me to do this weekly?"). | ephemeral | no | no |
| **RETRIEVE** | latest, current, now, today's, price of, news about | Fetch live (web_search/fetch_page/APIs). On `NO_RESULTS` → **CLARIFY bounce**: "I couldn't find live data — use my general knowledge (may be outdated), or refine the query?" Never fabricate. | ephemeral | no | optional* |
| **AUTOMATE** | every, daily, "alert me when", watch, track, monitor, on a schedule | **The current pipeline.** Architect→…→Validator → deploy → cron → conditional notify. The only lane that produces a durable Workflow. | full | yes | yes |
| **CLARIFY** | router confidence below threshold | Don't guess the lane. Ask one short question, then re-route. (You chose this behavior — it's first-class here.) | — | — | — |

*RETRIEVE can offer to "turn this into a daily brief", which graduates it to AUTOMATE.*

### Why this is correct, not just convenient

- It makes the **failure modes you saw structurally impossible**: an essay can no
  longer be "deployed"; a vague request can no longer skip the conversation; a
  retrieval with no data can no longer silently fabricate.
- It is **additive, low-risk**: AUTOMATE *is* the existing pipeline, untouched.
  We're adding lanes beside it, not rewriting it.
- It reuses what's already built: Redis session state (CONVERSE), the
  `NO_RESULTS` signal (RETRIEVE), conditional-send (AUTOMATE).
- The Router is **cheap** — one Haiku classification call (~1s, fraction of a cent).

### What the Router returns (contract)

```json
{
  "lane": "ANSWER | CONVERSE | RETRIEVE | AUTOMATE | CLARIFY",
  "confidence": 0.0-1.0,
  "reasoning": "one line",
  "params": {
    "needs_live_data": true,
    "is_recurring": false,
    "suggested_clarifying_question": "..."   // only when CLARIFY
  }
}
```

Below a confidence threshold (e.g. 0.6) → force CLARIFY regardless of lane.

### The key principle that ties it together: **honesty over confidence**

Every lane shares one rule, and it's the thing that made the diagnosis bot your
best interaction: **an agent that cannot do the job well says so.** It asks a
question, reports a data gap, or refuses to fabricate — it never invents a
confident-sounding wrong answer. This is now an explicit, enforced contract, not
an accident of one good prompt.

---

## Part 3 — "How would you plan customer research?" (worked example)

This question is the perfect stress test, because good research is exactly what a
fixed 4-node graph *can't* do. It needs to **plan its own steps, run them in
parallel, and admit what it couldn't find.** Here's the design:

```
   "Research my competitors' pricing"
              │
              ▼  ROUTER → CONVERSE (vague, needs scoping)
   ┌────────────────────────────────────────────────────┐
   │ 1. SCOPE (converse): which product? which competitors?│
   │    B2B/B2C? what decision will this inform?           │
   └───────────────────────┬──────────────────────────────┘
                           ▼  user answers → enough context
   ┌────────────────────────────────────────────────────┐
   │ 2. PLAN (a planner agent decides its OWN sub-questions)│
   │    → pricing tiers, positioning, reviews, market size  │
   └───────────────────────┬──────────────────────────────┘
                           ▼  fan-out
   ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐
   │ pricing  │ │positioning│ │ reviews  │ │market sz │   ← parallel RETRIEVE
   └────┬─────┘ └────┬─────┘ └────┬─────┘ └────┬─────┘
        └───────┬────┴───────┬────┴───────┬────┘
                ▼  HONESTY GATE: any sub-question that hit NO_RESULTS
                   is reported as a GAP, not filled with invented data
   ┌────────────────────────────────────────────────────┐
   │ 3. SYNTHESIZE: findings + explicit "what I couldn't find"│
   └───────────────────────┬──────────────────────────────┘
                           ▼
   ┌────────────────────────────────────────────────────┐
   │ 4. OFFER: "Want me to go deeper on pricing, or set    │
   │    this up as a weekly monitor?"  → graduates to AUTOMATE│
   └────────────────────────────────────────────────────┘
```

Three lessons this encodes:
1. **Scope before work.** Don't research until you know what decision it informs.
2. **Plan dynamically.** A *planner* node decides the steps at runtime — that's
   what lets one system handle "research competitors" and "research a medical
   topic" and "research a job market" without a hand-built graph for each.
3. **Admit gaps.** The synthesis explicitly lists what couldn't be found. A
   research tool that hides its gaps is worse than useless — it's misleading.

This is why the redesign isn't just "add lanes" — the AUTOMATE/CONVERSE lanes
need a **planner that composes steps at runtime**, not only the current
"compile a fixed graph once" model. That's Part 5.

---

## Part 4 — Implementation plan (phased, lowest-risk first)

Each phase is independently shippable and leaves the system working.

**Phase 1 — The Router + ANSWER lane** *(highest leverage, ~1-2 files)*
- Add `backend/genesis/agents/router.py` — a single Haiku classification call.
- In the Telegram/API entry path, call the router *before* `start_build_from_intent`.
- ANSWER lane: a minimal ephemeral executor (reuse `compile_workflow_from_json`
  with a 1-3 node throwaway graph; persist a Run, skip Workflow/deploy/schedule).
- **Outcome:** essays/summaries answer instantly in chat; nothing gets falsely
  "deployed." Biggest visible fix for the least code.

**Phase 2 — CONVERSE lane** *(reuses existing Redis session state)*
- Extend the pending-intent Redis state into a multi-turn gather loop: the agent
  decides "do I have enough to answer, or ask one more question?"
- Add a `graduate_to_automate` path ("make this recurring?").
- **Outcome:** diagnosis/advice/coaching work as real dialogue.

**Phase 3 — RETRIEVE lane + honesty bounce** *(half-done already)*
- Wire the `NO_RESULTS` signal to a CLARIFY bounce instead of a fabricated answer.
- Add a "use general knowledge (may be outdated)?" confirmation.
- **Outcome:** FIFA/price queries return real data or an honest "no live data."

**Phase 4 — Dynamic planner for AUTOMATE/research** *(the deeper change)*
- Add a planner node that composes sub-steps at runtime + a fan-out/synthesize
  pattern with a hard honesty gate.
- **Outcome:** genuine open-ended research and multi-step automation.

**Phase 5 — Lane-aware UI**
- Dashboard distinguishes durable Workflows (AUTOMATE) from one-shot Runs
  (ANSWER/RETRIEVE) and conversations (CONVERSE). Today everything is a
  "workflow," which is why one-shots looked wrong in the UI.

---

## Part 5 — Thinking about the future (where this goes)

The Router unlocks a platform, not just a bug fix. Here's the 6–18 month arc, in
rough order of value.

### 5.1 — Agents that plan their own work (runtime planning)
Today a workflow is a *static* graph compiled once. The future is **agents that
decide their next step at runtime** based on what they find — the difference
between a script and a worker. The planner node (Phase 4) is the seed. This is
what lets one "research assistant" handle any topic, one "support agent" handle
any ticket shape, without a human pre-drawing each graph.

### 5.2 — A real memory hierarchy
Qdrant per-node memory exists but is shallow. The future:
- **Working memory** — within a run (have it).
- **Episodic memory** — "what happened last time I monitored AAPL?" so a monitor
  can say "down 3% since last week," not just "vs. a frozen baseline."
- **Semantic memory** — durable facts the user taught it ("our competitors are
  X, Y, Z") shared across workflows.
- **Identity / SOUL** — the challenge hinted at SOUL.md/MEMORY (openclaw). A
  per-agent persistent persona + accumulated knowledge is a strong differentiator.

### 5.3 — Multi-channel, channel-agnostic
Today: Telegram. The `ChannelBridge` base + terminal-tool design already
generalizes. The future is **the same agent reachable on Slack, WhatsApp,
email, web chat, and voice** — the channel is a transport, the agent is the
product. The Router should be channel-aware (a Slack mention vs. a scheduled
cron are different entry contexts).

### 5.4 — Agents that call other agents (composition)
`interaction_rules.can_spawn_agents` exists in the model but is unused. The
future: an AUTOMATE workflow can invoke a CONVERSE agent ("ask the user to
approve before I post"), or a research agent can spawn sub-researchers. This is
the LangGraph subgraph pattern — Genesis is well-positioned for it.

### 5.5 — Trust, safety, and human-in-the-loop as first-class
The Validator and audit log are the foundation. The future:
- **Approval gates inside running workflows** ("about to email 500 customers —
  approve?"), not just at deploy time.
- **Spend limits & circuit breakers** — the AAPL incident showed an agent can
  run away. Per-workflow token/cost budgets that hard-stop, plus rate limits on
  outbound messages (no more than N Telegram sends/hour).
- **Reversibility** — dry-run mode, "what would this do?" previews for
  destructive tools.

### 5.6 — Evaluation & self-improvement
- **Run scoring** — was the output good? (the Content Pipeline already self-
  scores via its editor — generalize this.)
- **Auto-repair** exists for crashes; extend it to *quality* regressions, not
  just exceptions.
- **A/B prompts** — the meta-agents could learn which generated prompts produce
  better runs over time.

### 5.7 — The platform play
Once lanes + planning + memory + multi-channel exist, Genesis is no longer "a
workflow builder." It's **"describe any outcome, get an agent that handles it —
one-shot, conversational, or always-on — on any channel, that knows you, asks
when unsure, and never lies."** That's a product, not a demo.

---

## Part 6 — Design principles (the rules that keep us honest)

These are the invariants every future change must respect:

1. **Classify before you execute.** Never assume the shape of work.
2. **Honesty over confidence.** Ask, report a gap, or refuse — never fabricate.
   (This is the rule the best interaction already followed.)
3. **Only durable things get deployed.** One-shots and conversations are Runs,
   not Workflows. Scheduling is opt-in and explicit.
4. **Conditional side-effects.** A monitor notifies only when there's something
   to say. Outbound actions are rate-limited and budgeted.
5. **Everything is traceable.** Every step → Message + audit. No silent work.
6. **The canvas is the truth.** What ReactFlow shows is what executes; runtime
   planning must surface its decisions back to the canvas/trace.
7. **Reuse the three layers.** UI ⟂ Runtime ⟂ Persistence stays clean; lanes and
   planners live in the Runtime layer, not smeared across the UI.

---

## Appendix — Mapping today's failures to the redesign

| Failure (observed) | Root cause | Fixed by |
|---|---|---|
| Essay "deployed and live" | one-shot forced into AUTOMATE | **ANSWER lane** (Phase 1) |
| Diagnosis demanded rigid data | conversation forced into linear graph | **CONVERSE lane** (Phase 2) |
| FIFA fabricated 2024 data | retrieval with no no-data escape | **RETRIEVE + NO_RESULTS bounce** (Phase 3, half-done) |
| AAPL spam every 15 min | monitor force-sent every cycle | **conditional-send** (shipped) + **rate limits** (5.5) |
| "Failed to trigger deployment" | Markdown parse on dynamic text | **shipped** (plain-text messages) |
| opus-4-7 temperature 400 | param not supported by model | **shipped** (model router) |
| Frozen $312.06 baseline | no episodic memory of prior runs | **memory hierarchy** (5.2) |

The three shipped items were the bleeding. The lanes are the cure.
