# Reframe: AI builds the code — so optimize for *right*, not *cheap-to-build*

*A short but load-bearing note. It changes how to read every other strategy/stack
memo in this folder.*

---

## The realization

The current Genesis was built **by AI in ~2 days.** The future will be the same —
or faster. AI writes the implementation.

This inverts the single biggest assumption in conventional architecture decisions:
that **rewrite cost / time-to-build is a primary constraint.** It isn't anymore.
When the spine can be regenerated in days, "we already have Python code" is not a
reason to keep Python; "a TS/Go rewrite is months" is not a reason to avoid it.

## What this changes

- **"Keep what exists" stops being an argument.** Sunk code is not sunk cost when
  re-creating it is cheap. Earlier memos that leaned on "keep ~90% of the stack"
  were reasoning from the old constraint. Discount that reasoning.
- **The real constraints become the durable ones** — the things AI speed does *not*
  erase:
  1. **Lock-in / dependency risk** — building your spine on someone else's roadmap
     (e.g. LangGraph) still hurts regardless of how fast you wrote it.
  2. **Data & tenancy model** — migrating live customer data and isolation
     guarantees is hard even when the code is free; getting the schema/RLS right
     early still matters.
  3. **Ecosystem & standards** — a third-party plugin/MCP ecosystem and shared
     types compound over years; you can't AI-generate a community.
  4. **Trust & correctness** — non-determinism, evals, predictable cost. AI writing
     the code doesn't make the agent's behavior trustworthy; that's a design
     problem, not a typing-speed problem.
  5. **Conceptual integrity** — the canvas↔graph mapping, the ports/adapters, the
     "core owns as little as possible" principle. Coherence survives; code churns.

## What to optimize for instead

Pick the stack that is **right for the 5–10 year arc**, judged on:
**what compounds, what avoids lock-in, what serves the mission (owned,
self-hostable, single→enterprise, everything pluggable, trust-legible).**

Not: "what's fastest to build" or "what we already wrote."

## How to read the other memos with this lens

- `TECH_STACK_DECISION.md` ("keep ~90%") — **down-weight.** It optimized for low
  rewrite cost, the constraint that just dissolved.
- `TECH_STACK_GREENFIELD.md` (TS/Go core, own engine, DBOS, Postgres-everything,
  ports for everything) — **up-weight.** It reasons from zero, which is now the
  correct frame.
- `THE_GENESIS_MOMENT.md` (democratization mission; trust is the deciding gate) —
  unchanged; it's about the *why*, which AI-speed doesn't touch.
- A council debate (`stack-council` workflow) was convened to pressure-test the
  greenfield call from five expert angles + adversarial cross-examination before
  committing. Its decision is the thing to act on.

## The one-line takeaway

> When AI builds the code in days, you stop choosing the stack you can afford to
> build and start choosing the stack you'd be glad to *live with* — the one that
> compounds, doesn't lock you in, and serves the mission. Build big, build right.
