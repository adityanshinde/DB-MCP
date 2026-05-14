# Agent Protocol Landscape Research

**Research Date**: May 13, 2026
**Sources**: A2A Protocol Spec (a2a-protocol.org), ACP Documentation (agentclientprotocol.com), GitHub Discussions, MCP Community, Web Research

---

## Executive Summary

The agent protocol ecosystem has exploded into **four competing/complementary standards**, each solving a different layer of the multi-agent stack:

| Protocol | Backer | Focus | Layer | Status |
|----------|--------|-------|-------|--------|
| **MCP** | Anthropic | Agent ↔ Tool | Vertical | Production ready |
| **A2A** | Google / Linux Foundation | Agent ↔ Agent | Horizontal | Production (150+ orgs) |
| **ACP** | Agent Client Protocol Org | Editor ↔ Agent | Vertical | Active development |
| **AG-UI** | AG-UI Community | Agent ↔ UI | Presentation | Early |
| **IACP** | WorksWithAgents (vystartasv) | Agent ↔ Agent | Horizontal | IETF Draft |

**Key Insight**: MCP is already the de facto standard for agent-tool communication. A2A is winning for agent-agent coordination. ACP is emerging as the editor-agent standard. The fragmentation is real, but the protocols are **complementary**, not mutually exclusive.

**Implication for DB-MCP**: We should support **MCP first** (already done), **A2A second** (expose DB-MCP as a "Database Analyst Agent"), and **monitor ACP** (for editor integration). No additional cost. Just new endpoints.

---

## 1. MCP (Model Context Protocol) — The Foundation

**Backer**: Anthropic (Nov 2024)
**Purpose**: Standardize how AI agents connect to external tools, data sources, and APIs.

### What It Does
- **Tools**: Agents call functions with structured inputs/outputs
- **Resources**: Agents read data (files, database schemas, API responses)
- **Prompts**: Agents use pre-defined prompt templates
- **Transport**: stdio (local) or HTTP/SSE (remote)

### MCP in DB-MCP
Already implemented. DB-MCP is an MCP server exposing:
- 50+ database tools (`run_query`, `explain_query`, `list_tables`, etc.)
- 15+ GitHub tools (`get_file_content`, `search_code`, `get_repo_tree`, etc.)
- Resource-based schema introspection

### Status
- **Production ready**
- Supported by: Claude Desktop, Cursor, Windsurf, VS Code Copilot, GitHub Copilot
- 10,000+ community MCP servers

---

## 2. A2A (Agent-to-Agent Protocol) — The Coordination Layer

**Backer**: Google (April 2025) → Donated to Linux Foundation
**Purpose**: Enable agents from different vendors to discover, delegate, and coordinate tasks.

### What It Does
- **Agent Cards** (`/agent.json`): JSON metadata advertising agent capabilities
- **Tasks**: Core unit of work with lifecycle (`submitted → working → completed`)
- **Messages**: Communication between agents with typed parts (text, file, structured data)
- **Artifacts**: Task outputs (query results, generated files)
- **Operations**: `sendMessage`, `getTask`, `listTasks`, `cancelTask`, `subscribeToTask`

### Architecture
```
┌─────────────┐      A2A Request      ┌─────────────┐
│   Agent A   │ ─────────────────────►│   Agent B   │
│  (Client)   │                       │  (Remote)   │
└─────────────┘◄──────────────────────└─────────────┘
   ↑                                      │
   └────── Agent B uses MCP to call ─────┘
          tools internally (like DB-MCP)
```

### A2A vs MCP

| | **MCP** | **A2A** |
|---|---|---|
| **Question** | "What tools can this agent access?" | "Which agent should handle this task?" |
| **Analogy** | Agent's plug into the world | Coordination layer between agents |
| **Relationship** | Agent uses MCP to call tools | Agent uses A2A to delegate to another agent |
| **Example** | `run_query` tool | "Database Analyst Agent, analyze my slow queries" |

**They work in sequence**: An orchestrator agent uses A2A to route a task to DB-MCP. DB-MCP then uses its own MCP tools to fulfill the task and returns artifacts.

### Production Adoption (April 2026)
- **150+ organizations** supporting A2A
- **22,000+ GitHub stars**
- **SDKs**: Python, JavaScript, Java, Go, .NET
- **Cloud**: Google Cloud, Azure AI Foundry, AWS Bedrock AgentCore
- **Enterprise**: Salesforce, SAP, ServiceNow, PayPal, Box, Atlassian
- **Consulting**: Accenture, BCG, Deloitte, McKinsey, PwC, TCS, Wipro

### Protocol Bindings
| Binding | Transport | Best For |
|---------|-----------|----------|
| **JSON-RPC** | HTTP + JSON-RPC 2.0 + SSE | Web services |
| **gRPC** | HTTP/2 + Protocol Buffers | High performance |
| **HTTP+JSON/REST** | Standard REST | Easy debugging |

### Security
- OAuth 2.0 / OpenID Connect for auth
- Agent Card signing with JWS
- In-task authorization with scoped credentials

### Implications for DB-MCP
1. **Expose `/agent.json`**: Advertise DB-MCP as "Database Analyst Agent"
2. **Implement A2A endpoints**: `/tasks/send`, `/tasks/get`, `/tasks/list`
3. **Use existing MCP tools internally**: A2A task comes in → call `run_query` → return artifact
4. **Zero additional cost**: Just new HTTP endpoints on existing Next.js app

---

## 3. ACP (Agent Client Protocol) — The Editor Standard

**Backer**: Agent Client Protocol Organization (independent)
**Purpose**: Standardize communication between **code editors** (VS Code, Cursor, Zed, Windsurf) and **coding agents** (programs that autonomously modify code using AI).

### What It Does
ACP is a **JSON-RPC 2.0 protocol** that defines how editors and agents communicate:

### Core Concepts
- **Sessions**: Stateful conversation contexts (like a chat thread)
- **Prompt Turns**: User sends a message → Agent processes → Returns response
- **Tool Calls**: Agent requests tool execution (file ops, terminal commands, MCP servers)
- **Updates**: Streaming progress notifications during agent processing
- **Slash Commands**: Pre-defined commands advertised by the agent

### Message Flow
```
Initialization Phase
  Client → Agent: initialize (negotiate versions, exchange capabilities)
  Client → Agent: authenticate (if required)

Session Setup
  Client → Agent: session/new (create new session)
  OR
  Client → Agent: session/load (resume existing)

Prompt Turn
  Client → Agent: session/prompt (send user message)
  Agent → Client: session/update (progress notifications, streaming)
  Agent → Client: tool/invoke (request file edit, terminal command, MCP tool)
  Client → Agent: tool/result (return tool execution result)
  Agent → Client: session/prompt response (final answer with stop reason)
```

### Agent Methods

#### Baseline (Required)
| Method | Purpose |
|--------|---------|
| `initialize` | Negotiate versions, exchange capabilities |
| `session/new` | Create a new conversation session |
| `session/prompt` | Send user message, get agent response |

#### Optional
| Method | Purpose |
|--------|---------|
| `session/load` | Resume an existing session |
| `session/resume` | Resume a paused session |
| `session/list` | List all active sessions |
| `session/close` | Close a session |
| `session/modes` | Switch agent operating modes |
| `session/config` | Configure session-level options |

### ACP vs MCP

| | **MCP** | **ACP** |
|---|---|---|
| **Scope** | Agent ↔ Any tool/data | Editor ↔ Coding Agent |
| **Stateful** | Stateless (per-request) | Stateful (sessions, turns) |
| **Transport** | stdio or HTTP/SSE | JSON-RPC 2.0 |
| **Who uses it** | Claude Desktop, Cursor, Windsurf | VS Code, Zed, Cursor, Windsurf |
| **Relationship** | ACP agents **use MCP internally** to call tools | ACP is the "wrapper" around the agent |

**Key insight**: ACP is **MCP-friendly by design**. It reuses MCP types where possible. An ACP agent can call MCP servers (like DB-MCP) as part of its tool execution.

### ACP Registry
A centralized registry for discovering ACP-compatible agents:
- `agentclientprotocol.com/registry`
- Agents publish metadata: name, capabilities, supported modes, authentication

### RFDs (Requests for Dialog)
ACP uses an RFC-like process for protocol changes:
- **RFD: MCP-over-ACP**: Run MCP servers inside ACP channels
- **RFD: SubAgent ToolKind**: Delegate work to child agents
- **RFD: Session Config Options**: Flexible configuration selectors
- **RFD: Elicitation**: Structured user input prompts

### SubAgent Support (Discussion #690)
ACP is adding a `subagent` ToolKind to allow agents to delegate work to specialist sub-agents:
```typescript
sessionCapabilities.subagents?: {
  promptDelegation?: boolean  // Can delegate prompt turns
  background?: boolean        // Can run subagents in background
}

// New fields on responses
availableSubagents?: SubagentInfo[]

// New ToolKind
ToolKind: "subagent"

// Hierarchy tracking
parentSessionId?: string
parentToolCallId?: string
subagentId?: string
```

### SDKs
| Language | Status |
|----------|--------|
| TypeScript | Active |
| Python | Active |
| Rust | Active |
| Java | Active |
| Kotlin | Active |

### Implications for DB-MCP
1. **ACP is editor-focused**: DB-MCP is a data tool, not a coding agent. Direct ACP support is low priority.
2. **But**: If an ACP coding agent needs database access, it will use MCP to call DB-MCP. This is already supported.
3. **Opportunity**: If we ever build a "Database Code Assistant" agent (that writes SQL + generates migrations), ACP would be the right protocol.
4. **Monitor**: The `subagent` RFD is interesting — DB-MCP could be exposed as a specialist subagent for database tasks.

---

## 4. IACP (Inter-Agent Communication Protocol) — The Proposed Standard

**Backer**: WorksWithAgents / vystartasv (independent researcher)
**Purpose**: A peer-to-peer protocol for agent-to-agent communication, proposed as MCP's natural companion.

### What It Does
- Every agent is both **client and server**
- Agents discover each other, advertise capabilities, exchange signed messages
- Negotiate work and coordinate tasks without human intermediaries

### Relationship to MCP
> "IACP is designed to work alongside MCP, not replace it. An agent uses MCP to call tools AND IACP to communicate with other agents."

### Status
- **IETF Internet-Draft**: `draft-vystartas-iacp-00`
- **Reference implementations**: Python (`pip install workswithagents`), TypeScript (`npm install @workswithagents/agent-foundry`)
- **Part of**: 16-spec "Agent OSI Model" framework

### Implications for DB-MCP
- **Speculative**: IACP is still a draft. A2A has much more momentum.
- **Watch**: If IACP gains IETF traction, it could become a formal standard.
- **No action needed now**: A2A adoption is the pragmatic path.

---

## 5. AG-UI (Agent-User Interaction Protocol) — The UI Layer

**Backer**: AG-UI Community
**Purpose**: Standardize how agents render UI components to users (forms, charts, buttons, etc.).

### What It Does
- Defines message formats for UI components
- Enables agents to send interactive elements (not just text)
- Cross-platform UI rendering across different agent interfaces

### Status
- Early stage, limited adoption
- Less mature than MCP, A2A, ACP

### Implications for DB-MCP
- **Low priority**: DB-MCP returns data, not UI components.
- **Future**: If we build a web dashboard that agents can control, AG-UI might be relevant.

---

## 6. Protocol Comparison Matrix

| Feature | MCP | A2A | ACP | IACP | AG-UI |
|---------|-----|-----|-----|------|-------|
| **Backer** | Anthropic | Google / LF | ACP Org | Independent | Community |
| **Layer** | Agent-Tool | Agent-Agent | Editor-Agent | Agent-Agent | Agent-UI |
| **Transport** | stdio, HTTP/SSE | JSON-RPC, gRPC, REST | JSON-RPC 2.0 | TBD | TBD |
| **Stateful** | No | Yes (Tasks) | Yes (Sessions) | Yes | No |
| **Discovery** | Tool listing | Agent Cards | ACP Registry | Peer-to-peer | None |
| **Production** | Yes | Yes (150+ orgs) | Growing | Draft | Early |
| **DB-MCP Relevance** | **High** (done) | **High** (next) | **Medium** (monitor) | **Low** (watch) | **Low** |

---

## 7. The Fragmentation Problem (Real-World Perspective)

From the OpenClaw community discussion (#98):

> "We have been running agents for 90 days. The protocol landscape is getting crowded. We need integrations for:
> - Tools → MCP ✓
> - Other agents → A2A? IACP?
> - User interfaces → AG-UI?
> - Code editors → ACP?
> 
> Right now, we need 4 different integrations. Each has different message formats, auth mechanisms, discovery protocols, and state management."

**The community consensus**:
1. **MCP is the de facto standard** for agent-tool communication. Bet on it.
2. **A2A is winning** for agent-agent coordination (Google + Linux Foundation + 150 orgs).
3. **ACP is emerging** as the editor standard (independent but well-designed).
4. **Don't bet on one winner** — implement adapters/bridges where needed.
5. **A meta-protocol is unlikely** — the layers are too different.

---

## 8. Strategic Recommendations for DB-MCP

### Immediate (Now)
1. **Continue with MCP** — This is our core protocol. Already working perfectly.

### Short-Term (Next 2-3 months)
2. **Add A2A support** — Expose DB-MCP as a "Database Analyst Agent":
   - Add `/agent.json` endpoint (Agent Card)
   - Implement `/tasks/send`, `/tasks/get`, `/tasks/list`
   - Map existing MCP tools to A2A task handlers
   - **Cost**: $0 (just new endpoints on existing Next.js app)

3. **Monitor ACP** — Watch the `subagent` RFD. If ACP adds first-class subagent delegation, DB-MCP could be registered as a specialist subagent for database tasks.

### Medium-Term (6 months)
4. **Context Bridge** — Build on the existing Context Bridge MCP Server architecture. Use A2A for agent-to-agent delegation and MCP for tool access.

5. **Shared Storage** — Continue using Redis/Upstash for multi-agent context sync. This is protocol-agnostic and works with MCP, A2A, and ACP.

### What NOT To Do
- ❌ Don't build an ACP agent (DB-MCP is a tool, not a coding agent)
- ❌ Don't wait for IACP to mature (A2A is the pragmatic choice)
- ❌ Don't invest in AG-UI (not relevant for data tools)
- ❌ Don't build a meta-protocol (waste of effort, community already rejected this)

---

## 9. Implementation Path: A2A for DB-MCP

### Step 1: Agent Card (`/agent.json`)
```json
{
  "name": "DB-MCP Database Analyst",
  "description": "Analyzes PostgreSQL, MSSQL, MySQL, and SQLite databases. Provides schema introspection, query execution, optimization recommendations, and data profiling.",
  "version": "1.0.0",
  "capabilities": {
    "streaming": true,
    "pushNotifications": false
  },
  "skills": [
    {
      "id": "schema-analysis",
      "name": "Database Schema Analysis",
      "description": "Returns table structures, columns, relationships, and indexes",
      "tags": ["sql", "postgres", "mssql", "mysql", "sqlite", "schema"],
      "inputModes": ["application/json", "text/plain"],
      "outputModes": ["application/json"]
    },
    {
      "id": "query-execution",
      "name": "Safe Query Execution",
      "description": "Executes read-only SQL queries with automatic limit injection",
      "tags": ["sql", "query", "read-only"],
      "inputModes": ["application/json"],
      "outputModes": ["application/json"]
    },
    {
      "id": "query-optimization",
      "name": "Query Optimization",
      "description": "Returns EXPLAIN plans and index recommendations",
      "tags": ["sql", "optimization", "performance"],
      "inputModes": ["application/json"],
      "outputModes": ["application/json", "text/plain"]
    }
  ],
  "supportedInterfaces": [
    {
      "url": "https://dbmcp.example.com/a2a",
      "protocolBinding": "HTTP+JSON",
      "protocolVersion": "1.0"
    }
  ]
}
```

### Step 2: Task Endpoints
| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/a2a/tasks/send` | POST | Receive a task, process it using MCP tools, return Task |
| `/a2a/tasks/get` | GET | Get task status and artifacts |
| `/a2a/tasks/list` | GET | List tasks with filtering |
| `/a2a/tasks/cancel` | POST | Cancel an ongoing task |
| `/a2a/tasks/subscribe` | SSE | Stream real-time updates |

### Step 3: Task → MCP Tool Mapping
```typescript
// A2A Task: "Analyze slow queries on the orders table"
// → DB-MCP internally calls:
//   1. run_query("SHOW slow_query_log")
//   2. explain_query("SELECT * FROM orders WHERE...")
//   3. get_indexes("orders")
//   4. get_table_stats("orders")
// → Returns artifacts: query plan, index recommendations, table stats
```

### Step 4: Zero-Cost Principle
- No new infrastructure needed
- No LLM API costs (DB-MCP remains deterministic)
- Just new HTTP endpoints on the existing Next.js app
- Reuses existing authentication, caching, and database connection pools

---

## 10. Sources & References

| Source | URL | Date Accessed |
|--------|-----|---------------|
| A2A Protocol Spec | a2a-protocol.org/latest/specification/ | 2026-05-13 |
| A2A Protocol Guide | atlan.com/know/google-a2a-protocol/ | 2026-05-13 |
| A2A GitHub | github.com/a2aproject/A2A | 2026-05-13 |
| ACP Documentation | agentclientprotocol.com | 2026-05-13 |
| ACP GitHub | github.com/agentclientprotocol/agent-client-protocol | 2026-05-13 |
| IACP Proposal | github.com/modelcontextprotocol/discussions/2689 | 2026-05-13 |
| Protocol Comparison | github.com/openclaw-community/openclaw-hub/discussions/98 | 2026-05-13 |
| ACP vs A2A | github.com/agentclientprotocol/discussions/120 | 2026-05-13 |
| ACP SubAgent RFD | github.com/agentclientprotocol/discussions/690 | 2026-05-13 |
| MCP Spec | modelcontextprotocol.io/specification/ | 2026-05-13 |
| Google ADK + ACP | github.com/google/adk-python/discussions/5042 | 2026-05-13 |
| AG-UI Protocol | docs.ag-ui.com/introduction | 2026-05-13 |

---

## Key Takeaway

> **DB-MCP's strategy: MCP for tools (done), A2A for agent delegation (next), ACP for editor integration (monitor). Everything else is noise. No protocol is a threat — they all need rich data, and DB-MCP is the best at providing it.**

---

## Appendix: OS Integration Reference — Windows-MCP

**Repository**: `github.com/CursorTouch/Windows-MCP`

**What It Is**: Production-ready MCP server for Windows OS integration. Enables agents to perform desktop automation (click, type, scroll), app control, PowerShell execution, registry operations, and web scraping.

**Key Innovation**: Label-to-coordinate resolution — agents reference UI elements by label (extracted from UI Automation tree) instead of hard-coded coordinates.

**Complementarity with DB-MCP**:
- DB-MCP provides data (database queries, GitHub code)
- Windows-MCP provides OS control (launch apps, export to Excel, send notifications)
- Together they enable end-to-end workflows:
  ```
  1. Agent uses Windows-MCP to open SQL Server Management Studio
  2. Agent uses DB-MCP to run queries and analyze results
  3. Agent uses Windows-MCP to export results to Excel
  4. Agent uses Windows-MCP to send notification with report
  ```

**Reference Architecture**: If DB-MCP ever needs OS integration, Windows-MCP's architecture is a proven model:
- UIA for element detection (cross-platform equivalent: Accessibility APIs)
- Label-to-coordinate resolution for flexible automation
- PowerShell executor (cross-platform equivalent: subprocess/shell)
- Modular tool registration pattern

**Status**: v0.7.4 (beta), actively maintained, production-ready for Windows environments.

**Documented in**: `product_dev/14-expanded-tool-ecosystem-chatgpt-ide-bridge.md` (Section 1.11)
