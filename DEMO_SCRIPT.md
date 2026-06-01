# Genesis — Demo Recording Script (Yuno Challenge)

This is a shot-by-shot script for the recorded demo. The demo proves every
weighted criterion: a **working end-to-end workflow (40%)** including a **live
conversation with an agent over Telegram**, the **architecture/runtime (30%)**,
the **UI/UX (20%)**, and it backs the **README/docs (10%)**.

**Target length:** 4–6 minutes. Record at 1080p, browser zoomed so text is legible.

---

## 0. Before you hit record (setup checklist)

Do all of this OFF-camera so the recording is clean:

- [ ] Backend running and healthy:
      `curl http://localhost:8001/api/v1/health` → `{"status":"ok",...}`
      (or use the Railway backend `https://genesis-backend-production-360a.up.railway.app`)
- [ ] Frontend running: `cd frontend && npm run dev` → open `http://localhost:3000`
- [ ] Telegram open in a phone/desktop window, chat with the Genesis bot already on screen
      (bot handle: **@genesisbysr_bot**)
- [ ] Infra up: `make infra-up` (Postgres + Redis + Qdrant) if running locally
- [ ] Browser tabs ready: **Tab 1** = Dashboard (`/`), **Tab 2** = Templates (`/templates`)
- [ ] Clear any half-finished pending intent: send `/cancel` to the bot once, off-camera
- [ ] Have a stopwatch mindset — the build takes ~60s; don't talk over dead air, narrate it

> **Tip:** Do ONE full dry-run end-to-end before recording so you know the timings.

---

## 1. Cold open — the one-liner (0:00–0:30)

**Screen:** Dashboard (`http://localhost:3000`).

**Say:**
> "This is Genesis — an AI agent orchestration platform. You don't draw the
> workflow or write code. You describe the outcome in natural language, and five
> meta-agents build, validate, and deploy a real multi-agent LangGraph pipeline
> in about a minute. Let me show you, starting from a Telegram message."

**Do:** Briefly pan the dashboard — show the stat cards (workflows, runs, tokens/cost).
Keep it under 30s; the dashboard is the wrapper, the proof is what follows.

---

## 2. Live conversation through Telegram — the build (0:30–2:00)

> This is the **required external-channel conversation**. Keep Telegram large on screen.

**Do — type into Telegram (verbatim):**
```
Build a customer support agent: one agent classifies incoming tickets by urgency
and category, another drafts a reply, a supervisor reviews it, and a reporter
sends the result to Telegram.
```

**Say while it sends:**
> "I'm talking to the agent conversationally over Telegram — no UI needed to kick
> this off. Genesis confirms what it understood before doing anything."

**Bot replies** with *"Here's what Genesis will build… Reply yes to confirm, no to
discard, or send a revision."* — **point at it.**

**Do — reply in Telegram:**
```
yes
```

**Say:**
> "I confirm with 'yes'. Now the five meta-agents run — Architect designs the
> topology, Decomposer assigns each node its job, Builder generates the executable
> LangGraph graph, Critic reviews it and can bounce it back, Validator does safety
> checks and estimates cost. About sixty seconds."

**Bot replies (~60s later)** with an **approval request** and inline buttons:
**✅ Deploy · ❌ Cancel · 🔍 View Details** — point at them.

**Say:**
> "When it's ready, the agent comes back to me right here in Telegram with the plan
> and a cost estimate, and asks me to approve. The entire build-and-deploy loop is
> conversational — I never had to touch the dashboard."

**Do — tap ✅ Deploy in Telegram.** The bot confirms the workflow is deployed and live.

> **Note on state:** mention that this confirmation flow is **Redis-backed**, so it
> survives process restarts/redeploys — it's not fragile in-memory chat state. (Good
> tradeoff talking point for the live session.)

---

## 3. Watch it build, live, in the UI (2:00–2:45)

> While the build runs in Telegram (§2), flip to the browser to show the same thing
> happening live in the UI. This proves it's a real runtime, not a scripted chat.

**Screen:** Switch to the dashboard / build view in the browser. A new build/workflow appears.

**Say:**
> "While that's running, the UI shows it live. Each meta-agent's output streams in
> over WebSocket — this isn't a mockup, it's the actual runtime."

**Do:** Show the build progressing through Architect → Decomposer → Builder →
Critic → Validator. If the Critic sends it back for a revision, **call that out** —
it demonstrates the **feedback loop** the challenge asks for.

**Say when the build finishes (~60s):**
> "Sixty seconds. The workflow is built and validated — and as you saw, I approved
> and deployed it right from Telegram."

---

## 4. The visual workflow builder — what runs IS what you see (2:45–3:30)

**Screen:** Open the **Canvas** (`/canvas`) for the new workflow, or click the workflow
to view its graph.

**Say:**
> "Here's the key architectural idea: the visual canvas maps one-to-one to the
> LangGraph StateGraph. What ReactFlow renders here is exactly what executes —
> these four nodes, these conditional edges. Nothing is generated that you can't
> inspect."

**Do:** Point at the nodes (triage → resolver → supervisor → reporter) and the edges.
Click a node to show its **configurable dimensions**: system prompt, model, tools,
memory, guardrails. **This is the 20% UI/UX + configurability criterion** — linger here.

---

## 5. Run it — 2+ agents executing a real task (3:30–4:30)

**Do:** Click **Run Now** on the workflow.

**Screen:** The run detail page (`/runs/[id]`) with the live reasoning trace.

**Say:**
> "Now I run it on a real ticket. Watch the agents actually work — the triage agent
> classifies it, the resolver drafts an empathetic reply, the supervisor scores it
> for quality and policy compliance, and the reporter delivers the result."

**Do — narrate the live trace as messages stream in:**
- Triage classification (priority/category/sentiment)
- Resolver's draft reply
- Supervisor's review + quality score
- Reporter calling `telegram_send`

**Say:**
> "Every inter-agent message is persisted to Postgres and streamed over Redis, so
> the full trace is visible and replayable. Token count and estimated cost are
> tracked per run — you can see them here."

**Do:** Point at the **token/cost** display. **This is the live-monitoring criterion.**

---

## 6. Close the loop on Telegram (4:30–5:00)

**Screen:** Switch back to Telegram.

**Do:** Show the **result message the reporter agent delivered** to the chat
(✅ SUPPORT TICKET RESOLVED … quality score … reply preview).

**Say:**
> "And it closes the loop — the result comes back to the same Telegram channel the
> human started from. Build via conversation, run, and deliver — fully end-to-end."

---

## 7. Wrap (5:00–5:30)

**Screen:** Back to dashboard, or the templates page (`/templates`) to show breadth.

**Say:**
> "Genesis ships with eleven pre-built templates, full agent CRUD with schedules,
> memory, tools and guardrails, a visual builder with conditions and feedback loops,
> live monitoring with token and cost tracking, and Telegram as the external channel.
> It runs fully local with a single setup command. Thanks for watching."

**Do (optional):** Quickly scroll the templates gallery to show the 11 templates.

---

## Pre-recorded fallback runs (in case live build is slow on camera)

If you don't want to wait the full 60s on camera, these workflows are already
deployed and verified — you can run any of them instantly for section 5:

| Workflow | Agents | Verified output |
|---|---|---|
| `customer-support-triage` | 4 (triage→resolver→supervisor→reporter) | quality 94/100, Telegram delivered |
| `content_creation_pipeline` | 4 (researcher→writer→editor→reporter) | quality 92/100, Telegram delivered |
| `hackernews_ai_digest` | 3 (fetch→summarize→format) | real HN stories, Telegram delivered |

Run via UI **Run Now**, or:
```bash
curl -X POST "https://genesis-backend-production-360a.up.railway.app/api/v1/workflows/<id>/run" \
  -H "Content-Type: application/json" -d '{"input": {...}}'
```

---

## Checklist — what each scene proves (for the evaluators)

| Scene | Challenge criterion | Weight |
|---|---|---|
| §2 Telegram build conversation | External channel, conversational, **working e2e** | 40% |
| §3 Live build trace | Real runtime executes logic (not mockup) | 30% |
| §4 Canvas / node config | Visual builder, conditions, feedback loops, **configurability** | 20% |
| §5 Run + token/cost | 2+ agents on a real task, live monitoring | 40% |
| §6 Telegram delivery | Async inter-agent comms, message delivery | 40% |
| README + this demo | **Documentation** | 10% |

---

## Things to mention in the LIVE walkthrough session (not the recording)

The challenge schedules a live session to "walk through the code and discuss
tradeoffs." Be ready to talk to:

- **Why LangGraph** over CrewAI/AutoGen: async-native (matches FastAPI + SQLAlchemy
  2.0 async), explicit StateGraph that maps 1:1 to the canvas, checkpointer support.
- **The build pipeline is itself a LangGraph graph** (Architect→…→Validator with a
  Critic feedback loop, max 3 iterations).
- **Runtime compilation**: `compile_workflow_from_json()` turns stored `graph_json`
  into a real `StateGraph` at run time — no code-gen you can't inspect.
- **3-layer separation**: UI (Next.js/ReactFlow) ⟂ Runtime (FastAPI/LangGraph) ⟂
  Persistence (Postgres/Redis/Qdrant).
- **Conversational state is Redis-backed** (TTL'd) so it survives redeploys —
  deliberate choice over in-memory `ConversationHandler`.
- **Tests cover the 3 critical paths**: agent CRUD, workflow execution, message
  delivery — `make test` runs them on in-memory SQLite, no live Postgres needed.
- **Model strategy**: Haiku 4.5 for meta-agents (fast ~60s builds) and multi-node
  pipelines (stay under execution timeout); configurable per node.
