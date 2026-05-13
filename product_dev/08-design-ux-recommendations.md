# Design & UX Recommendations

## Design Philosophy

DB-MCP serves two distinct user personas:
1. **AI Assistants** (Claude, GPT, Cursor) — Consume MCP tools programmatically
2. **Human Developers** — Configure, monitor, and debug the server

The design must serve both: excellent machine-readable APIs AND excellent human-facing interfaces.

---

## Web UI: MCP Dashboard

### Current State
- No UI exists beyond the root layout (`app/layout.tsx`)
- Metrics exposed as raw JSON at `/api/mcp/metrics`
- No configuration interface

### Proposed Dashboard (`app/dashboard`)

#### Page 1: Connection Health
```
┌─────────────────────────────────────────────────────────────┐
│  DB-MCP Dashboard                              [Settings]   │
├─────────────────────────────────────────────────────────────┤
│  Connections                                                │
│  ┌──────────┐  ┌──────────┐  ┌──────────┐  ┌──────────┐   │
│  │ Postgres │  │  MSSQL   │  │  MySQL   │  │  SQLite  │   │
│  │    ✅    │  │    ✅    │  │    ⚠️    │  │    ✅    │   │
│  │ 12ms avg │  │ 45ms avg │  │ timeout  │  │  3ms avg │   │
│  └──────────┘  └──────────┘  └──────────┘  └──────────┘   │
│                                                             │
│  [Test All] [Add Connection] [Export Config]                │
└─────────────────────────────────────────────────────────────┘
```

#### Page 2: Query Playground
```
┌─────────────────────────────────────────────────────────────┐
│  Query Playground                                           │
│  Database: [Postgres ▼]  Connection: [primary ▼]          │
│                                                             │
│  ┌─────────────────────────────────────────────────────┐    │
│  │ SELECT * FROM users WHERE created_at > '2024-01-01' │    │
│  └─────────────────────────────────────────────────────┘    │
│  [Run] [Explain] [Save Favorite] [Share]                   │
│                                                             │
│  Results (50 rows, 12ms)                                    │
│  ┌────┬──────────┬─────────────────────┬──────────┐       │
│  │ id │ username │ email               │ created  │       │
│  ├────┼──────────┼─────────────────────┼──────────┤       │
│  │ 1  │ alice    │ alice@example.com   │ Jan 15   │       │
│  │ 2  │ bob      │ bob@example.com     │ Feb 03   │       │
│  └────┴──────────┴─────────────────────┴──────────┘       │
└─────────────────────────────────────────────────────────────┘
```

#### Page 3: Metrics & Observability
```
┌─────────────────────────────────────────────────────────────┐
│  Metrics (Last 24 Hours)                                    │
│                                                             │
│  Requests: 1,234  │  Errors: 12 (0.9%)  │  Avg Latency: 45ms│
│                                                             │
│  [Request Volume Chart]  [Cache Hit Rate Chart]            │
│                                                             │
│  Top Queries:                                               │
│  1. list_tables (342 calls)                                │
│  2. get_table_schema (198 calls)                           │
│  3. run_query (156 calls)                                  │
│                                                             │
│  GitHub API Usage:                                          │
│  my-org/repo-a: 45 calls  │  my-org/repo-b: 23 calls      │
└─────────────────────────────────────────────────────────────┘
```

#### Page 4: Schema Explorer
```
┌─────────────────────────────────────────────────────────────┐
│  Schema: public                                             │
│  ┌──────────────┐                                           │
│  │ users        │  [Details] [Sample Rows] [Relationships] │
│  │ orders       │                                           │
│  │ order_items  │  users Table                              │
│  │ products     │  ┌──────────┬──────────┬──────────┐     │
│  │ ...          │  │ Column   │ Type     │ Nullable │     │
│  └──────────────┘  ├──────────┼──────────┼──────────┤     │
│                     │ id       │ uuid     │ NO       │     │
│  [Generate ER      │ username │ varchar  │ NO       │     │
│   Diagram]          │ email    │ varchar  │ NO       │     │
│                     └──────────┴──────────┴──────────┘     │
└─────────────────────────────────────────────────────────────┘
```

### Tech Stack Recommendation
- **Framework**: Keep Next.js App Router (already using it)
- **Styling**: Tailwind CSS (not currently used, add it)
- **Components**: shadcn/ui for tables, forms, dialogs, charts
- **Charts**: Recharts or Tremor for metrics visualization
- **Monaco Editor**: For SQL query editing with syntax highlighting

---

## Branding & Visual Identity

### Logo Concept
- Database cylinder + MCP protocol node connection
- Color palette:
  - Primary: `#3B82F6` (blue — trust, data)
  - Secondary: `#10B981` (green — success, safe queries)
  - Accent: `#F59E0B` (amber — warnings, GitHub)
  - Danger: `#EF4444` (red — errors, destructive ops)
  - Dark mode base: `#0F172A` (slate-900)

### Typography
- Headings: Inter or Geist (Next.js font)
- Code: JetBrains Mono or Fira Code
- Body: Inter

### Dark Mode First
- All UI components should support dark mode
- Default to dark (developers prefer it)
- Use CSS variables for theming

---

## CLI Tool: `db-mcp`

### Problem
Currently, developers must configure everything via environment variables. There's no CLI for management.

### Solution
A global npm package `db-mcp` that provides:

```bash
# Initialize configuration
$ db-mcp init
> Created db-mcp.config.json

# Add a database connection
$ db-mcp connection add postgres primary \
    --url postgresql://user:pass@host/db \
    --schemas public,analytics \
    --max-rows 100

# Test connections
$ db-mcp connection test
> postgres (primary): ✅ Connected (12ms)
> mssql (reporting):  ✅ Connected (45ms)

# Start local stdio server
$ db-mcp serve --stdio
> MCP server running on stdio

# Start HTTP server
$ db-mcp serve --http --port 3000
> MCP server running on http://localhost:3000

# View logs
$ db-mcp logs --follow

# Run a query
$ db-mcp query postgres "SELECT COUNT(*) FROM users"
> 1247

# Export schema documentation
$ db-mcp docs generate --format markdown --output ./docs
```

---

## Developer Experience (DX) Improvements

### 1. MCP Inspector Integration
- Support MCP Inspector for debugging tool calls
- Provide mock data generators for local testing

### 2. TypeScript Client SDK
```typescript
import { DBMCPClient } from '@db-mcp/client';

const client = new DBMCPClient({
  baseUrl: 'http://localhost:3000',
  apiKey: 'sk-xxx'
});

const tables = await client.listTables('postgres');
const results = await client.runQuery('postgres', 'SELECT * FROM users');
```

### 3. VS Code Extension
- Sidebar panel showing configured databases
- Tree view of schemas, tables, columns
- Inline query execution with result panels
- IntelliSense for table/column names in SQL files

### 4. Postman / OpenAPI Collection
- Auto-generated OpenAPI spec from tool definitions
- Importable into Postman, Insomnia, Hoppscotch
- Pre-configured example requests

---

## Responsive Design Principles

| Breakpoint | Target Device | Layout Adjustments |
|------------|---------------|-------------------|
| < 640px | Mobile | Single column, hamburger menu, compact tables |
| 640-1024px | Tablet | Two-column sidebar + main, scrollable tables |
| > 1024px | Desktop | Full three-pane layout (nav, explorer, details) |
| > 1440px | Wide | Side-by-side query editor and results |

---

## Accessibility (a11y)

- WCAG 2.1 AA compliance target
- Keyboard navigation for all interactive elements
- ARIA labels on charts and data tables
- Focus management in modal dialogs
- Color contrast ratio > 4.5:1 for all text
- Screen reader friendly table markup

---

## Documentation Strategy

### Structure
```
docs/
  getting-started/
    installation.md
    configuration.md
    first-query.md
  guides/
    authentication.md
    adding-databases.md
    github-integration.md
    caching.md
    rate-limiting.md
  reference/
    api.md
    tools.md
    environment-variables.md
  advanced/
    custom-connectors.md
    self-hosting.md
    monitoring.md
```

### Formats
- Markdown source in repo
- Generated static site (VitePress, Docusaurus, or Mintlify)
- Hosted at `docs.db-mcp.dev`
- Searchable, versioned, dark mode
