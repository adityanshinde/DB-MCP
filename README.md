# MCP Database Server

This project is the backend MCP server for safe, read-only access to PostgreSQL and MSSQL.
It is built with Next.js App Router, TypeScript, and Node runtime only.

## What this project does

The server exposes a single MCP-style HTTP endpoint at `/api/mcp`.
AI agents or frontends can use it to:

- list tables
- inspect table schemas
- inspect foreign-key relationships
- run safe read-only SQL queries

The backend never connects to databases in write mode and rejects unsafe SQL before execution.

## Tech stack

- Next.js App Router
- TypeScript
- Node.js runtime
- PostgreSQL driver: `pg`
- MSSQL driver: `mssql`
- No ORM

## Project structure

- `app/api/mcp/route.ts` - MCP HTTP handler
- `lib/config.ts` - central configuration and env access
- `lib/db/postgres.ts` - PostgreSQL connection pool and query helper
- `lib/db/mssql.ts` - MSSQL connection pool and query helper
- `lib/tools/runQuery.ts` - safe query execution tool
- `lib/tools/listTables.ts` - list tables tool
- `lib/tools/getSchema.ts` - table schema tool
- `lib/tools/getRelationships.ts` - FK relationship discovery tool
- `lib/validators/queryValidator.ts` - read-only SQL validation
- `lib/types.ts` - shared types for requests and responses

## Setup

1. Install dependencies:
   - `npm install`
2. Copy `.env.example` to `.env`
3. Paste your credentials into `.env`
4. Run locally:
   - `npm run dev`

## Environment variables

All runtime settings are controlled from one place only: `.env` and `lib/config.ts`.

```env
POSTGRES_URL=postgresql://user:password@host:5432/database
MSSQL_USER=readonly_user
MSSQL_PASSWORD=your_password
MSSQL_SERVER=your_server
MSSQL_DATABASE=your_database
```

## Centralized config behavior

The file `lib/config.ts` contains all application settings used by the server.
It defines:

- PostgreSQL connection string
- MSSQL connection settings
- max row limit for query execution
- allowed schemas

Changing `.env` is enough to reconfigure the backend.

## Supported tools

### 1. `run_query`

Input:

```json
{
  "db": "postgres",
  "query": "SELECT * FROM users"
}
```

Behavior:

- validates the SQL
- blocks unsafe statements
- injects `LIMIT 50` for PostgreSQL when needed
- injects `TOP (50)` for MSSQL when needed
- executes the query through the correct pool
- returns rows and metadata

### 2. `list_tables`

Lists tables from the chosen database:

- PostgreSQL: `pg_catalog.pg_tables`
- MSSQL: `INFORMATION_SCHEMA.TABLES`

### 3. `get_table_schema`

Returns column metadata for a selected table.

### 4. `get_relationships`

Returns foreign-key relationships using system catalogs.

## API contract

Send a POST request to `/api/mcp` with this shape:

```json
{
  "tool": "run_query",
  "input": {}
}
```

Example tool requests:

### list_tables

```json
{
  "tool": "list_tables",
  "input": {
    "db": "postgres"
  }
}
```

### run_query

```json
{
  "tool": "run_query",
  "input": {
    "db": "postgres",
    "query": "SELECT * FROM users"
  }
}
```

### get_table_schema

```json
{
  "tool": "get_table_schema",
  "input": {
    "db": "mssql",
    "table": "Users",
    "schema": "dbo"
  }
}
```

### get_relationships

```json
{
  "tool": "get_relationships",
  "input": {
    "db": "postgres",
    "schema": "public"
  }
}
```

## Response format

Every tool returns the same envelope:

```json
{
  "success": true,
  "data": {},
  "error": null
}
```

On failure:

```json
{
  "success": false,
  "data": null,
  "error": "Reason message"
}
```

## Security rules

- read-only queries only
- allow only `SELECT`, `WITH`, and `EXPLAIN`
- reject `INSERT`, `UPDATE`, `DELETE`, `DROP`, `ALTER`, `TRUNCATE`, `MERGE`, and similar write operations
- reject multiple statements
- reject SQL comments
- reject dangerous keywords such as `exec`, `grant`, and `xp_`
- use read-only database users only
- limit access to allowed schemas only

## Performance notes

- PostgreSQL uses a persistent `pg.Pool`
- MSSQL uses a cached `ConnectionPool`
- connections are reused across requests
- imports are kept lightweight

## Deployment

This backend is ready for Vercel deployment.

### Node runtime

The API route is forced to use the Node.js runtime.

### Vercel note

If needed, the deployment uses `vercel.json` to pin the function runtime.

## Test requests

### Load tables

Use the `list_tables` payload for either database.

### Safe query

```json
{
  "tool": "run_query",
  "input": {
    "db": "postgres",
    "query": "SELECT * FROM users LIMIT 5"
  }
}
```

### Schema lookup

```json
{
  "tool": "get_table_schema",
  "input": {
    "db": "postgres",
    "table": "users",
    "schema": "public"
  }
}
```

## Troubleshooting

- If the server says a DB is not configured, check `.env`
- If queries are rejected, verify that they start with `SELECT`, `WITH`, or `EXPLAIN`
- If schemas are rejected, confirm the schema is in the allowed list
- If Vercel deployment fails, ensure the function is running on Node.js, not Edge

## Commands

- `npm install`
- `npm run dev`
- `npm run build`
- `npm run start`

