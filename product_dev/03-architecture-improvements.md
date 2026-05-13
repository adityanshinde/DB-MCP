# Architecture Improvements Roadmap

## 1. Authentication & Authorization Layer

### Current State
- No authentication. CORS is the only access control.
- Anyone with the URL can execute queries, read all data, and view metrics.

### Target Architecture
```
┌─────────────┐     ┌─────────────────┐     ┌─────────────┐
│   Client    │────▶│  API Gateway    │────▶│  MCP Server │
│  (Claude)   │     │  (Auth + RL)    │     │             │
└─────────────┘     └─────────────────┘     └─────────────┘
                           │
                           ▼
                    ┌─────────────┐
                    │  Key Store  │
                    │  (Redis)    │
                    └─────────────┘
```

### Implementation Plan
1. **API Key Authentication**
   - `MCP_API_KEY` env var for admin key
   - `MCP_API_KEYS` comma-separated list for multiple keys
   - `Authorization: Bearer <key>` header validation
   - Return 401 for missing/invalid keys

2. **Role-Based Access Control (RBAC)**
   - `admin` role: Full access, metrics, config
   - `analyst` role: Read-only queries, no stored procedures
   - `viewer` role: Schema introspection only, no data queries
   - Per-key role assignment via `MCP_API_KEY_ROLES`

3. **Connection-Level Permissions**
   - Per-API-key allowed connection aliases
   - Per-API-key allowed schemas
   - Per-API-key max row limits (override global)

---

## 2. Plugin Architecture for Database Connectors

### Current State
- Database drivers are hardcoded: `lib/db/postgres.ts`, `lib/db/mssql.ts`, etc.
- Adding a new database requires modifying core code.

### Target Architecture
```
lib/
  connectors/
    interface.ts          # Base connector interface
    registry.ts           # Connector registration & discovery
    postgres/
      index.ts
      connector.ts
      schema-tools.ts
    mssql/
      index.ts
      connector.ts
      schema-tools.ts
    mongodb/              # New
      index.ts
      connector.ts
      schema-tools.ts
    snowflake/            # New
      index.ts
      connector.ts
      schema-tools.ts
```

### Connector Interface
```typescript
interface DatabaseConnector {
  readonly type: string;
  readonly name: string;
  
  // Connection
  connect(config: ConnectionConfig): Promise<Connection>;
  disconnect(connection: Connection): Promise<void>;
  
  // Query
  executeQuery(connection: Connection, query: string, params: unknown[]): Promise<QueryResult>;
  executeReadQuery(connection: Connection, query: string, params: unknown[], maxRows: number): Promise<QueryResult>;
  
  // Introspection
  listTables(connection: Connection, schema?: string): Promise<TableInfo[]>;
  getTableSchema(connection: Connection, table: string, schema?: string): Promise<ColumnInfo[]>;
  getRelationships(connection: Connection, schema?: string): Promise<RelationshipInfo[]>;
  
  // Limits
  applyRowLimit(query: string, maxRows: number): string;
  validateQuery(query: string): ValidationResult;
}
```

### Benefits
- New databases added without touching core code
- Community can contribute connectors
- Easier testing (mock connectors)
- Consistent interface across all data sources

---

## 3. Request Pipeline Middleware

### Current State
- All request handling is in `app/api/mcp/route.ts` (2,240 lines)
- No middleware chain; logic is inline

### Target Architecture
```
Request → AuthMiddleware → RateLimitMiddleware → 
          BodySizeMiddleware → CacheMiddleware → 
          ValidationMiddleware → ToolRouter → Response
```

### Middleware Stack
1. **AuthMiddleware** — Validate API key, extract role
2. **RateLimitMiddleware** — Sliding window rate limiting per key
3. **BodySizeMiddleware** — Reject bodies > 100KB
4. **CacheMiddleware** — Check L1/L2 cache before execution
5. **ValidationMiddleware** — Validate tool inputs with Zod
6. **AuditLogMiddleware** — Log all requests for compliance

### Implementation
- Use a functional middleware pattern
- Each middleware returns `Promise<MiddlewareResult>`
- Short-circuit on errors (return early)
- Compose via `reduce` or `compose` utility

---

## 4. Multi-Tenant Workspace Model

### Vision
Support teams/organizations with isolated workspaces:
- Each workspace has its own database connections
- Team members share connection configs
- Audit logs per workspace
- Billing/metering per workspace

### Data Model
```
Workspace
  ├── id: string
  ├── name: string
  ├── owner_id: string
  ├── members: User[]
  ├── connections: Connection[]
  ├── settings: WorkspaceSettings
  └── audit_log: AuditEntry[]

Connection
  ├── id: string
  ├── workspace_id: string
  ├── type: 'postgres' | 'mssql' | 'mysql' | 'sqlite'
  ├── name: string
  ├── config: EncryptedConnectionConfig
  ├── allowed_schemas: string[]
  └── max_rows: number
```

### Storage Options
- **Phase 1**: JSON files on disk (local mode)
- **Phase 2**: PostgreSQL metadata database (hosted mode)
- **Phase 3**: Upstash Redis with persistence

---

## 5. Event-Driven Architecture for Real-Time Features

### Use Cases
- Database change notifications (CDC)
- Query result streaming for large datasets
- Real-time collaboration (shared query sessions)
- Alerting on schema changes

### Architecture
```
Database ──▶ CDC Capture ──▶ Message Queue ──▶ MCP SSE Stream ──▶ Client
                               (Redis Pub/Sub)
```

### MCP Server-Sent Events (SSE)
- Already partially supported in transport
- Full SSE for streaming query results
- Event types: `query.result`, `schema.change`, `alert.triggered`

---

## 6. Configuration Management Evolution

### Current State
- All config via environment variables
- No runtime config changes
- No config validation beyond basic checks

### Target State
- **Environment Variables**: Secrets, API keys, database URLs
- **Config API**: Runtime config updates via admin endpoints
- **Config UI**: Web-based configuration management
- **Config Versioning**: Track config changes, rollback capability

### Config Validation
- JSON Schema validation for all configs
- Startup health checks: test all DB connections
- Graceful degradation: disable failing connections, log warnings

---

## 7. Service Mesh & Deployment Patterns

### Current State
- Single Next.js app on Vercel
- Local stdio mode for Claude Desktop

### Target Deployment Options
1. **Serverless (Vercel/Netlify)** — Current, good for low traffic
2. **Container (Docker/K8s)** — For high traffic, persistent sessions
3. **Edge (Cloudflare Workers)** — Ultra-low latency, limited runtime
4. **Local Binary** — Single executable via `pkg` or `bun build --compile`

### Docker Support
```dockerfile
# Multi-stage build
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine AS runner
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
EXPOSE 3000
CMD ["node", "dist/mcp-stdio.mjs"]
```

### Kubernetes Helm Chart
- Deployment with configurable replicas
- Secret management for DB credentials
- Horizontal Pod Autoscaler based on request rate
- Ingress with rate limiting
- Persistent volume for SQLite files
