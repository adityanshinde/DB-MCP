# Shared Storage Architecture — The Universal Context Layer

**Date**: May 13, 2026
**Purpose**: Define the centralized storage system that all agents, IDEs, and MCP clients share as their single source of truth.

---

## 1. Core Philosophy

All agents — ChatGPT, Claude Desktop, Cursor, Windsurf, VS Code Copilot, and any future MCP client — read and write to **one shared storage layer**.

There is no per-client isolated memory. No per-IDE local cache that drifts out of sync. Every context change, every query result, every code suggestion, every schema update is persisted once and visible to all connected agents immediately.

**Golden Rule**: If an agent learns something, every other agent should know it without being told again.

---

## 2. Storage Backend

### 2.1 Primary Store: Redis (Upstash)

**Rationale**:
- Sub-millisecond latency for reads/writes
- Built-in Pub/Sub for real-time broadcasts
- Sorted Sets for time-ordered message logs
- Hashes for structured entity storage
- Existing infrastructure already in use for L2 cache
- Supports horizontal scaling with Redis Cluster

**Deployment Options (Zero-Cost First)**:

| Environment | Backend | Persistence | Cost |
|-------------|---------|-------------|------|
| Local dev | Redis Stack (docker) | AOF + RDB snapshots | **$0** |
| Hosted (dev) | Upstash Redis Free | Best-effort | **$0** |
| Hosted (prod) | Upstash Redis Pro | Managed persistence | $10/mo |
| Self-hosted | Docker Redis on Oracle Cloud Free Tier | AOF + RDB | **$0** |
| Enterprise | Redis Enterprise Cluster | Cross-DC replication | $300+/mo |

**Recommendation**: Use Docker Redis Stack locally and Upstash Free for hosted dev. Upgrade only when 10k commands/day or 256MB is exceeded.

---

## 3. Data Models

### 3.1 Namespace Convention

All keys are prefixed with `dbmcp:` to avoid collisions:

```
dbmcp:context:{project_id}           → Project-wide context
dbmcp:messages:{thread_id}           → Conversation threads
dbmcp:unread:{client_id}             → Per-client unread state
dbmcp:snippets:{thread_id}           → Shared code blocks
dbmcp:schema:{db_hash}               → Database schema snapshots
dbmcp:memory:{entity_id}             → Knowledge graph entities
dbmcp:relations:{entity_id}          → Entity relationships
dbmcp:queries:{project_id}           → Query history
dbmcp:sessions:{session_id}          → Active MCP sessions
dbmcp:locks:{resource_id}            → Distributed locks
dbmcp:metrics:{date}                 → Daily usage metrics
```

### 3.2 Project Context (`dbmcp:context:{project_id}`)

**Type**: Redis Hash

**Fields**:
```json
{
  "project_id": "proj_abc123",
  "name": "E-commerce Backend",
  "created_at": "2026-05-13T10:00:00Z",
  "last_activity": "2026-05-13T11:30:00Z",
  "connected_databases": ["postgres_prod", "redis_cache"],
  "active_agents": ["chatgpt_web", "cursor_ide", "claude_desktop"],
  "schema_version": "v42",
  "git_branch": "feature/auth-refactor",
  "git_commit": "a1b2c3d",
  "mcp_server_version": "2.1.0",
  "settings": {
    "max_query_rows": 1000,
    "auto_sync_schema": true,
    "pii_masking_enabled": false
  }
}
```

**TTL**: No expiration (project-level persistent)

---

### 3.3 Message Threads (`dbmcp:messages:{thread_id}`)

**Type**: Redis Sorted Set (score = timestamp)

**Member Format**:
```json
{
  "id": "msg_001",
  "timestamp": 1715598600000,
  "source": "chatgpt",
  "target": "all",
  "type": "code",
  "thread_id": "thread_slow_query",
  "project_id": "proj_abc123",
  "author": "ChatGPT-4o",
  "payload": {
    "content": "CREATE INDEX idx_orders_date ON orders(created_at);",
    "language": "sql",
    "description": "Suggested index for slow query on orders table"
  },
  "priority": "high",
  "vector_clock": {"chatgpt": 5, "cursor": 3, "claude": 2},
  "acknowledged_by": ["cursor"],
  "expires_at": null
}
```

**Operations**:
- `ZADD dbmcp:messages:thread_123 1715598600000 '{...}'`
- `ZRANGEBYSCORE dbmcp:messages:thread_123 1715598000000 +inf`
- `ZREMRANGEBYSCORE dbmcp:messages:thread_123 -inf (1713004800000` — Auto-cleanup old messages

**Retention**: 90 days for messages in Redis, then archived to compressed files on local disk or removed (configurable). No cloud storage costs needed.

---

### 3.4 Unread State (`dbmcp:unread:{client_id}`)

**Type**: Redis Hash

**Purpose**: Track which messages each agent has not yet read.

```json
{
  "thread_slow_query": 3,
  "thread_schema_update": 1,
  "thread_general_chat": 0
}
```

**On Read**: `HINCRBY dbmcp:unread:cursor -1 thread_slow_query`

---

### 3.5 Code Snippets (`dbmcp:snippets:{thread_id}`)

**Type**: Redis List (LRU capped at 100 per thread)

```json
{
  "id": "snippet_001",
  "timestamp": 1715598600000,
  "author": "ChatGPT-4o",
  "language": "typescript",
  "content": "function optimizeQuery(db: DBType, query: string) {...}",
  "file_path": "lib/db/optimizer.ts",
  "diff": "@@ -15,7 +15,8 @@...",
  "applied_by": ["cursor"],
  "rejected_by": []
}
```

---

### 3.6 Schema Snapshots (`dbmcp:schema:{db_hash}`)

**Type**: Redis Hash (one key per database connection hash)

```json
{
  "db_hash": "sha256:abc...",
  "db_type": "postgres",
  "connection_alias": "prod_analytics",
  "snapshot_at": "2026-05-13T11:00:00Z",
  "tables_count": 47,
  "tables": ["users", "orders", "products", "..."],
  "schema_json_compressed": "base64(gzip({...}))",
  "checksum": "md5:def...",
  "last_queried_at": "2026-05-13T11:30:00Z"
}
```

**Schema Change Detection**:
```
1. On every schema introspection call, compute checksum
2. Compare with dbmcp:schema:{db_hash}.checksum
3. If different:
   a. Store new snapshot
   b. PUBLISH dbmcp:events:schema_changed '{db_hash, project_id}'
   c. Auto-broadcast to all connected agents
```

---

### 3.7 Knowledge Graph (`dbmcp:memory:{entity_id}`)

**Type**: Redis Hash + Sets for relationships

**Entity**:
```json
{
  "id": "entity_orders_table",
  "type": "table",
  "name": "orders",
  "project_id": "proj_abc123",
  "db_hash": "sha256:abc...",
  "observations": [
    "50 million rows as of May 2026",
    "Missing index on created_at caused 3 slow queries",
    "Contains PII in customer_email column",
    "Partitioned by month starting 2025-01"
  ],
  "created_at": "2026-05-01T00:00:00Z",
  "updated_at": "2026-05-13T11:00:00Z",
  "embedding": "base64(768d_float32_vector)"
}
```

**Relations**:
```
SADD dbmcp:relations:entity_orders_table entity_users_table entity_products_table
SADD dbmcp:relations:entity_users_table entity_orders_table
```

**Semantic Search**:
- Store embeddings as Redis Vector (if using Redis Stack)
- Or use Upstash Vector for similarity search
- Query: "Find tables related to customer orders"

---

### 3.8 Query History (`dbmcp:queries:{project_id}`)

**Type**: Redis Sorted Set (score = timestamp)

```json
{
  "id": "query_001",
  "timestamp": 1715598600000,
  "author": "claude_desktop",
  "db_type": "postgres",
  "db_alias": "prod_analytics",
  "query": "SELECT * FROM orders WHERE created_at > '2026-01-01'",
  "normalized_query": "SELECT * FROM orders WHERE created_at > ?",
  "execution_time_ms": 2450,
  "rows_returned": 15000,
  "was_slow": true,
  "suggested_index": "idx_orders_created_at",
  "result_hash": "sha256:...",
  "result_sample": "[truncated_first_10_rows]",
  "starred_by": ["cursor"]
}
```

---

### 3.9 Active Sessions (`dbmcp:sessions:{session_id}`)

**Type**: Redis Hash with TTL

```json
{
  "session_id": "sess_001",
  "client_type": "cursor",
  "client_version": "0.45.0",
  "user_id": "user_123",
  "project_id": "proj_abc123",
  "connected_at": "2026-05-13T10:00:00Z",
  "last_ping": "2026-05-13T11:30:00Z",
  "capabilities": ["database", "github", "filesystem", "bridge"],
  "ip_address": "192.168.1.100",
  "user_agent": "Cursor/0.45.0"
}
```

**TTL**: 5 minutes (refreshed on every request)

---

## 4. Real-Time Synchronization

### 4.1 Redis Pub/Sub Channels

```
dbmcp:broadcast:{project_id}     → All agents for a project
dbmcp:agent:{client_id}          → Direct message to specific agent
dbmcp:events:schema_changed      → Schema change notifications
dbmcp:events:query_executed      → New query notification
dbmcp:events:code_shared         → New code snippet notification
dbmcp:events:agent_joined        → New agent connected
dbmcp:events:agent_left          → Agent disconnected
```

### 4.2 Event Payload

```json
{
  "event_type": "code_shared",
  "timestamp": "2026-05-13T11:30:00Z",
  "project_id": "proj_abc123",
  "source_agent": "chatgpt",
  "payload": {
    "thread_id": "thread_123",
    "snippet_id": "snippet_001",
    "preview": "CREATE INDEX idx_orders_date..."
  },
  "requires_ack": true
}
```

### 4.3 Delivery Guarantees

| Channel | Pattern | Durability |
|---------|---------|------------|
| `broadcast` | Pub/Sub | Fire-and-forget (clients must be online) |
| `agent` | Pub/Sub | Fire-and-forget |
| `messages` | Sorted Set | Persistent (stored until TTL) |
| `unread` | Hash | Persistent |

**Offline Handling**:
- Messages are always written to `dbmcp:messages:{thread_id}` first
- Pub/Sub is a notification layer only
- On reconnect, client calls `bridge_get_unread_messages` to catch up

---

## 5. Multi-Tenancy & Isolation

### 5.1 Project Isolation

Every project gets its own key namespace. There is **no cross-project data leakage**.

```
dbmcp:context:proj_abc123  ← only agents with access to proj_abc123
dbmcp:context:proj_xyz789  ← completely isolated
```

### 5.2 Access Control

**Per-Project Permissions** (stored in `dbmcp:acl:{project_id}`):

```json
{
  "user_123": {
    "role": "admin",
    "agents": ["chatgpt", "cursor", "claude_desktop"],
    "permissions": ["read", "write", "share", "delete"]
  },
  "user_456": {
    "role": "viewer",
    "agents": ["chatgpt"],
    "permissions": ["read"]
  }
}
```

**Enforcement**:
- Every storage operation checks `dbmcp:acl:{project_id}`
- Agent tokens are scoped to project + agent type
- Read-only agents (e.g., monitoring) cannot write

---

## 6. Consistency & Conflict Resolution

### 6.1 Vector Clocks

Every message carries a vector clock for causal ordering:

```json
{
  "vector_clock": {
    "chatgpt": 5,
    "cursor": 3,
    "claude_desktop": 2,
    "windsurf": 1
  }
}
```

**Rules**:
- Agent increments its own counter on every write
- Receiving agent merges clocks: `max(local, received)`
- Concurrent writes (neither dominates) trigger conflict resolution

### 6.2 Conflict Resolution Strategies

| Data Type | Strategy |
|-----------|----------|
| Messages | Append-only log (no conflicts) |
| Context fields | Last-write-wins by timestamp |
| Code snippets | Keep both + mark as "alternative solutions" |
| Schema snapshots | Replace (newer always wins) |
| Memory entities | Merge observations + append new ones |

### 6.3 Distributed Locks

For operations that must be atomic:

```
SET dbmcp:locks:schema_update:{db_hash} {client_id} NX EX 30
→ If lock acquired, proceed with schema update
→ If lock exists, wait or fail with retry_after
```

---

## 7. Persistence & Durability

### 7.1 Tiered Storage

```
Hot (Redis)          → Active sessions, unread counts, recent messages
Warm (Redis + AOF)   → Query history (90 days), schema snapshots (30 days)
Cold (S3/R2)         → Archived messages, full query results, audit logs
Frozen (Glacier)     → Year-old data for compliance
```

### 7.2 Backup Strategy

- **Redis AOF**: Append-only file for point-in-time recovery
- **Hourly snapshots**: `BGSAVE` to disk
- **Daily export**: Archive to S3/R2 as JSONL
- **Cross-region**: Replicate Upstash to secondary region

### 7.3 Data Retention

| Data Type | Hot TTL | Archive After |
|-----------|---------|---------------|
| Messages | 90 days | 90 days |
| Code snippets | 90 days | 90 days |
| Query history | 365 days | 1 year |
| Schema snapshots | 30 days | 30 days |
| Session data | 5 min | Never (transient) |
| Audit logs | 365 days | 1 year |
| Knowledge graph | Permanent | Never |

---

## 8. Performance

### 8.1 Expected Load

| Metric | Estimate |
|--------|----------|
| Messages/second | 10-100 (peak) |
| Schema reads/second | 50-200 |
| Query history writes/minute | 10-50 |
| Concurrent agents | 5-20 per project |
| Active projects | 1,000-10,000 |

### 8.2 Optimization Strategies

1. **Pipelining**: Batch multiple Redis commands
2. **Compression**: Gzip large payloads (schema JSON, query results)
3. **Selective Sync**: Only sync changed fields, not entire context
4. **Lazy Loading**: Load full message history on demand
5. **CDN for Static**: Schema snapshots cached at edge

### 8.3 Monitoring

**Metrics to track**:
- `dbmcp_storage_latency_ms` — p50, p95, p99
- `dbmcp_messages_per_second` — by project
- `dbmcp_sync_conflict_count` — conflict resolution rate
- `dbmcp_storage_bytes` — per project, per data type
- `dbmcp_agent_online_count` — real-time connected agents

---

## 9. Security

### 9.1 Encryption

| Layer | Method |
|-------|--------|
| Transport | TLS 1.3 for all Redis connections |
| At Rest | Upstash AES-256 encryption |
| Application | Sensitive fields (DB URLs, tokens) encrypted with project key |

### 9.2 Field-Level Encryption

For sensitive context:

```
dbmcp:secrets:{project_id}
{
  "database_url": "enc(AES_GCM:...)",
  "github_pat": "enc(AES_GCM:...)",
  "openai_api_key": "enc(AES_GCM:...)"
}
```

Decryption key stored in project's HSM or env var, never in Redis.

### 9.3 Audit Trail

Every write operation logged:

```
dbmcp:audit:{date}
{
  "timestamp": "2026-05-13T11:30:00Z",
  "client_id": "cursor",
  "user_id": "user_123",
  "action": "schema_snapshot_updated",
  "project_id": "proj_abc123",
  "db_hash": "sha256:abc...",
  "ip_address": "192.168.1.100"
}
```

---

## 10. API Surface

### 10.1 MCP Tools for Storage

```typescript
// Bridge tools (all agents use these)
bridge_publish_message(thread_id, content, type, priority)
bridge_get_unread_messages(thread_id?, limit?)
bridge_get_conversation_history(thread_id, since?, limit?)
bridge_share_code_snippet(thread_id, code, language, file_path?)
bridge_share_schema_snapshot(db_alias, schema_json)
bridge_share_error_log(error, stack_trace, context?)
bridge_acknowledge_message(message_id)
bridge_create_thread(title, participants?)
bridge_subscribe_to_thread(thread_id)  // SSE

// Memory tools
memory_create_entity(name, type, observations[])
memory_add_observation(entity_id, observation)
memory_create_relation(from_entity, to_entity, relation_type)
memory_search_semantic(query, limit?)
memory_search_keyword(query, limit?)
memory_get_entity(entity_id)
memory_get_related(entity_id, relation_type?)

// Query history tools
queries_get_recent(limit?, db_alias?)
queries_get_by_id(query_id)
queries_search_by_pattern(pattern, db_alias?)
queries_star(query_id)
queries_get_starred()

// Schema tools
schema_get_current(db_alias)
schema_get_history(db_alias, limit?)
schema_compare(db_alias, version_a, version_b)
schema_subscribe_changes(db_alias)  // Real-time
```

### 10.2 REST API for Non-MCP Clients

```
GET    /api/v1/projects/{project_id}/context
POST   /api/v1/projects/{project_id}/messages
GET    /api/v1/projects/{project_id}/messages?thread={id}
POST   /api/v1/projects/{project_id}/snippets
GET    /api/v1/projects/{project_id}/schema/{db_alias}
GET    /api/v1/projects/{project_id}/queries
GET    /api/v1/projects/{project_id}/memory/search?q={query}
GET    /api/v1/projects/{project_id}/agents/online
GET    /api/v1/stream?project_id={id}  // SSE for real-time events
```

---

## 11. Integration Patterns

### 11.1 Pattern: ChatGPT Web → Shared Storage → Cursor IDE

```
1. ChatGPT (via Custom GPT Action) POST /api/v1/projects/abc/messages
2. Server writes to dbmcp:messages:thread_123
3. Server PUBLISH to dbmcp:broadcast:proj_abc
4. Cursor IDE (subscribed to SSE) receives event
5. Cursor calls bridge_get_unread_messages() via MCP
6. Cursor displays: "ChatGPT suggested: CREATE INDEX..."
7. Cursor applies edit, calls bridge_share_code_snippet()
8. ChatGPT sees update via polling or webhook
```

### 11.2 Pattern: Schema Auto-Sync

```
1. Claude Desktop calls list_tables("postgres_prod")
2. DB-MCP detects schema checksum changed
3. DB-MCP writes new snapshot to dbmcp:schema:{hash}
4. DB-MCP PUBLISH dbmcp:events:schema_changed
5. All connected agents receive notification
6. Agents refresh their local schema cache
7. No agent works with stale schema
```

### 11.3 Pattern: Knowledge Graph Population

```
1. User asks: "Why is the orders table so slow?"
2. Agent queries DB, finds: 50M rows, no index on created_at
3. Agent calls memory_create_entity("orders", "table", observations)
4. Agent calls memory_add_observation("Missing index caused 3 slow queries")
5. Next time ANY agent asks about orders, it retrieves:
   - Row count
   - Missing indexes
   - Previous optimization attempts
   - Related tables (users, products)
```

---

## 12. Failure Modes

### 12.1 Redis Unavailable

**Fallback**: SQLite local cache per agent
- Agents continue working with stale context
- Queue writes for retry
- On reconnect, replay queued operations

### 12.2 Agent Offline

**Behavior**:
- Messages accumulate in `dbmcp:messages:{thread_id}`
- Unread counts increment
- On reconnect, agent calls `bridge_get_unread_messages()`
- No messages lost

### 12.3 Concurrent Schema Changes

**Resolution**:
- Distributed lock on schema update
- If lock fails, agent waits or uses cached schema
- Schema change events are idempotent
- Multiple notifications for same change are deduplicated by checksum

---

## 13. Future Evolution

### 13.1 Phase 2: CRDTs for Offline-First

Replace vector clocks with CRDTs (Conflict-free Replicated Data Types) for true offline-first support:
- Agents can work offline and sync later
- Automatic conflict resolution for all data types
- No locks, no coordination needed

### 13.2 Phase 3: Distributed Knowledge Graph

Move from Redis Hash + Sets to a proper graph database:
- Neo4j or Dgraph for complex relationship queries
- "Find all tables that reference users via foreign key"
- "What queries touch both orders and products?"
- GraphQL API for knowledge exploration

### 13.3 Phase 4: Global Semantic Search

Cross-project semantic search:
- "Has anyone on my team solved this slow query problem before?"
- Aggregate learnings across all projects in an organization
- Federated learning for query optimization patterns

---

*This document defines the shared storage layer as the central nervous system of the DB-MCP multi-agent ecosystem. All agents, all IDEs, all contexts — one source of truth.*
