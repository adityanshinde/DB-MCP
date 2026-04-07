import { NextResponse } from 'next/server';

import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { getConstraints } from '@/lib/tools/getConstraints';
import { compareSchema } from '@/lib/tools/compareSchema';
import { getForeignKeySummary } from '@/lib/tools/getForeignKeySummary';
import { getDatabaseInfo } from '@/lib/tools/getDatabaseInfo';
import { getColumnStats } from '@/lib/tools/getColumnStats';
import { compareObjectVersions } from '@/lib/tools/compareObjectVersions';
import { getDependencyGraph } from '@/lib/tools/getDependencyGraph';
import { getFunctionSummary } from '@/lib/tools/getFunctionSummary';
import { getIndexes } from '@/lib/tools/getIndexes';
import { getRelationPath } from '@/lib/tools/getRelationPath';
import { getProcedureSummary } from '@/lib/tools/getProcedureSummary';
import { getRelationships } from '@/lib/tools/getRelationships';
import { getSampleRows } from '@/lib/tools/getSampleRows';
import { explainQuery } from '@/lib/tools/explainQuery';
import { getTableSchema } from '@/lib/tools/getSchema';
import { getTableSampleByColumns } from '@/lib/tools/getTableSampleByColumns';
import { getTableSummary } from '@/lib/tools/getTableSummary';
import { getViewSummary } from '@/lib/tools/getViewSummary';
import { listSchemas } from '@/lib/tools/listSchemas';
import { listStoredProcedures } from '@/lib/tools/listStoredProcedures';
import { listTables } from '@/lib/tools/listTables';
import { getRowCount } from '@/lib/tools/getRowCount';
import { searchTables } from '@/lib/tools/searchTables';
import { searchViews } from '@/lib/tools/searchViews';
import { searchFunctions } from '@/lib/tools/searchFunctions';
import { searchProcedures } from '@/lib/tools/searchProcedures';
import { searchColumns } from '@/lib/tools/searchColumns';
import { getViewDefinition } from '@/lib/tools/getViewDefinition';
import { runQuery } from '@/lib/tools/runQuery';
import type { ToolRequestWithCredentials, ToolResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ORIGIN = process.env.MCP_UI_ORIGIN?.trim() || '';
const ALLOWED_METHODS = 'POST, GET, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, MCP-Protocol-Version, Mcp-Session-Id';
const SUPPORTED_DATABASES = ['postgres', 'mssql', 'mysql', 'sqlite'] as const;

let transport: WebStandardStreamableHTTPServerTransport | null = null;
let mcpReady: Promise<void> | null = null;

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  if (ALLOWED_ORIGIN) {
    headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
    headers.set('Vary', 'Origin');
  }
  headers.set('Access-Control-Allow-Methods', ALLOWED_METHODS);
  headers.set('Access-Control-Allow-Headers', ALLOWED_HEADERS);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers
  });
}

function jsonError(message: string, status: number): Response {
  return new NextResponse(
    JSON.stringify({
      success: false,
      data: null,
      error: message
    } satisfies ToolResponse),
    {
      status,
      headers: {
        'Content-Type': 'application/json'
      }
    }
  );
}

function isMcpJsonRpcBody(rawBody: string): boolean {
  try {
    const parsed = JSON.parse(rawBody) as { jsonrpc?: string; method?: string } | null;
    return Boolean(parsed && typeof parsed === 'object' && parsed.jsonrpc === '2.0' && typeof parsed.method === 'string');
  } catch {
    return false;
  }
}

function toTextResult(result: ToolResponse<unknown>): CallToolResult {
  if (result.success) {
    return {
      content: [{ type: 'text', text: JSON.stringify(result.data, null, 2) }],
      structuredContent: result.data as Record<string, unknown>
    };
  }

  return {
    content: [{ type: 'text', text: result.error ?? 'Tool execution failed.' }],
    isError: true
  };
}

function createMcpServer(): McpServer {
  const server = new McpServer(
    {
      name: 'db-mcp',
      version: '1.0.0'
    },
    {
      capabilities: {
        tools: {},
        logging: {}
      }
    }
  );

  server.registerTool(
    'list_schemas',
    {
      title: 'List Schemas',
      description: 'List available schemas or databases for the configured connection.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES)
      })
    },
    async ({ db }) => toTextResult(await listSchemas(db))
  );

  server.registerTool(
    'get_database_info',
    {
      title: 'Get Database Info',
      description: 'Read the current database name, version, and session context.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES)
      })
    },
    async ({ db }) => toTextResult(await getDatabaseInfo(db))
  );

  server.registerTool(
    'run_query',
    {
      title: 'Run Query',
      description: 'Run a safe read-only SQL query against a configured database.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        query: z.string().min(1)
      })
    },
    async ({ db, query }) => toTextResult(await runQuery(db, query))
  );

  server.registerTool(
    'list_tables',
    {
      title: 'List Tables',
      description: 'List tables from the configured database.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES)
      })
    },
    async ({ db }) => toTextResult(await listTables(db))
  );

  server.registerTool(
    'search_tables',
    {
      title: 'Search Tables',
      description: 'Search for tables by partial name.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        query: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, query, schema }) => toTextResult(await searchTables(db, query, schema))
  );

  server.registerTool(
    'search_views',
    {
      title: 'Search Views',
      description: 'Search for views by partial name with a small capped result set.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        query: z.string().min(1),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(20).default(10)
      })
    },
    async ({ db, query, schema, limit }) => toTextResult(await searchViews(db, query, schema, limit))
  );

  server.registerTool(
    'search_functions',
    {
      title: 'Search Functions',
      description: 'Search for functions by partial name with a small capped result set.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        query: z.string().min(1),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(20).default(10)
      })
    },
    async ({ db, query, schema, limit }) => toTextResult(await searchFunctions(db, query, schema, limit))
  );

  server.registerTool(
    'search_procedures',
    {
      title: 'Search Procedures',
      description: 'Search for stored procedures by partial name with a small capped result set.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        query: z.string().min(1),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(20).default(10)
      })
    },
    async ({ db, query, schema, limit }) => toTextResult(await searchProcedures(db, query, schema, limit))
  );

  server.registerTool(
    'search_columns',
    {
      title: 'Search Columns',
      description: 'Search for columns by partial name with a small capped result set.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        query: z.string().min(1),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(20).default(10)
      })
    },
    async ({ db, query, schema, limit }) => toTextResult(await searchColumns(db, query, schema, limit))
  );

  server.registerTool(
    'get_table_schema',
    {
      title: 'Get Table Schema',
      description: 'Inspect the schema for a single table.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, table, schema }) => toTextResult(await getTableSchema(db, table, schema))
  );

  server.registerTool(
    'get_table_summary',
    {
      title: 'Get Table Summary',
      description: 'Return a compact table summary with only preview columns and key metadata.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, table, schema }) => toTextResult(await getTableSummary(db, table, schema))
  );

  server.registerTool(
    'get_view_definition',
    {
      title: 'Get View Definition',
      description: 'Inspect the SQL definition for a view.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        view: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, view, schema }) => toTextResult(await getViewDefinition(db, view, schema))
  );

  server.registerTool(
    'get_view_summary',
    {
      title: 'Get View Summary',
      description: 'Return a compact view summary with preview columns and a truncated definition.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        view: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, view, schema }) => toTextResult(await getViewSummary(db, view, schema))
  );

  server.registerTool(
    'get_procedure_summary',
    {
      title: 'Get Procedure Summary',
      description: 'Return a compact stored procedure summary with a short signature and parameters.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        procedure: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, procedure, schema }) => toTextResult(await getProcedureSummary(db, procedure, schema))
  );

  server.registerTool(
    'get_function_summary',
    {
      title: 'Get Function Summary',
      description: 'Return a compact function summary with a short signature and parameters.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        func: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, func, schema }) => toTextResult(await getFunctionSummary(db, func, schema))
  );

  server.registerTool(
    'get_sample_rows',
    {
      title: 'Get Sample Rows',
      description: 'Return a small capped sample of rows for a table.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().min(1),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(5).default(5)
      })
    },
    async ({ db, table, schema, limit }) => toTextResult(await getSampleRows(db, table, schema, limit))
  );

  server.registerTool(
    'get_table_sample_by_columns',
    {
      title: 'Get Table Sample By Columns',
      description: 'Return a tiny sample of selected columns only, to save tokens.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().min(1),
        schema: z.string().optional(),
        columns: z.array(z.string().min(1)).optional(),
        limit: z.number().int().min(1).max(5).default(5)
      })
    },
    async ({ db, table, schema, columns, limit }) =>
      toTextResult(await getTableSampleByColumns(db, table, schema, columns, limit))
  );

  server.registerTool(
    'get_row_count',
    {
      title: 'Get Row Count',
      description: 'Return the exact row count for a table without returning any rows.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, table, schema }) => toTextResult(await getRowCount(db, table, schema))
  );

  server.registerTool(
    'explain_query',
    {
      title: 'Explain Query',
      description: 'Return a compact execution plan for a read-only query.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        query: z.string().min(1)
      })
    },
    async ({ db, query }) => toTextResult(await explainQuery(db, query))
  );

  server.registerTool(
    'compare_schema',
    {
      title: 'Compare Schema',
      description: 'Compare two table schemas and return only the structural differences.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        left_table: z.string().min(1),
        right_table: z.string().min(1),
        left_schema: z.string().optional(),
        right_schema: z.string().optional()
      })
    },
    async ({ db, left_table, right_table, left_schema, right_schema }) =>
      toTextResult(await compareSchema(db, left_table, right_table, left_schema, right_schema))
  );

  server.registerTool(
    'compare_object_versions',
    {
      title: 'Compare Object Versions',
      description: 'Compare two tables, views, procedures, or functions and return only the compact differences.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        object_type: z.enum(['table', 'view', 'procedure', 'function']),
        left_name: z.string().min(1),
        right_name: z.string().min(1),
        schema: z.string().optional(),
        left_schema: z.string().optional(),
        right_schema: z.string().optional()
      })
    },
    async ({ db, object_type, left_name, right_name, schema, left_schema, right_schema }) =>
      toTextResult(await compareObjectVersions(db, object_type, left_name, right_name, schema, left_schema, right_schema))
  );

  server.registerTool(
    'get_dependency_graph',
    {
      title: 'Get Dependency Graph',
      description: 'Return a compact foreign-key dependency graph with nodes and edges only.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().optional(),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(20).default(10)
      })
    },
    async ({ db, table, schema, limit }) => toTextResult(await getDependencyGraph(db, table, schema, limit))
  );

  server.registerTool(
    'get_column_stats',
    {
      title: 'Get Column Stats',
      description: 'Return compact row and cardinality stats for a few table columns.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().min(1),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(5).default(5)
      })
    },
    async ({ db, table, schema, limit }) => toTextResult(await getColumnStats(db, table, schema, limit))
  );

  server.registerTool(
    'get_relationships',
    {
      title: 'Get Relationships',
      description: 'Inspect foreign-key relationships for a database schema or table.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().optional(),
        schema: z.string().optional()
      })
    },
    async ({ db, table, schema }) => toTextResult(await getRelationships(db, table, schema))
  );

  server.registerTool(
    'get_relation_path',
    {
      title: 'Get Relation Path',
      description: 'Find a compact foreign-key path between two tables using existing relationship data.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        source_table: z.string().min(1),
        target_table: z.string().min(1),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(20).default(10)
      })
    },
    async ({ db, source_table, target_table, schema, limit }) =>
      toTextResult(await getRelationPath(db, source_table, target_table, schema, limit))
  );

  server.registerTool(
    'get_indexes',
    {
      title: 'Get Indexes',
      description: 'Inspect table indexes and index columns.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().optional(),
        schema: z.string().optional()
      })
    },
    async ({ db, table, schema }) => toTextResult(await getIndexes(db, table, schema))
  );

  server.registerTool(
    'get_constraints',
    {
      title: 'Get Constraints',
      description: 'Inspect primary keys, unique constraints, foreign keys, and checks.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().optional(),
        schema: z.string().optional()
      })
    },
    async ({ db, table, schema }) => toTextResult(await getConstraints(db, table, schema))
  );

  server.registerTool(
    'list_stored_procedures',
    {
      title: 'List Stored Procedures',
      description: 'List stored procedures from the configured database.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        db: z.enum(SUPPORTED_DATABASES)
      })
    },
    async ({ db }) => toTextResult(await listStoredProcedures(db))
  );

  return server;
}

function getTransport(): WebStandardStreamableHTTPServerTransport {
  if (!transport) {
    const server = createMcpServer();
    transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });
    mcpReady = server.connect(transport);
  }

  return transport;
}

async function handleMcpRequest(request: Request): Promise<Response> {
  const currentTransport = getTransport();

  if (mcpReady) {
    await mcpReady;
  }

  return withCors(await currentTransport.handleRequest(request));
}

async function handleLegacyRequest(request: Request): Promise<Response> {
  try {
    const body = (await request.json()) as Partial<ToolRequestWithCredentials>;

    if (!body.tool) {
      return withCors(jsonError('A tool name is required.', 400));
    }

    switch (body.tool) {
      case 'run_query': {
        const input = body.input as ToolRequestWithCredentials<'run_query'>['input'];
        if (!input?.db || !input?.query) {
          return withCors(jsonError('run_query requires db and query.', 400));
        }

        const result = await runQuery(input.db, input.query, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'list_schemas': {
        const input = body.input as ToolRequestWithCredentials<'list_schemas'>['input'];
        if (!input?.db) {
          return withCors(jsonError('list_schemas requires db.', 400));
        }

        const result = await listSchemas(input.db, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'get_database_info': {
        const input = body.input as ToolRequestWithCredentials<'get_database_info'>['input'];
        if (!input?.db) {
          return withCors(jsonError('get_database_info requires db.', 400));
        }

        const result = await getDatabaseInfo(input.db, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'list_tables': {
        const input = body.input as ToolRequestWithCredentials<'list_tables'>['input'];
        if (!input?.db) {
          return withCors(jsonError('list_tables requires db.', 400));
        }

        const result = await listTables(input.db, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'search_columns': {
        const input = body.input as ToolRequestWithCredentials<'search_columns'>['input'];
        if (!input?.db || !input?.query) {
          return withCors(jsonError('search_columns requires db and query.', 400));
        }

        const result = await searchColumns(input.db, input.query, input.schema, input.limit, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'search_tables': {
        const input = body.input as ToolRequestWithCredentials<'search_tables'>['input'];
        if (!input?.db || !input?.query) {
          return withCors(jsonError('search_tables requires db and query.', 400));
        }

        const result = await searchTables(input.db, input.query, input.schema, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'search_procedures': {
        const input = body.input as ToolRequestWithCredentials<'search_procedures'>['input'];
        if (!input?.db || !input?.query) {
          return withCors(jsonError('search_procedures requires db and query.', 400));
        }

        const result = await searchProcedures(input.db, input.query, input.schema, input.limit, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'get_table_schema': {
        const input = body.input as ToolRequestWithCredentials<'get_table_schema'>['input'];
        if (!input?.db || !input?.table) {
          return withCors(jsonError('get_table_schema requires db and table.', 400));
        }

        const result = await getTableSchema(input.db, input.table, input.schema, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'get_table_summary': {
        const input = body.input as ToolRequestWithCredentials<'get_table_summary'>['input'];
        if (!input?.db || !input?.table) {
          return withCors(jsonError('get_table_summary requires db and table.', 400));
        }

        const result = await getTableSummary(input.db, input.table, input.schema, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'get_view_definition': {
        const input = body.input as ToolRequestWithCredentials<'get_view_definition'>['input'];
        if (!input?.db || !input?.view) {
          return withCors(jsonError('get_view_definition requires db and view.', 400));
        }

        const result = await getViewDefinition(input.db, input.view, input.schema, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'get_view_summary': {
        const input = body.input as ToolRequestWithCredentials<'get_view_summary'>['input'];
        if (!input?.db || !input?.view) {
          return withCors(jsonError('get_view_summary requires db and view.', 400));
        }

        const result = await getViewSummary(input.db, input.view, input.schema, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'get_procedure_summary': {
        const input = body.input as ToolRequestWithCredentials<'get_procedure_summary'>['input'];
        if (!input?.db || !input?.procedure) {
          return withCors(jsonError('get_procedure_summary requires db and procedure.', 400));
        }

        const result = await getProcedureSummary(input.db, input.procedure, input.schema, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'get_function_summary': {
        const input = body.input as ToolRequestWithCredentials<'get_function_summary'>['input'];
        if (!input?.db || !input?.func) {
          return withCors(jsonError('get_function_summary requires db and func.', 400));
        }

        const result = await getFunctionSummary(input.db, input.func, input.schema, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'compare_object_versions': {
        const input = body.input as ToolRequestWithCredentials<'compare_object_versions'>['input'];
        if (!input?.db || !input?.object_type || !input?.left_name || !input?.right_name) {
          return withCors(jsonError('compare_object_versions requires db, object_type, left_name, and right_name.', 400));
        }

        const result = await compareObjectVersions(
          input.db,
          input.object_type,
          input.left_name,
          input.right_name,
          input.schema,
          input.left_schema,
          input.right_schema,
          body.credentials
        );
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'get_sample_rows': {
        const input = body.input as ToolRequestWithCredentials<'get_sample_rows'>['input'];
        if (!input?.db || !input?.table) {
          return withCors(jsonError('get_sample_rows requires db and table.', 400));
        }

        const result = await getSampleRows(input.db, input.table, input.schema, input.limit, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'explain_query': {
        const input = body.input as ToolRequestWithCredentials<'explain_query'>['input'];
        if (!input?.db || !input?.query) {
          return withCors(jsonError('explain_query requires db and query.', 400));
        }

        const result = await explainQuery(input.db, input.query, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'get_relationships': {
        const input = body.input as ToolRequestWithCredentials<'get_relationships'>['input'];
        if (!input?.db) {
          return withCors(jsonError('get_relationships requires db.', 400));
        }

        const result = await getRelationships(input.db, input.table, input.schema, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'get_relation_path': {
        const input = body.input as ToolRequestWithCredentials<'get_relation_path'>['input'];
        if (!input?.db || !input?.source_table || !input?.target_table) {
          return withCors(jsonError('get_relation_path requires db, source_table, and target_table.', 400));
        }

        const result = await getRelationPath(input.db, input.source_table, input.target_table, input.schema, input.limit, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'get_indexes': {
        const input = body.input as ToolRequestWithCredentials<'get_indexes'>['input'];
        if (!input?.db) {
          return withCors(jsonError('get_indexes requires db.', 400));
        }

        const result = await getIndexes(input.db, input.table, input.schema, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'get_constraints': {
        const input = body.input as ToolRequestWithCredentials<'get_constraints'>['input'];
        if (!input?.db) {
          return withCors(jsonError('get_constraints requires db.', 400));
        }

        const result = await getConstraints(input.db, input.table, input.schema, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'list_stored_procedures': {
        const input = body.input as ToolRequestWithCredentials<'list_stored_procedures'>['input'];
        if (!input?.db) {
          return withCors(jsonError('list_stored_procedures requires db.', 400));
        }

        const result = await listStoredProcedures(input.db, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      default:
        return withCors(jsonError(`Unsupported tool: ${body.tool}`, 400));
    }
  } catch (error) {
    return withCors(
      new NextResponse(
        JSON.stringify({
          success: false,
          data: null,
          error: error instanceof Error ? error.message : 'Unexpected server error.'
        } satisfies ToolResponse),
        {
          status: 500,
          headers: {
            'Content-Type': 'application/json'
          }
        }
      )
    );
  }
}

export async function OPTIONS() {
  return withCors(
    new NextResponse(null, {
      status: 204
    })
  );
}

export async function GET(request: Request) {
  return handleMcpRequest(request);
}

export async function DELETE(request: Request) {
  return handleMcpRequest(request);
}

export async function POST(request: Request) {
  const rawBody = await request.clone().text();
  if (isMcpJsonRpcBody(rawBody)) {
    return handleMcpRequest(request);
  }

  return handleLegacyRequest(request);
}
