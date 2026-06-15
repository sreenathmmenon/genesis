# Genesis — Plugin Architecture
## "WordPress for AI Agents": The Extension System

*This document defines the target plugin architecture for Genesis — how third parties
build integrations, how self-hosters extend the platform, and how the codebase
transitions from hardcoded tools/channels to a discoverable plugin system.*

*For current architecture (as built today), see CURRENT_ARCHITECTURE.md.*
*For the broader future vision, see ARCHITECT_FUTURE_PLAN.md.*

---

## The Core Idea

WordPress succeeded because it separated the **platform** (WordPress core) from
**extensions** (plugins + themes) and made extensions installable by anyone without
touching the core. Genesis adopts the same model:

| WordPress Concept | Genesis Equivalent |
|---|---|
| Plugin | **Integration** — a tool, channel, or custom agent node |
| Theme | **Template** — a pre-built workflow blueprint |
| WordPress.org registry | **PyPI** (`genesis-plugin-*` naming convention) |
| Plugin activation | Admin panel → enable/disable |
| `wp_hooks` | Protocol contracts + PluginManager lifecycle |

The goal: a developer somewhere writes `genesis-plugin-salesforce`, publishes it to
PyPI, and a self-hoster installs it with one command (or one click in the admin UI)
without touching Genesis core code.

---

## Three-Tier Extension Model

Genesis extensions come in three tiers with different distribution mechanisms:

### Tier 1 — Built-in (ships with Genesis)

Plugins that live inside the Genesis repository under `genesis/plugins/`. Discovered
by directory scan at startup. No installation step required — present on every
Genesis instance.

- **Who writes these**: Genesis core team
- **What lives here**: Telegram, Slack, web_search, github_api, all current tools
- **How to add one**: Drop a Python file in `genesis/plugins/tools/` or
  `genesis/plugins/channels/`, restart
- **Covers**: ~80% of use cases

### Tier 2 — Community packages (power users)

Third-party plugins published on PyPI under the `genesis-plugin-*` naming
convention. Declared via `entry_points` in `pyproject.toml`. Installable from the
Genesis admin panel ("Install plugin" → enter package name → Genesis runs
`pip install` in background → restart prompt).

- **Who writes these**: Community contributors, companies, integration vendors
- **Naming convention**: `genesis-plugin-salesforce`, `genesis-plugin-hubspot`
- **Entry point groups**: `genesis.tools`, `genesis.channels`, `genesis.agent_nodes`
- **Gated by**: `GENESIS_ALLOW_COMMUNITY_PLUGINS=true` env var (default: off)
- **Covers**: Long tail of integrations

### Tier 3 — Templates as zip upload (no-code users)

Workflow templates distributed as `.zip` archives containing a `manifest.yaml` and
optional supporting files. Parsed, not executed — safe for upload because templates
are data, not code.

- **Who writes these**: Workflow designers, agencies, consultants
- **Format**: `manifest.yaml` + graph config YAML/JSON
- **Install**: Admin panel → Templates → Import → drag `.zip`
- **Covers**: Pre-built workflow blueprints for specific use cases

> **Security note**: Zip upload is intentionally restricted to templates (data).
> Tool and channel plugins must come from Tier 1 (bundled) or Tier 2 (pip).
> Never allow executable code upload via zip — this is WordPress's original security
> vulnerability and we avoid it by design.

---

## Four Plugin Types

Each type has a distinct role and lifecycle. They are kept strictly separate because
their contracts and lifecycles differ.

### 1. Tool Plugins

Stateless functions the LLM can call during workflow execution. These map to
LangGraph `ToolNode` inputs.

**Contract (Protocol):**
```python
class ToolPlugin(Protocol):
    name: str              # machine name: "slack_send"
    display_name: str      # human name: "Send Slack Message"
    description: str       # shown to LLM in system prompt
    category: str          # "Communication", "Search", "Developer", ...
    version: str
    icon: str              # for canvas rendering
    credentials_schema: dict | None  # what API keys/tokens it needs

    input_schema: dict     # port types for the visual canvas
    output_schema: dict

    async def execute(self, inputs: dict, credentials: dict) -> dict: ...
    def to_langchain_tool(self) -> BaseTool: ...
```

`to_langchain_tool()` is the bridge to LangGraph — the Builder Agent calls it when
assembling a `StateGraph` from a workflow's `graph_json`. Tool plugins are stateless:
no startup/shutdown, no bot connection, no persistent state.

**Discovery**: Directory scan of `genesis/plugins/tools/` (Tier 1) + entry_points
group `genesis.tools` (Tier 2).

---

### 2. Channel Plugins

Stateful inbound/outbound communication bridges. A channel holds a persistent
connection (bot, websocket, polling loop), registers a webhook route with FastAPI,
and normalises platform messages into Genesis's internal `InboundMessage` format.

**Contract (Protocol):**
```python
class ChannelPlugin(Protocol):
    name: str              # "telegram"
    display_name: str      # "Telegram"
    credentials_schema: dict

    # Lifecycle — called from app lifespan
    async def startup(self, credentials: dict) -> None: ...
    async def shutdown(self) -> None: ...

    # Outbound: agent → user
    async def send_message(self, recipient_id: str, text: str) -> None: ...
    async def send_approval_request(self, build_id: str, message: str) -> None: ...

    # Inbound: registers /channels/{name}/webhook with FastAPI
    def get_router(self) -> APIRouter: ...

    # Normalises platform payload → internal InboundMessage
    async def parse_incoming(self, raw: dict) -> InboundMessage: ...
```

Channels are the only plugin type that needs **both** a FastAPI router (for the
webhook endpoint) **and** a lifecycle (for the bot/connection). This dual nature is
why channels are architecturally distinct from tools.

**Discovery**: Directory scan of `genesis/plugins/channels/` (Tier 1) + entry_points
group `genesis.channels` (Tier 2).

**Current state**: `channels/telegram.py` already implements this contract via
`ChannelBridge` ABC. The migration adds `get_router()` and wires discovery.

---

### 3. Template Plugins

Workflow blueprints — pre-built `graph_json` definitions with metadata. No Python
code required; pure YAML/JSON. Analogous to WordPress themes.

**Format (`manifest.yaml`):**
```yaml
name: pr-guardian
display_name: PR Guardian
description: Monitors GitHub PRs for API contract changes and alerts the team
tags: [developer, github, monitoring]
version: 1.0.0
agent_count: 5
graph_json: ...      # full LangGraph graph definition
canvas_json: ...     # ReactFlow layout
required_tools:
  - github_api
required_channels:
  - telegram
```

**Discovery**: Directory scan of `genesis/plugins/templates/` (Tier 1) + zip upload
via admin UI (Tier 3).

**Current state**: The three templates in `api/templates.py` (1046 lines of
hardcoded Python dicts) become three YAML files under `plugins/templates/`. The
templates API becomes a loader rather than a data store.

---

### 4. Agent Node Plugins *(Phase 2)*

Custom primitive node types that extend the Builder Agent's vocabulary. When the
Builder Agent generates a `graph_json`, it can reference any registered node type.
This lets third parties add new atomic operations — `rag_retrieval`, `sentiment_analysis`,
`vector_search` — without forking the Builder Agent.

**Contract (Protocol):**
```python
class AgentNodePlugin(Protocol):
    name: str              # "rag_retrieval"
    display_name: str
    node_type: str         # LangGraph node category

    input_ports: list[PortDefinition]
    output_ports: list[PortDefinition]
    required_imports: list[str]     # injected into generated code header

    def get_node_code(self, config: dict) -> str: ...  # LangGraph node body
```

These plugins don't execute directly — they inform the Builder Agent's code
generation. The generated code is what actually runs. This is architecturally unique
to Genesis's "generate real LangGraph code" model.

**Discovery**: entry_points group `genesis.agent_nodes` (Tier 2 only — too
powerful for directory scan).

---

## The PluginManager

The central runtime registry. Lives at `genesis/core/plugin_manager.py`. Loaded once
at application startup in the `lifespan` context.

```
startup sequence:
  1. PluginManager.discover_all()
       ├── scan genesis/plugins/tools/        → self.tools dict
       ├── scan genesis/plugins/channels/     → self.channels dict
       ├── scan genesis/plugins/templates/    → self.templates dict
       ├── entry_points("genesis.tools")      → merge into self.tools
       └── entry_points("genesis.channels")   → merge into self.channels

  2. validate_all()
       └── isinstance(plugin, ToolPlugin) etc. — rejects malformed plugins
           with a clear error before they can cause runtime damage

  3. startup_channels()
       └── for each channel: channel.startup(credentials from DB/env)

  4. register_channel_routes(app)
       └── for each channel: app.include_router(channel.get_router())

  5. app.state.plugins = self   ← available to all routes via request.app.state
```

```
shutdown sequence:
  1. for each channel: channel.shutdown()
```

The PluginManager is the single source of truth for what's available:
- `app.state.plugins.tools["slack_send"]` → the Slack tool instance
- `app.state.plugins.channels["telegram"]` → the Telegram channel
- `app.state.plugins.list_tools()` → replaces the hardcoded `TOOL_CATALOGUE`

---

## Impact on Existing Code

The refactor is intentionally minimal. Genesis already has the right abstractions —
the work is connecting them with a discovery layer, not redesigning.

### What changes

| Current | Target | Change |
|---|---|---|
| `tools/implementations.py` (1 file, 14 tools) | `plugins/tools/*.py` (1 file per tool) | Extract; each file = one `ToolPlugin` class |
| `channels/telegram.py` | `plugins/channels/telegram.py` | Move + add `get_router()` |
| `api/templates.py` (1046 lines of Python dicts) | `plugins/templates/*.yaml` | Extract to YAML; API becomes a loader |
| `main.py` lifespan: hardcoded `telegram_bridge.setup()` | `plugin_manager.startup_channels()` | Replaces hardcoded channel init |
| `api/tools.py` returning hardcoded catalogue | Returns `plugin_manager.list_tools()` | Dynamic |

### What does not change

- `agents/` — all five meta-agents, graph compiler, router, state: untouched
- `api/` routers (agents, workflows, runs, scheduler, websocket, audit, health): untouched
- `models/` — all ORM models and Pydantic schemas: untouched
- `utils/` — redis, scheduler, model_router, audit, logger: untouched
- Database schema: no new migrations needed for Phase 1
- Frontend: unchanged (tools API response shape is preserved)

---

## File Structure (target)

```
backend/genesis/
  plugins/
    __init__.py
    base.py              ← Protocol definitions for all 4 plugin types
    manager.py           ← PluginManager (discovery, validation, lifecycle)
    tools/
      __init__.py
      web_search.py
      fetch_page.py
      http_request.py
      browser.py
      file_reader.py
      code_executor.py
      telegram_send.py
      slack_send.py
      email_send.py
      whatsapp_send.py
      sms_send.py
      webhook_send.py
      github_api.py
      jira_api.py
      notion_read.py
      calendar_read.py
      sheets_read.py
      sheets_write.py
      scheduler.py
    channels/
      __init__.py
      telegram.py        ← moved from genesis/channels/telegram.py
    templates/
      pr_guardian.yaml   ← extracted from api/templates.py
      daily_standup.yaml
      lead_enrichment.yaml
  channels/              ← keep base.py here; concrete impls move to plugins/
    base.py
  tools/                 ← keep __init__.py for backwards compat; impls move
    __init__.py          ← re-exports from plugins/tools/ for any existing imports
```

---

## Community Plugin: Packaging Example

A third-party developer creating `genesis-plugin-salesforce` would publish:

```
genesis-plugin-salesforce/
  pyproject.toml
  genesis_plugin_salesforce/
    __init__.py
    tool.py              ← SalesforceTool implementing ToolPlugin
    channel.py           ← SalesforceChannel (optional, if it has inbound)
```

`pyproject.toml`:
```toml
[project]
name = "genesis-plugin-salesforce"
version = "1.0.0"
dependencies = ["simple-salesforce>=1.12"]

[project.entry-points."genesis.tools"]
salesforce_query = "genesis_plugin_salesforce.tool:SalesforceQueryTool"

[project.entry-points."genesis.channels"]
salesforce_events = "genesis_plugin_salesforce.channel:SalesforceEventChannel"
```

After `pip install genesis-plugin-salesforce` and restart, the tool appears in the
tool catalogue, the channel appears in channel settings, and the Builder Agent can
use both in generated workflows.

---

## Implementation Phases

### Phase 1 — Foundation (implement now)
1. Write `plugins/base.py` — Protocol contracts for Tool and Channel
2. Write `plugins/manager.py` — PluginManager with directory scan + entry_points
3. Extract each tool from `implementations.py` → individual files in `plugins/tools/`
4. Move `channels/telegram.py` → `plugins/channels/telegram.py`, add `get_router()`
5. Wire PluginManager into `main.py` lifespan — replace hardcoded channel init
6. Update `api/tools.py` to serve from `plugin_manager.list_tools()`

### Phase 2 — Templates as data
1. Extract `api/templates.py` dicts → `plugins/templates/*.yaml`
2. Template loader reads YAML at startup
3. Admin API: `POST /api/v1/admin/templates/import` (zip upload)

### Phase 3 — Community plugins
1. Add `GENESIS_ALLOW_COMMUNITY_PLUGINS` env var + guard in PluginManager
2. Admin API: `POST /api/v1/admin/plugins/install` (pip install wrapper)
3. Admin UI panel: installed plugins list, install-by-name, enable/disable
4. Credentials store: per-plugin credentials saved encrypted in PostgreSQL

### Phase 4 — Agent node plugins *(future)*
1. `plugins/base.py`: add `AgentNodePlugin` Protocol
2. Builder Agent reads registered node types when generating `graph_json`
3. entry_points group `genesis.agent_nodes`

---

## Design Decisions & Rationale

**Why Protocol over ABC?**
Python `Protocol` with `runtime_checkable=True` enables `isinstance` checks without
requiring inheritance. Plugin authors don't need to import Genesis internals — they
just implement the right methods. ABCs require `from genesis.plugins.base import
ToolPlugin` in every plugin package, creating a hard version dependency.

**Why entry_points over stevedore?**
Stevedore is 8 manager classes solving OpenStack-scale problems. `importlib.metadata`
entry_points are Python stdlib (3.9+, stable in 3.12), zero dependencies, and
sufficient for years. Migrate to apluggy only if hook ordering across multiple
plugins responding to the same event becomes a real need.

**Why `include_router` over `app.mount()`?**
`app.mount()` creates a separate ASGI sub-application with separate middleware.
Plugin routes mounted this way don't inherit the app's auth, rate-limiting, or
database session middleware — forcing every plugin to re-implement auth. `include_router`
keeps all routes in one OpenAPI schema and inherits all middleware.

**Why not hot-reload?**
Tools are stateless and could be hot-reloaded. Channels hold bot connections that
must be properly stopped and restarted. Requiring a restart for plugin changes (same
as n8n) avoids race conditions between in-flight requests and plugin state changes.
The complexity tradeoff isn't worth it for v1.

**Why no zip upload for code plugins?**
Zip upload for executable code is WordPress's original security vulnerability —
thousands of WordPress sites are compromised via malicious plugins uploaded through
the admin UI. Genesis avoids this by keeping code plugins on pip (verified source,
auditable history) and restricting zip upload to YAML/JSON template data.

---

*Last updated: 2026-06-06*
*Status: Architecture decision — not yet implemented*
*Next step: Phase 1 implementation — see Implementation Phases above*
