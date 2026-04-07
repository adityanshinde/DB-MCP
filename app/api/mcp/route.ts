import { NextResponse } from 'next/server';

import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { getConstraints } from '@/lib/tools/getConstraints';
import { getDatabaseInfo } from '@/lib/tools/getDatabaseInfo';
import { getIndexes } from '@/lib/tools/getIndexes';
import { getRelationships } from '@/lib/tools/getRelationships';
import { getTableSchema } from '@/lib/tools/getSchema';
import { listSchemas } from '@/lib/tools/listSchemas';
import { listStoredProcedures } from '@/lib/tools/listStoredProcedures';
import { listTables } from '@/lib/tools/listTables';
import { searchTables } from '@/lib/tools/searchTables';
import { getViewDefinition } from '@/lib/tools/getViewDefinition';
import { runQuery } from '@/lib/tools/runQuery';
import type { ToolRequestWithCredentials, ToolResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ORIGIN = process.env.MCP_UI_ORIGIN || '*';
const ALLOWED_METHODS = 'POST, GET, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, MCP-Protocol-Version, Mcp-Session-Id, Authorization';
const SUPPORTED_DATABASES = ['postgres', 'mssql', 'mysql', 'sqlite'] as const;

let transport: WebStandardStreamableHTTPServerTransport | null = null;
let mcpReady: Promise<void> | null = null;

function withCors(response: Response): Response {
  const headers = new Headers(response.headers);
  headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
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

      case 'search_tables': {
        const input = body.input as ToolRequestWithCredentials<'search_tables'>['input'];
        if (!input?.db || !input?.query) {
          return withCors(jsonError('search_tables requires db and query.', 400));
        }

        const result = await searchTables(input.db, input.query, input.schema, body.credentials);
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

      case 'get_view_definition': {
        const input = body.input as ToolRequestWithCredentials<'get_view_definition'>['input'];
        if (!input?.db || !input?.view) {
          return withCors(jsonError('get_view_definition requires db and view.', 400));
        }

        const result = await getViewDefinition(input.db, input.view, input.schema, body.credentials);
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
