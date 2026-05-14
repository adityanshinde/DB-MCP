# Expanded Tool Ecosystem & ChatGPT-IDE Bridge Architecture

**Research Date**: May 13, 2026
**Sources**: MCP Specification, A2A Protocol, AG-UI Protocol, Windsurf docs, GitHub ecosystem, web research

---

## Table of Contents

1. [New Tool Categories Beyond DB & GitHub](#1-new-tool-categories-beyond-db--github)
2. [The ChatGPT-IDE Bridge Problem](#2-the-chatgpt--ide-bridge-problem)
3. [Solution Architecture: Context Bridge MCP Server](#3-solution-architecture-context-bridge-mcp-server)
4. [Emerging Protocols: A2A & AG-UI](#4-emerging-protocols-a2a--ag-ui)
5. [Real-Time Synchronization Implementation](#5-real-time-synchronization-implementation)
6. [Multi-Client Shared Context Patterns](#6-multi-client-shared-context-patterns)
7. [Memory & Persistent Context Servers](#7-memory--persistent-context-servers)
8. [Integration with IDE Ecosystems](#8-integration-with-ide-ecosystems)
9. [Implementation Roadmap](#9-implementation-roadmap)

---

## 1. New Tool Categories Beyond DB & GitHub

DB-MCP currently has ~28 database tools + 15 GitHub tools. The MCP ecosystem has exploded with new server categories. Here is a comprehensive expansion plan.

### 1.1 Filesystem & Workspace Tools

**Why**: Every AI agent needs file access. Current DB-MCP has no filesystem operations.

**Reference**: `github.com/modelcontextprotocol/servers/tree/main/src/filesystem`

**Tools to Add**:
- `fs_read_file` — Read file content with line ranges
- `fs_write_file` — Write/overwrite file (idempotent)
- `fs_edit_file` — Apply line-based diffs to files
- `fs_list_directory` — List files with metadata (size, mtime)
- `fs_search_files` — Grep search across workspace
- `fs_get_file_info` — Single file metadata
- `fs_create_directory` — Create nested directories
- `fs_delete_file` — Delete with confirmation

**Security**: Read-only by default; write operations behind allowlist + destructiveHint annotations.

---

### 1.2 Web Browser & Search Tools

**Why**: AI agents need to fetch live docs, search StackOverflow, verify API docs.

**Reference**: Firecrawl MCP, Puppeteer MCP

**Tools to Add**:
- `web_search` — Search web (DuckDuckGo / Bing API)
- `web_fetch_page` — Fetch and parse HTML to markdown
- `web_browse_url` — Multi-step browsing: click, scroll, extract
- `web_screenshot` — Capture page screenshot as base64
- `web_read_api_docs` — Fetch OpenAPI/Swagger specs from URL
- `web_compare_pages` — Diff two web pages

**Integration**: Use `fetch` + `turndown` for HTML→Markdown conversion. Cache results in L2 Redis.

---

### 1.3 Document & Knowledge Base Tools

**Why**: Connect to Notion, Confluence, Google Docs for project context.

**Tools to Add**:
- `docs_search_notion` — Search Notion pages by title/content
- `docs_get_notion_page` — Get page content as markdown
- `docs_search_confluence` — Search Confluence spaces
- `docs_get_confluence_page` — Get page with attachments
- `docs_search_slack` — Search Slack messages (with time range)
- `docs_upload_to_notion` — Create/update Notion page

**Architecture**: OAuth-based connectors with token refresh. Store tokens encrypted in Redis.

---

### 1.4 Cloud Platform Tools

**Why**: DevOps tasks — check AWS resources, GCP logs, Azure deployments.

**Tools to Add**:
- `cloud_list_aws_resources` — ECS, RDS, S3, Lambda by tag
- `cloud_get_cloudwatch_logs` — Tail logs with filters
- `cloud_describe_rds_instance` — DB instance status, config
- `cloud_list_gcp_projects` — GCP project enumeration
- `cloud_get_azure_resource_group` — Azure RG resources
- `cloud_get_terraform_state` — Read terraform state (read-only)

**Security**: Use IAM roles (not long-lived keys). AssumeRole for temporary credentials.

---

### 1.5 Container & Kubernetes Tools

**Why**: Modern dev requires K8s introspection.

**Tools to Add**:
- `k8s_list_pods` — Pods in namespace with status
- `k8s_get_pod_logs` — Stream pod logs (last N lines)
- `k8s_describe_deployment` — Deployment spec + status
- `k8s_get_service_endpoints` — Service → pod mapping
- `k8s_list_events` — Cluster events (warnings, errors)
- `docker_list_containers` — Running containers
- `docker_get_container_logs` — Container logs

**Architecture**: Use `kubectl` CLI or Kubernetes client library. Requires kubeconfig path.

---

### 1.6 Email & Calendar Tools

**Why**: Executive AI assistants need calendar and email access.

**Tools to Add**:
- `email_search` — Search Gmail/Outlook by sender/subject/date
- `email_get_thread` — Full thread conversation
- `email_send_draft` — Compose draft (requires confirmation)
- `calendar_list_events` — Events for date range
- `calendar_get_event_details` — Attendees, location, description
- `calendar_find_free_slots` — Free/busy for attendees

**Integration**: Google Calendar API, Microsoft Graph API. OAuth 2.0 with refresh tokens.

---

### 1.7 Analytics & Observability Tools

**Why**: SRE/DevOps need to query metrics and traces.

**Tools to Add**:
- `obs_query_prometheus` — PromQL queries with time ranges
- `obs_get_grafana_dashboard` — Dashboard JSON + panel data
- `obs_search_datadog_metrics` — Metric names and tags
- `obs_query_datadog_logs` — Log search with facets
- `obs_get_sentry_issues` — Recent errors for project
- `obs_get_newrelic_apm` — APM transaction traces

**Architecture**: Each tool is a thin wrapper around the vendor's API. Cache aggressively.

---

### 1.8 Code Execution & Sandbox Tools

**Why**: AI agents need to run code to verify queries, generate reports.

**Tools to Add**:
- `exec_run_python` — Execute Python in sandboxed container
- `exec_run_sql` — Execute SQL against temporary in-memory DB
- `exec_run_shell` — Run shell commands (allowlist-based)
- `exec_run_jupyter_cell` — Execute Jupyter notebook cell
- `exec_format_code` — Run prettier, black, rustfmt

**Security**: Docker sandbox with CPU/memory limits. Network isolation. Timeout enforcement.

---

### 1.9 Schema Context & Search Tools (Zero LLM Cost)

**Why**: Provide rich schema metadata so the user's IDE agent can do all reasoning locally.

**Tools to Add**:
- `get_nl2sql_context` — Returns schema + relationships + sample data for agent-side SQL generation
- `get_schema_for_documentation` — Returns profiling data for agent-generated docs
- `get_schema_search_index` — Returns text descriptions for agent-side semantic search
- `get_query_history` — Returns recent queries for conversational context
- `profile_data_quality` — Deterministic anomaly detection (no ML)

**Architecture**: All data tools are deterministic. Zero API keys. Zero token costs. The agent uses its own LLM (Claude/GPT/local Ollama) to interpret this data.

---

### 1.10 API Testing & Mock Tools

**Why**: Backend developers need to test APIs while coding.

**Tools to Add**:
- `api_send_request` — HTTP request with method, headers, body
- `api_test_endpoint` — Automated assertion testing
- `api_mock_server` — Start temporary mock HTTP server
- `api_validate_openapi` — Validate endpoint against OpenAPI spec
- `api_generate_client` — Generate TypeScript/Python client from spec

---

### 1.11 OS Integration & Desktop Automation Tools

**Why**: End-to-end workflows often require OS-level actions — launching apps, sending notifications, exporting to Excel, managing processes.

**Reference**: `github.com/CursorTouch/Windows-MCP` — Production-ready MCP server for Windows OS integration.

#### Windows-MCP Architecture (Reference Model)

**Tech Stack**:
- Python 3.13+ with fastmcp framework
- pywin32 + comtypes for Windows API access
- dxcam for screenshots
- PowerShell executor for shell commands
- UI Automation (UIA) for element detection

**Key Innovation: Label-to-Coordinate Resolution**
Instead of hard-coded coordinates, agents reference UI elements by label (extracted from UI Automation tree):

```python
# Agent says: "Click the Submit button"
# Windows-MCP resolves "Submit" → [x, y] coordinates
# Then performs the click
```

This is similar to DOM selectors for web automation, but for native Windows UI.

**Core Tools** (17 total):
| Tool | Purpose |
|------|---------|
| `Click` | Mouse clicks at coordinates or UI element labels |
| `Type` | Type text at coordinates or UI elements |
| `Scroll` | Scroll vertically/horizontally |
| `Move` | Move mouse or drag |
| `Shortcut` | Keyboard shortcuts (Ctrl+c, Alt+Tab) |
| `Wait` | Pause execution |
| `Screenshot` | Fast desktop capture (cursor, windows, image) |
| `Snapshot` | Full desktop state with UI element IDs and DOM extraction |
| `App` | Launch apps, resize/move windows, switch apps |
| `Shell` | Execute PowerShell commands |
| `Scrape` | Scrape webpages for information |
| `MultiSelect` | Select multiple items with bulk label-to-coordinate resolution |
| `MultiEdit` | Enter text into multiple fields simultaneously |
| `Clipboard` | Read/set clipboard |
| `Process` | List/terminate processes |
| `Notification` | Send Windows toast notifications |
| `Registry` | Read/write/delete registry values |

**Architecture Pattern**:
```
src/windows_mcp/
├── tools/           # MCP tool implementations
│   ├── input.py     # Click, Type, Scroll, Move, Shortcut, Wait
│   ├── snapshot.py  # Screenshot, Snapshot
│   ├── app.py       # App control
│   └── shell.py     # PowerShell execution
├── uia/             # UI Automation layer (element detection)
├── desktop/         # Desktop state management
├── tree/            # UI tree traversal
└── infrastructure/  # Analytics, validation
```

**Security Model**:
- ⚠️ Full system access — can perform irreversible operations
- IP allowlist, tool selection, TLS/HTTPS, OAuth 2.0 + PKCE
- SSRF protection
- Config file (`~/.windows-mcp/config.toml`)
- **Recommendation**: Use only with trusted LLM clients

**Complementarity with DB-MCP**:
DB-MCP and Windows-MCP solve different problems and work together seamlessly:

| | **DB-MCP** | **Windows-MCP** |
|---|------------|-----------------|
| **Scope** | Database access + GitHub code | Windows OS automation |
| **Platform** | Cross-platform | Windows only |
| **Risk Level** | Low (read-only DB queries) | High (full OS access) |
| **Use Case** | Data analysis, code research | Desktop automation, QA testing |

**End-to-End Workflow Example**:
```
1. Agent uses Windows-MCP to open SQL Server Management Studio
2. Agent uses DB-MCP to run queries and analyze results
3. Agent uses Windows-MCP to export results to Excel
4. Agent uses Windows-MCP to send notification with report
```

**Future OS Integration Reference**:
If DB-MCP ever needs OS integration (e.g., for Windows-specific deployments), Windows-MCP's architecture is a proven model:
- UIA for element detection (cross-platform equivalent: Accessibility APIs)
- Label-to-coordinate resolution for flexible automation
- PowerShell executor (cross-platform equivalent: subprocess/shell)
- Modular tool registration pattern

**Status**: Windows-MCP is v0.7.4 (beta), actively maintained, production-ready for Windows environments.

---

## 2. The ChatGPT ↔ IDE Bridge Problem

### 2.1 Problem Statement

**Current Workflow Pain Points**:

| Pain Point | Description |
|------------|-------------|
| No Direct Communication | ChatGPT (web) and IDE agent (Cursor/Windsurf/VS Code) are silos |
| Manual Context Transfer | User copy-pastes code, errors, and responses between systems |
| Context Loss | Each system re-learns project context independently |
| Duplicated Effort | Both agents may solve the same sub-problem |
| Stale Information | IDE agent doesn't know ChatGPT already found the answer |
| No Shared Memory | Decisions made in ChatGPT are invisible to IDE |

**User's Desired Outcome**:
- Bidirectional real-time communication between ChatGPT and IDE
- Shared context: schema, codebase, conversation history
- Automatic synchronization of messages, code, and project context
- Elimination of manual copy-paste

---

### 2.2 Why This Is Hard

**Technical Barriers**:

1. **Different Protocols**: ChatGPT uses OpenAI's Apps SDK / GPTs. IDE uses MCP. No native bridge exists.

2. **No Shared Transport**: ChatGPT web app runs in browser. IDE agent runs as local process. No persistent connection.

3. **Context Window Limits**: Both systems have limited context. Sharing everything is impossible.

4. **Security Boundaries**: ChatGPT (cloud) and IDE (local) have different trust models. Cross-boundary data flow is risky.

5. **No Standard for Agent-to-Agent**: Until A2A (April 2025), there was no protocol for agents to talk to each other.

---

## 3. Solution Architecture: Context Bridge MCP Server

### 3.1 High-Level Architecture

```
┌─────────────────┐     ┌─────────────────────┐     ┌─────────────────┐
│   ChatGPT Web   │◄───►│   Context Bridge    │◄───►│   IDE Agent     │
│   (OpenAI GPT)  │     │   MCP Server        │     │ (Cursor/Windsurf│
│                 │     │                     │     │  /Claude Desktop)│
└─────────────────┘     └─────────────────────┘     └─────────────────┘
        │                        │                        │
        │                        ▼                        │
        │              ┌─────────────────┐               │
        │              │  Shared Store   │               │
        └─────────────►│  (Redis/Upstash)│◄──────────────┘
                       └─────────────────┘
```

### 3.2 Components

#### Component 1: Context Bridge MCP Server
A new MCP server that acts as a **shared memory bus** between ChatGPT and IDE.

**MCP Tools**:
- `bridge_publish_message` — Publish a message to the shared context
- `bridge_get_unread_messages` — Get messages from the other agent
- `bridge_share_code_snippet` — Share a code block with metadata
- `bridge_share_query_result` — Share DB query results
- `bridge_share_schema_context` — Share database schema snapshot
- `bridge_share_error_log` — Share error/stack trace
- `bridge_acknowledge_message` — Mark message as read
- `bridge_get_conversation_history` — Full history with filtering
- `bridge_create_thread` — Create a new topic thread
- `bridge_subscribe_to_thread` — Real-time updates via SSE

#### Component 2: Shared Context Store
Uses existing Redis infrastructure. **Cost: $0** with Upstash Free (10k commands/day) or Docker Redis Stack locally.

**Data Model**:
```
bridge:context:{project_id}        → JSON: project metadata, schema cache
bridge:messages:{thread_id}      → Sorted Set: messages by timestamp
bridge:unread:{client_id}        → Hash: unread counts per thread
bridge:code_snippets:{thread_id} → List: shared code blocks
bridge:schema_snapshots:{db}     → Hash: latest schema per database
bridge:sync_status:{client_id}   → String: last_sync_timestamp
```

**Capacity on Upstash Free Tier**:
- 10,000 Redis commands/day = ~400 messages/day + 200 reads = plenty for small teams
- 256 MB storage = ~50,000 messages + schema snapshots for 20 databases
- Upgrade to Pro ($10/mo) only when team exceeds 5 active developers

#### Component 3: ChatGPT Integration Layer
Since ChatGPT doesn't speak MCP natively (yet), we need a bridge:

**Option A: ChatGPT Actions / GPTs** (Recommended)
- Build a Custom GPT with Actions pointing to the Context Bridge API
- Actions: `share_context`, `get_ide_context`, `get_code_snippets`
- OAuth 2.0 for user authentication
- ChatGPT GPT can read/write to the shared store

**Option B: ChatGPT Desktop App + MCP**
- ChatGPT desktop app (macOS) now supports local MCP servers
- Install Context Bridge as a local MCP server
- ChatGPT can call `bridge_publish_message` directly

**Option C: OpenAI Agents SDK**
- Use the Agents SDK to build an agent that speaks to the bridge
- Deploy as a web service that ChatGPT can invoke

#### Component 4: IDE Integration Layer
IDEs already speak MCP. Simply add the Context Bridge MCP server.

**Cursor**: Add to `~/.cursor/mcp.json`
**Windsurf**: Add to `mcp_config.json`
**VS Code**: Add to workspace MCP settings
**Claude Desktop**: Add to `claude_desktop_config.json`

### 3.3 Message Flow: ChatGPT → IDE

```
1. User asks ChatGPT: "Why is my query slow?"
2. ChatGPT needs schema context
3. ChatGPT calls bridge_get_schema_snapshot(db="postgres")
4. Context Bridge returns cached schema from Redis
5. ChatGPT analyzes and generates recommendation
6. ChatGPT calls bridge_share_code_snippet(
     thread_id="perf-123",
     code="CREATE INDEX idx_orders_date ON orders(created_at);",
     description="Suggested index for slow query"
   )
7. IDE agent calls bridge_get_unread_messages()
8. IDE displays: "ChatGPT suggests: CREATE INDEX..."
9. IDE applies the change via fs_edit_file
10. IDE calls bridge_publish_message("Index applied successfully")
```

### 3.4 Message Flow: IDE → ChatGPT

```
1. IDE agent encounters error: "Connection timeout to Redis"
2. IDE calls bridge_share_error_log(
     error="Redis connection timeout",
     stack_trace="...",
     context={"redis_url": "...", "timeout_ms": 5000}
   )
3. ChatGPT (monitoring thread) receives notification
4. ChatGPT analyzes: "Increase timeout or check network"
5. ChatGPT calls bridge_publish_message(
     content="Try setting REDIS_TIMEOUT=10000 in .env"
   )
6. IDE reads message and applies fix
```

---

## 4. Emerging Protocols: A2A & AG-UI

### 4.1 Google A2A Protocol (Agent2Agent)

**Announced**: April 2025 by Google
**Donated to**: Linux Foundation
**Partners**: 50+ including Salesforce, ServiceNow, MongoDB, Atlassian, PayPal

**What It Is**:
- Open protocol for AI agents to discover, communicate, and delegate tasks to each other
- Uses HTTP, SSE, and JSON-RPC 2.0
- Agent Cards: JSON metadata describing agent capabilities
- Task lifecycle: submitted → working → input-required → completed

**How A2A Relates to MCP**:
- **MCP** = Agent ↔ Tool (tools, resources, prompts)
- **A2A** = Agent ↔ Agent (task delegation, collaboration)
- They are **complementary**, not competing

**A2A Architecture**:
```
┌─────────────┐      A2A Request      ┌─────────────┐
│   Agent A   │ ─────────────────────► │   Agent B   │
│  (Client)   │                        │  (Remote)   │
└─────────────┘ ◄────────────────────── └─────────────┘
      ▲         SSE Streaming Response        ▲
      │                                       │
      └────── Uses MCP to access tools ───────┘
```

**Implications for DB-MCP**:
- DB-MCP can expose itself as an A2A agent ("Database Analyst Agent")
- Other agents can delegate database tasks to DB-MCP via A2A
- DB-MCP can delegate to other agents (e.g., "Security Agent" for audit)
- Agent Card describes: "I can analyze PostgreSQL, MSSQL, MySQL, SQLite databases"

**Implementation Path**:
1. Add `/agent.json` endpoint (Agent Card)
2. Implement A2A task endpoints (`/tasks/send`, `/tasks/get`)
3. Use existing MCP tools as the agent's capabilities
4. Return database results as A2A artifacts

### 4.2 AG-UI Protocol (Agent-User Interaction)

**What It Is**:
- Open, lightweight, event-based protocol for AI agent → frontend communication
- Standardizes how agents stream events to UIs
- Events: `AgentStart`, `ToolCallStart`, `ToolCallArgs`, `ToolCallEnd`, `AgentFinish`

**Why It Matters for DB-MCP**:
- Current DB-MCP returns static JSON. AG-UI enables **streaming results**.
- Query execution can stream row-by-row instead of waiting for completion
- GitHub tree traversal can stream file entries progressively
- Frontend can show real-time progress of long-running operations

**AG-UI Event Types**:
```typescript
interface ToolCallStart {
  type: "tool_call_start";
  tool_call_id: string;
  tool_name: string;
}

interface ToolCallArgs {
  type: "tool_call_args";
  tool_call_id: string;
  args: Record<string, any>;
}

interface ToolCallEnd {
  type: "tool_call_end";
  tool_call_id: string;
  result: any;
}
```

**Integration Strategy**:
- Add SSE endpoint: `/api/agui/stream`
- Stream tool execution events in real-time
- Frontend (or IDE plugin) subscribes to events
- Enables "live query execution" UX

---

## 5. Real-Time Synchronization Implementation

### 5.1 Transport Options

| Transport | Latency | Reliability | Best For |
|-----------|---------|-------------|----------|
| **SSE** | ~100ms | Good | One-way streaming (server → client) |
| **WebSocket** | ~50ms | Good | Bidirectional real-time |
| **HTTP Long-Polling** | ~500ms | Moderate | Fallback for restrictive networks |
| **Redis Pub/Sub** | ~10ms | Excellent | Internal server-to-server sync |

**Recommended**: WebSocket for IDE; SSE for ChatGPT web; Redis Pub/Sub for internal bridge.

### 5.2 Sync Protocol

**Message Envelope**:
```typescript
interface SyncMessage {
  id: string;           // UUID
  timestamp: string;    // ISO 8601
  source: "chatgpt" | "ide" | "bridge";
  target: "chatgpt" | "ide" | "all";
  type: "code" | "text" | "schema" | "error" | "query_result" | "action";
  thread_id: string;
  project_id: string;
  payload: {
    content: string;
    metadata: Record<string, any>;
    mime_type?: string;
  };
  priority: "low" | "normal" | "high" | "urgent";
  ttl_seconds?: number; // Auto-expire
}
```

### 5.3 Conflict Resolution

When both ChatGPT and IDE modify the same context:

**Strategy**: Last-Write-Wins with vector clocks

```
1. Each message includes vector_clock: {"chatgpt": 5, "ide": 3}
2. On conflict, compare clocks:
   - If one dominates, accept it
   - If concurrent, merge payloads
3. For code: use 3-way merge (git-style)
4. For text: concatenate with separator
```

### 5.4 Implementation: Context Bridge API

```typescript
// app/api/bridge/route.ts

// POST /api/bridge/publish
export async function POST(req: Request) {
  const msg: SyncMessage = await req.json();

  // 1. Validate auth (API key or OAuth token)
  await validateBridgeAuth(req);

  // 2. Store in Redis
  await redis.zadd(
    `bridge:messages:${msg.thread_id}`,
    Date.now(),
    JSON.stringify(msg)
  );

  // 3. Publish to Pub/Sub for real-time subscribers
  await redis.publish(
    `bridge:channel:${msg.project_id}`,
    JSON.stringify(msg)
  );

  // 4. Update unread counts
  if (msg.target !== "all") {
    await redis.hincrby(
      `bridge:unread:${msg.target}`,
      msg.thread_id,
      1
    );
  }

  return Response.json({ success: true, message_id: msg.id });
}

// GET /api/bridge/stream (SSE)
export async function GET(req: Request) {
  const project_id = req.headers.get("x-project-id");
  const client_id = req.headers.get("x-client-id");

  const stream = new ReadableStream({
    start(controller) {
      const listener = (channel: string, message: string) => {
        const msg = JSON.parse(message);
        if (msg.project_id === project_id) {
          controller.enqueue(
            `data: ${JSON.stringify(msg)}\n\n`
          );
        }
      };

      redis.subscribe(`bridge:channel:${project_id}`, listener);

      // Heartbeat every 30s
      const heartbeat = setInterval(() => {
        controller.enqueue(`:heartbeat\n\n`);
      }, 30000);

      req.signal.addEventListener("abort", () => {
        clearInterval(heartbeat);
        redis.unsubscribe(listener);
      });
    }
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      "Connection": "keep-alive"
    }
  });
}
```

---

## 6. Multi-Client Shared Context Patterns

### 6.1 The Problem: MCP Is Client-Isolated

**Current MCP Architecture**:
- Each MCP client (Claude Desktop, Cursor, Windsurf) connects independently
- No mechanism for clients to share context
- Each client re-discovers tools, re-learns project state

### 6.2 Pattern 1: Shared Memory Server

A dedicated MCP server that all clients connect to:

```
Claude Desktop ──┐
                 ├─► Shared Memory MCP Server ──► Redis
Cursor IDE ──────┤     (bridge_context tools)
                 │
ChatGPT GPT ─────┘
```

**Tools**:
- `memory_store` — Store key-value with TTL
- `memory_retrieve` — Get by key with semantic search
- `memory_search` — Full-text search across stored memories
- `memory_delete` — Remove specific memory
- `memory_list_topics` — List all topic namespaces

### 6.3 Pattern 2: Project State Sync

Synchronize project-wide state that all clients can access:

**State Types**:
- `project_schema_cache` — Latest DB schema for all connected databases
- `project_git_state` — Current branch, recent commits, uncommitted changes
- `project_open_files` — Files currently open in IDE
- `project_recent_queries` — Last 20 executed queries with results
- `project_conversation_threads` — Active discussion topics

**Sync Trigger**:
- On DB schema change → broadcast `schema_updated` event
- On git commit → broadcast `git_state_changed` event
- On query execution → broadcast `new_query_result` event

### 6.4 Pattern 3: Conversation Federation

Allow conversations to be shared across clients:

```
Conversation Thread: "Optimize Slow Query"
├── Message 1 (ChatGPT): "Check the orders table indexes"
├── Message 2 (IDE): "Found missing index on created_at"
├── Message 3 (ChatGPT): "Run EXPLAIN to verify"
├── Message 4 (IDE): "[EXPLAIN result attached]"
└── Message 5 (ChatGPT): "Index scan confirmed. Good to go."
```

All 5 messages visible in BOTH ChatGPT and IDE chat panels.

---

## 7. Memory & Persistent Context Servers

### 7.1 Existing Solutions

From research, several MCP memory servers exist:

| Server | Features | Store |
|--------|----------|-------|
| **Memory MCP** (a2a-mcp.org) | Knowledge graph, semantic search, entities/relations | SQLite/JSON |
| **mcp-memory-service** | Persistent memory, emotional valence, episodes | SQLite |
| **mcp-memory-keeper** | Session context preservation for Claude Code | File-based |
| **Recall** | Persistent searchable memory for Cursor | SQLite |

### 7.2 What DB-MCP Should Add

**Unified Memory Layer** built on existing Redis infrastructure:

**Tools**:
- `memory_create_entity` — Create knowledge graph entity
- `memory_add_observation` — Add observation to entity
- `memory_create_relation` — Link two entities
- `memory_search_semantic` — Vector similarity search
- `memory_search_keyword` — Full-text search
- `memory_get_entity` — Get entity with all observations
- `memory_get_related` — Get entities related to a given entity

**Use Cases**:
- Remember that "orders table has 50M rows" across sessions
- Remember user's preference for "snake_case column names"
- Remember previous optimization decisions
- Build project knowledge graph: tables → relationships → business logic

**Architecture**:
```
┌─────────────┐     ┌──────────────┐     ┌─────────────┐
│  MCP Client │────►│  Memory API  │────►│   Redis     │
│  (any IDE)  │     │  (tools)     │     │  + Vector   │
└─────────────┘     └──────────────┘     │  Extension  │
                                         └─────────────┘
```

Use Redis Stack (redis-stack-server) for vector search, or Upstash Vector.

---

## 8. Integration with IDE Ecosystems

### 8.1 Windsurf Cascade Integration

**Windsurf Features Relevant to Bridge**:
- **Cascade Hooks**: `pre_mcp_tool_use`, `post_mcp_tool_use`, `post_cascade_response`
- **Memories & Rules**: Persistent context storage
- **MCP Config**: `mcp_config.json` supports remote HTTP MCPs
- **Spaces**: Project-scoped workspaces with shared context

**Integration**:
1. Add Context Bridge to `mcp_config.json`
2. Configure Cascade Hook to auto-share responses:
```json
{
  "hooks": {
    "post_cascade_response": {
      "command": "curl -X POST https://bridge.db-mcp.dev/share",
      "args": ["--data", "@{response}"]
    }
  }
}
```

### 8.2 Cursor Integration

**Cursor Features**:
- Supports MCP servers via `.cursor/mcp.json`
- **Composer**: AI agent that can run terminal commands, edit files
- **@ Symbols**: Reference files, docs, web pages

**Integration**:
1. Add Context Bridge MCP to Cursor config
2. Cursor Composer can call `bridge_share_code_snippet` after edits
3. Cursor can read ChatGPT suggestions via `bridge_get_unread_messages`

### 8.3 VS Code Copilot Integration

**VS Code MCP Support** (as of 2025):
- Native MCP server support in settings
- Copilot Chat can invoke MCP tools

**Integration**:
1. Add Context Bridge to VS Code MCP settings
2. Copilot Chat shares context automatically via bridge tools

### 8.4 Claude Desktop Integration

**Claude Desktop**:
- Native MCP support via `claude_desktop_config.json`
- Can run multiple MCP servers simultaneously

**Integration**:
1. Add both DB-MCP AND Context Bridge to Claude Desktop
2. Claude can query DB AND share insights with IDE in one conversation

---

## 9. Implementation Roadmap

### Phase 1: Context Bridge MVP (Week 1-2)
- [ ] Create `lib/tools/bridge/` module
- [ ] Implement Redis-based message store
- [ ] Add 5 core tools: `publish`, `get_unread`, `share_code`, `share_schema`, `get_history`
- [ ] Add SSE streaming endpoint `/api/bridge/stream`
- [ ] Test with Claude Desktop + Cursor simultaneously

### Phase 2: ChatGPT Integration (Week 3-4)
- [ ] Build Custom GPT with Actions
- [ ] Implement OAuth 2.0 for ChatGPT → Bridge auth
- [ ] Add `bridge_share_query_result` for DB results
- [ ] Add webhook for real-time notifications
- [ ] Test end-to-end: ChatGPT suggests → IDE applies → ChatGPT verifies

### Phase 3: Memory Layer (Week 5-6)
- [ ] Add `lib/tools/memory/` module
- [ ] Implement knowledge graph (entities, observations, relations)
- [ ] Add semantic search using Redis Vector or OpenAI embeddings
- [ ] Integrate with existing DB introspection to auto-populate entities
- [ ] Auto-remember: schema, slow queries, user preferences

### Phase 4: A2A Agent Support (Week 7-8)
- [ ] Add `/agent.json` endpoint (Agent Card)
- [ ] Implement A2A task endpoints
- [ ] Register DB-MCP as "Database Analyst Agent" in A2A ecosystem
- [ ] Enable task delegation: other agents can send database tasks to DB-MCP

### Phase 5: New Tool Categories (Week 9-12)
- [ ] Filesystem tools (`fs_read`, `fs_write`, `fs_search`)
- [ ] Web search tools (`web_search`, `web_fetch`)
- [ ] Document tools (`docs_search_notion`, `docs_get_confluence`)
- [ ] Cloud tools (`cloud_list_aws_resources`, `cloud_get_logs`)
- [ ] Container tools (`k8s_list_pods`, `docker_get_logs`)

### Phase 6: AG-UI Streaming (Week 13-14)
- [ ] Add SSE streaming for tool execution
- [ ] Stream query results row-by-row
- [ ] Stream GitHub tree traversal file-by-file
- [ ] Build minimal frontend to consume AG-UI events

---

## 10. Research Sources

| Source | URL | Date Accessed |
|--------|-----|---------------|
| MCP Specification | modelcontextprotocol.io/specification/2025-11-25 | 2026-05-13 |
| A2A Protocol | a2a-protocol.org/latest/ | 2026-05-13 |
| A2A GitHub | github.com/a2aproject/A2A | 2026-05-13 |
| AG-UI Protocol | docs.ag-ui.com/introduction | 2026-05-13 |
| AG-UI GitHub | github.com/ag-ui-protocol/ag-ui | 2026-05-13 |
| Windsurf Cascade MCP | docs.windsurf.com/windsurf/cascade/mcp | 2026-05-13 |
| Windsurf Memories | docs.windsurf.com/windsurf/cascade/memories | 2026-05-13 |
| Windsurf Hooks | docs.windsurf.com/windsurf/cascade/hooks | 2026-05-13 |
| Memory MCP | a2a-mcp.org/entry/memory-mcp | 2026-05-13 |
| OpenAI MCP Apps SDK | developers.openai.com/apps-sdk/concepts/mcp-server | 2026-05-13 |
| Cursor AI Agents | credal.ai/blog/how-to-integrate-agents-into-cursor | 2026-05-13 |
| VS Code MCP | code.visualstudio.com/docs/copilot/customization/mcp-servers | 2026-05-13 |
| MCP Filesystem Server | github.com/modelcontextprotocol/servers/tree/main/src/filesystem | 2026-05-13 |

---

*This document serves as the master architecture for expanding DB-MCP from a database-only server to a comprehensive AI infrastructure platform with multi-agent synchronization capabilities.*
