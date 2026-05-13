# AI/ML-Native Features Proposal

## Philosophy

DB-MCP remains a **deterministic data provider** — it fetches, validates, and returns structured data. It does NOT run LLMs or pay for API tokens.

**All reasoning, inference, and natural language understanding is handled by the user's IDE agent** (Claude, GPT, Cursor, etc.). DB-MCP's job is to:
1. Provide **rich tool descriptions** so the agent knows what data is available
2. Return **comprehensive schema context** (tables, columns, relationships, sample data)
3. Offer **specialized data tools** (profiling, EXPLAIN plans, query history) that the agent can compose into intelligent workflows

**Zero-Cost Principle**: DB-MCP must never incur LLM API costs. If a feature requires reasoning, it is the client's responsibility.

---

## Feature 1: Natural Language to SQL (NL2SQL) — Client-Side

### Problem
Users want to ask questions in plain English, but their IDE agent may not have enough schema context to generate accurate SQL.

### Solution
DB-MCP provides a **schema context tool** that returns everything the agent needs to generate SQL locally. No server-side LLM is involved.

### Implementation

**Tool: `get_nl2sql_context`**
```typescript
{
  name: "get_nl2sql_context",
  description: `Returns comprehensive schema context for NL2SQL generation.
Include this context in your prompt when generating SQL.

Returns:
- All tables with column names, types, constraints
- Foreign key relationships
- Sample values for enum-like columns
- Table row counts (to suggest JOIN order)
- Recently queried tables (from query history)

The agent should use this context + the user's question
to generate SQL locally, then call run_query to execute.`,
  inputSchema: {
    db: z.enum(SUPPORTED_DATABASES),
    question: z.string().describe("The user's natural language question"),
    include_sample_data: z.boolean().default(true)
  }
}
```

**What DB-MCP Returns (Rich Context)**:
```json
{
  "tables": [
    {
      "name": "orders",
      "columns": [
        {"name": "id", "type": "UUID", "is_primary_key": true},
        {"name": "user_id", "type": "UUID", "foreign_key": "users.id"},
        {"name": "total_amount", "type": "DECIMAL(10,2)", "sample_values": [19.99, 49.50, 120.00]},
        {"name": "status", "type": "VARCHAR", "sample_values": ["pending", "paid", "shipped"]}
      ],
      "row_count": 125000,
      "recent_queries": ["SELECT status, COUNT(*) FROM orders GROUP BY status"]
    }
  ],
  "relationships": [
    {"from": "orders.user_id", "to": "users.id", "type": "many-to-one"}
  ],
  "suggested_tables": ["orders", "users", "order_items"]
}
```

**Validation Pipeline**:
1. Agent generates SQL using its own LLM + DB-MCP schema context
2. Agent sends SQL to DB-MCP `run_query`
3. DB-MCP validates `validateSelectOnlyQuery` (deterministic, zero cost)
4. If validation fails, DB-MCP returns clear error; agent retries

**Why This Is Better**:
- **Zero cost to DB-MCP**: No API keys, no token counting, no provider abstraction
- **Privacy**: Schema metadata stays within the user's IDE/agent; no data sent to external LLM APIs by DB-MCP
- **Model flexibility**: User can use Claude, GPT, Gemini, or local Ollama — whatever their IDE supports
- **Caching**: Agent can cache schema context for a session; DB-MCP caches metadata in Redis

---

## Feature 2: Intelligent Schema Documentation — Client-Side

### Problem
Database schemas often lack documentation. Column names like `ts`, `uid`, `status_code` are opaque to AI assistants and new team members.

### Solution
DB-MCP provides **raw schema metadata + profiling data** in a structured format. The user's IDE agent generates documentation using its own LLM.

### Implementation

**Tool: `get_schema_for_documentation`**
```typescript
{
  name: "get_schema_for_documentation",
  description: `Returns structured schema metadata and profiling data.
The agent should use this to generate human-readable documentation.

Returns per table:
- Table name, row count, estimated size
- All columns with types, constraints, defaults
- Sample values (top 10 distinct values for enums)
- Min/max for numeric columns
- Null percentage per column
- Foreign key relationships
- Recently executed queries involving this table

Suggested agent prompt:
"Given this schema metadata, generate concise documentation
for a junior developer. Explain business meaning where inferrable."`,
  inputSchema: {
    db: z.enum(SUPPORTED_DATABASES),
    tables: z.array(z.string()).optional()
  }
}
```

**What DB-MCP Returns**:
```json
{
  "table": "orders",
  "row_count": 125000,
  "size_mb": 45,
  "columns": [
    {
      "name": "status",
      "type": "VARCHAR(20)",
      "null_pct": 0,
      "distinct_values": ["pending", "paid", "shipped", "cancelled", "refunded"],
      "is_enum_like": true,
      "default": null
    }
  ],
  "relationships": [...],
  "query_patterns": ["SELECT * FROM orders WHERE status = ?"]
}
```

**Agent-Generated Example**:
```
Table: orders
Purpose: E-commerce order records
Columns:
  - id (UUID): Unique order identifier
  - user_id (UUID): References users.id — the customer who placed the order
  - total_amount (DECIMAL): Order total in USD, including tax
  - status (VARCHAR): One of: pending, paid, shipped, cancelled, refunded
```

**Why Client-Side**:
- Documentation style varies by team; agent can adapt tone
- No LLM cost for DB-MCP operator
- Agent can ask clarifying questions: "What does 'ts' mean in this context?"

---

## Feature 3: Query Explanation & Optimization — Client-Side

### Problem
Users run queries without understanding their performance implications or what they actually do.

### Solution
DB-MCP provides **raw EXPLAIN plans, index metadata, and query statistics**. The agent interprets these using its own reasoning.

### Implementation

**Tools for Agent to Compose**:
1. `explain_query` — Returns database-native EXPLAIN output (JSON/text)
2. `get_indexes` — Returns all indexes for referenced tables
3. `get_table_stats` — Returns row counts, size, column cardinality
4. `get_slow_queries` — Returns slow query log entries (if enabled)

**Example Agent Workflow**:
```
User: "Why is this query slow?"

Agent:
1. Calls explain_query → gets execution plan
2. Calls get_indexes → checks if index on WHERE column exists
3. Calls get_table_stats → sees table has 10M rows
4. Agent reasons: "The query scans 10M rows because there's no index
   on the 'status' column. I recommend adding an index."
```

**Tool Description Guidance**:
```typescript
{
  name: "explain_query",
  description: `Returns the database execution plan for a query.
The agent should analyze this to explain performance to the user.

Common patterns to explain:
- "Seq Scan" on large tables → missing index
- "Nested Loop" with no join condition → incorrect JOIN
- High "actual rows" vs "planned rows" → stale statistics

Suggest running ANALYZE if plan looks wrong.`,
  ...
}
```

**Why Client-Side**:
- EXPLAIN formats differ across databases (Postgres JSON, MSSQL XML, MySQL tabular)
- Agent already knows user's context ("we had this issue last week")
- Zero cost for DB-MCP

---

## Feature 4: Data Anomaly Detection — Deterministic Server-Side

### Problem
Bad data goes unnoticed until it causes downstream failures.

### Solution
DB-MCP provides **deterministic statistical profiling** — zero ML, zero LLM, zero cost. The agent interprets results.

### Implementation

**Tool: `profile_data_quality`**
```typescript
{
  name: "profile_data_quality",
  description: `Returns statistical profile of a table for anomaly detection.
The agent should interpret these metrics and alert the user.

Detects:
- Columns with >50% null values
- Unique columns with duplicates (broken constraints)
- Email/URL columns with invalid formats
- Numeric columns with outliers (IQR method)
- Date columns with future dates or impossible values
- Foreign key columns with orphaned references
- Columns with only one distinct value (likely unused)`,
  inputSchema: { db, table, sample_size: z.number().default(10000) }
}
```

**What DB-MCP Returns**:
```json
{
  "table": "users",
  "row_count": 50000,
  "checks": [
    {
      "column": "email",
      "check": "format_validation",
      "failed_count": 245,
      "failed_pct": 0.49,
      "severity": "high",
      "sample_failures": ["invalid@@domain", "no-at-sign"]
    },
    {
      "column": "created_at",
      "check": "date_range",
      "anomaly": "147 rows have future dates",
      "severity": "critical"
    }
  ]
}
```

**Why Deterministic**:
- Statistical rules (IQR, regex, null checks) are fast and reliable
- No training data needed
- No LLM cost
- Agent handles the "explain to user" part using its own LLM

---

## Feature 5: Semantic Schema Search — Client-Side with Local Embeddings

### Problem
Users don't know table/column names. Current search is literal (LIKE '%user%').

### Solution
The **agent performs semantic search locally** using its own embedding model. DB-MCP provides a text description of each schema element.

### Implementation

**Tool: `get_schema_search_index`**
```typescript
{
  name: "get_schema_search_index",
  description: `Returns a text description of all tables and columns
for semantic search. The agent should embed these descriptions
locally and match against user queries.

Returns flat list of searchable items:
- "Table: orders — E-commerce purchase records with customer links"
- "Column: orders.total_amount — Final price paid by customer in USD"
- "Column: users.email — Customer contact address, should be unique"

The agent can use its own embedding model (nomic-embed-text,
OpenAI embeddings, etc.) to find semantic matches.`,
  inputSchema: { db }
}
```

**Agent-Side Flow**:
1. Agent calls `get_schema_search_index` once per session (cached)
2. Agent embeds descriptions using its own embedding provider
3. User asks: "how much money did we make last month?"
4. Agent cosine-similarity matches → finds `orders.total_amount`
5. Agent generates query: `SELECT SUM(total_amount) FROM orders WHERE created_at >= DATE_TRUNC('month', NOW() - INTERVAL '1 month')`

**Why Client-Side Embeddings**:
- Embedding costs are paid by the user, not DB-MCP
- Agent can use local models (nomic-embed-text via Ollama = $0)
- No vector database needed in DB-MCP infrastructure
- Descriptions are small (<100KB for most schemas); easy to cache

---

## Feature 6: Conversational Data Explorer — Client-Side State

### Problem
Each tool call is stateless. The AI assistant must re-establish context every time.

### Solution
The **agent maintains conversation state** in its own context window. DB-MCP provides query history as a tool so the agent can look up past interactions.

### Implementation

**Tool: `get_query_history`**
```typescript
{
  name: "get_query_history",
  description: `Returns recent queries executed in this project.
The agent should use this to resolve follow-up questions.

Example:
User: "Now filter for Q4 only"
→ Agent checks history, sees last query was:
   "SELECT region, SUM(amount) FROM sales GROUP BY region"
→ Agent infers: table = sales, needs date filter
→ Agent generates new query with WHERE clause`,
  inputSchema: {
    db,
    limit: z.number().default(10),
    since: z.string().optional()
  }
}
```

**Agent-Side Follow-Up Resolution**:
```
Turn 1: "Show me sales by region"
  → Agent calls run_query → returns results
  → Agent stores query in its own context

Turn 2: "Now filter for Q4 only"
  → Agent checks its context/history → knows table = sales
  → Agent infers "Q4" = Oct-Dec based on current year
  → Agent generates: SELECT region, SUM(amount) FROM sales 
       WHERE order_date BETWEEN '2024-10-01' AND '2024-12-31' 
       GROUP BY region
  → Agent calls run_query → returns results
```

**Why Agent-Side State**:
- MCP tools are stateless by design; state belongs in the client
- Agent's context window naturally handles conversation flow
- No Redis storage needed for session state (though query history is persisted)
- Zero complexity in DB-MCP

---

## Feature 7: Intelligent Data Summarization — Client-Side

### Problem
Query results are raw JSON. AI assistants must manually summarize findings.

### Solution
DB-MCP provides **pre-computed statistics** with query results. The agent generates the summary using its own LLM.

### Implementation

**Enhanced `run_query` Response**:
```json
{
  "rows": [...],
  "columns": ["region", "total_sales"],
  "metadata": {
    "row_count": 8,
    "total_numeric_sum": 1250000,
    "column_stats": {
      "region": { "unique_count": 8, "top_value": "US" },
      "total_sales": { "min": 50000, "max": 450000, "avg": 156250 }
    }
  }
}
```

**Agent Prompts Itself**:
```
Given these query results and statistics, summarize for the user:
- Highlight the highest and lowest values
- Calculate percentages if applicable
- Note any anomalies (negative values, unexpected nulls)
- Keep it concise (2-3 sentences)
```

**Why Client-Side**:
- Summarization style depends on user preference (technical vs business)
- Agent already has conversation context for relevant comparisons
- No API cost for DB-MCP
- Simple statistics are trivial to compute; interpretation requires reasoning

---

## Technical Architecture for AI Features

### Philosophy: Zero Server-Side LLM

DB-MCP has **no LLM provider abstraction**, no API keys, no token counting, and no inference infrastructure. Every AI feature is implemented as:

1. **Rich Data Tool** — returns comprehensive, structured data
2. **Tool Description Guidance** — tells the agent how to use the data
3. **Deterministic Validation** — ensures safety (e.g., `validateSelectOnlyQuery`)

### What DB-MCP Provides

```typescript
// Schema context for NL2SQL
interface NL2SQLContext {
  tables: TableMetadata[];
  relationships: ForeignKey[];
  queryHistory: RecentQuery[];
}

// Data quality profile
interface DataQualityProfile {
  table: string;
  rowCount: number;
  checks: QualityCheck[];
}

// Enhanced query result
interface QueryResultWithStats {
  rows: unknown[];
  columns: string[];
  stats: ResultStatistics;
}
```

### What the Agent Provides
- Natural language understanding
- SQL generation from schema context
- Explanation of EXPLAIN plans
- Data summarization and anomaly interpretation
- Conversation state management

### Privacy by Design
- **No data leaves the agent**: DB-MCP never sends schema or data to external LLM APIs
- **User controls their LLM**: They choose Claude, GPT, Gemini, or local Ollama
- **Schema metadata only**: Even in tool descriptions, we never exfiltrate actual row data

### Cost to DB-MCP Operator
**$0** — No LLM API keys, no inference servers, no token budgets.

---

## Implementation Priority

| Feature | Effort | Impact | Risk | Priority |
|---------|--------|--------|------|----------|
| NL2SQL | Medium | Very High | Low (validated SQL) | P1 |
| Schema Documentation | Low | High | Very Low | P1 |
| Query Explanation | Low | Medium | Very Low | P2 |
| Anomaly Detection | Medium | High | Low | P2 |
| Semantic Search | Medium | Medium | Low | P3 |
| Conversational Explorer | High | Very High | Medium | P3 |
| Data Summarization | Low | Medium | Very Low | P2 |
