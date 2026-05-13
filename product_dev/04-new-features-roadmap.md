# New Features Roadmap

## P0 — Critical (Ship in 30 Days)

### 1. API Key Authentication
- Bearer token validation on all API routes
- Environment-based key configuration
- Per-key role assignment (admin, analyst, viewer)
- Return 401 for unauthenticated requests

### 2. Stored Procedure Allowlist
- `MCP_ALLOWED_PROCEDURES` environment variable
- `schema.procedure` format validation
- Reject execution of non-allowlisted procedures
- Update tool description to reflect actual behavior

### 3. Rate Limiting
- Upstash Redis sliding window implementation
- Per-API-key limits configurable via env
- Default: 100 requests/minute, 1000/hour
- Return 429 with Retry-After header

### 4. Request Body Size Limits
- Reject bodies > 100KB
- Configurable via `MCP_MAX_BODY_SIZE_BYTES`
- Return 413 Payload Too Large

---

## P1 — High Value (Ship in 60 Days)

### 5. Natural Language to SQL (NL2SQL) — Client-Side
- **No server-side LLM**. DB-MCP provides rich schema context via `get_nl2sql_context`
- Agent uses its own LLM (Claude/GPT/local) to generate SQL from context
- Validation layer: agent sends generated SQL to `run_query`, which validates with `validateSelectOnlyQuery`
- Zero cost to DB-MCP; user pays for their own LLM if any
- Fallback: if validation fails, DB-MCP returns clear error; agent retries

**Tool**: `get_nl2sql_context` — Input: db + question, Output: schema context for agent
**Tool**: `run_query` — Agent executes generated SQL (already exists)

### 6. Query History & Favorites
- Redis-backed query log (last 100 queries per API key)
- Favorite queries with custom names
- Query replay capability
- Search query history

**Tools**: `list_query_history`, `save_favorite_query`, `run_favorite_query`

### 7. Data Export
- CSV export for query results
- JSON export (nested and flat)
- Markdown table export
- Max export size: 10,000 rows

**Tool**: `export_query_results` — Input: query, format, max_rows

### 8. ER Diagram Generation
- Generate Mermaid/PlantUML ER diagrams from schema metadata
- Include table relationships (FK lines)
- Optional: column type display
- SVG/PNG rendering via Kroki or Mermaid CLI

**Tool**: `generate_er_diagram` — Input: schema, Output: diagram markdown/URL

### 9. Schema Change Alerts
- Periodic schema snapshot comparison (daily/hourly)
- Detect new tables, dropped columns, type changes
- Alert via MCP resource or webhook
- Configurable via `MCP_SCHEMA_MONITOR_INTERVAL_MS`

**Tool**: `get_schema_changes` — Input: since_timestamp, Output: diff report

---

## P2 — Differentiating (Ship in 90 Days)

### 10. Data Quality Profiler
- Automatic profiling of table columns
- Detect: missing values, outliers, duplicates, format inconsistencies
- Generate data quality score per table
- Suggest fixes (e.g., "Column 'email' has 15% invalid formats")

**Tool**: `profile_data_quality` — Input: table, Output: quality report

### 11. Query Optimization Advisor
- Analyze slow query logs (if available)
- Suggest missing indexes based on query patterns
- Detect full table scans
- Recommend query rewrites

**Tool**: `advise_query_optimization` — Input: query, Output: recommendations

### 12. Cross-Database Queries
- Query data from multiple databases in a single tool call
- Aggregate results from Postgres + MySQL + SQLite
- Unified result format with source annotation

**Tool**: `run_cross_database_query` — Input: array of {db, query}, Output: merged results

### 13. Data Masking / PII Detection
- Regex-based PII detection (emails, SSNs, credit cards, phone numbers)
- Automatic masking in query results
- Configurable per-column or per-pattern
- Preserves data types while hiding sensitive values

**Tool**: `apply_data_masking` — Input: query result, mask_rules, Output: masked result

### 14. Query Result Visualization
- Auto-detect chartable data (time series, categories, distributions)
- Generate Vega-Lite chart specs
- Return chart as base64 PNG or Vega JSON
- Support: bar, line, pie, scatter, heatmap

**Tool**: `visualize_query_results` — Input: query result, chart_type, Output: chart_spec

---

## P3 — Platform Expansion (Ship in 120 Days)

### 15. MongoDB Connector
- List collections
- Find documents with filters
- Aggregation pipeline execution
- Schema inference from sample documents
- BSON to JSON conversion

### 16. Redis Connector
- List keys with patterns
- Get string/hash/set/zset values
- Execute read-only Redis commands
- Keyspace analysis (most frequent prefixes, TTL distribution)

### 17. Elasticsearch Connector
- Index listing and mapping introspection
- Query DSL execution
- Aggregation results
- Index health and shard stats

### 18. Snowflake/BigQuery Connector
- Warehouse/database introspection
- Query execution with result caching
- Cost estimation per query
- Materialized view detection

### 19. REST API Data Source
- Configure endpoints as "virtual tables"
- OAuth2/API key authentication for external APIs
- JSONPath extraction for nested responses
- Pagination handling

### 20. GraphQL Introspection
- Query schema from any GraphQL endpoint
- Generate queries from field selections
- Execute queries with variable substitution

---

## P4 — Moonshots (Research Phase)

### 21. AI Schema Documentation Generator — Client-Side
- Agent generates docs using its own LLM + `get_schema_for_documentation` tool
- DB-MCP returns: table metadata, column stats, sample values, relationships
- Agent infers business meaning and writes documentation
- Zero server-side LLM cost

### 22. Anomaly Detection on Query Patterns — Deterministic
- Statistical profiling in DB-MCP: query volume baselines, schema enumeration detection
- Rule-based alerts (no ML training needed)
- Agent interprets alerts and decides action
- Zero LLM cost

### 23. Conversational Data Explorer — Client-Side State
- Agent maintains conversation context in its own context window
- DB-MCP provides `get_query_history` for the agent to resolve follow-ups
- "Show me sales by region" → "Now filter for Q4 only" — agent infers from history
- Zero server-side session state

### 24. Collaborative Query Sessions
- Multiple agents/clients sharing query sessions via Redis (shared storage)
- Real-time result sharing via SSE
- Comment threads persisted in Redis
- Session replay from query history

### 25. Data Lineage Tracking
- DB-MCP introspects: source tables → views → materialized views
- Returns dependency graph as structured data
- Agent performs impact analysis: "If I change this column, what breaks?"
- Visual lineage generated by agent or frontend
