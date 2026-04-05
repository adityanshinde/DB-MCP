import { NextResponse } from 'next/server';

import { getRelationships } from '@/lib/tools/getRelationships';
import { getTableSchema } from '@/lib/tools/getSchema';
import { listTables } from '@/lib/tools/listTables';
import { runQuery } from '@/lib/tools/runQuery';
import { listStoredProcedures } from '@/lib/tools/listStoredProcedures';
import type { ToolRequestWithCredentials, ToolResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ORIGIN = process.env.MCP_UI_ORIGIN || '*';

function withCors(response: NextResponse) {
  response.headers.set('Access-Control-Allow-Origin', ALLOWED_ORIGIN);
  response.headers.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  return response;
}

export async function OPTIONS() {
  return withCors(
    new NextResponse(null, {
      status: 204
    })
  );
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ToolRequestWithCredentials>;

    if (!body.tool) {
      return withCors(NextResponse.json<ToolResponse>({
        success: false,
        data: null,
        error: 'A tool name is required.'
      }, { status: 400 }));
    }

    switch (body.tool) {
      case 'run_query': {
        const input = body.input as ToolRequestWithCredentials<'run_query'>['input'];
        if (!input?.db || !input?.query) {
          return withCors(NextResponse.json<ToolResponse>({
            success: false,
            data: null,
            error: 'run_query requires db and query.'
          }, { status: 400 }));
        }

        const result = await runQuery(input.db, input.query, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'list_tables': {
        const input = body.input as ToolRequestWithCredentials<'list_tables'>['input'];
        if (!input?.db) {
          return withCors(NextResponse.json<ToolResponse>({
            success: false,
            data: null,
            error: 'list_tables requires db.'
          }, { status: 400 }));
        }

        const result = await listTables(input.db, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'get_table_schema': {
        const input = body.input as ToolRequestWithCredentials<'get_table_schema'>['input'];
        if (!input?.db || !input?.table) {
          return withCors(NextResponse.json<ToolResponse>({
            success: false,
            data: null,
            error: 'get_table_schema requires db and table.'
          }, { status: 400 }));
        }

        const result = await getTableSchema(input.db, input.table, input.schema, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'get_relationships': {
        const input = body.input as ToolRequestWithCredentials<'get_relationships'>['input'];
        if (!input?.db) {
          return withCors(NextResponse.json<ToolResponse>({
            success: false,
            data: null,
            error: 'get_relationships requires db.'
          }, { status: 400 }));
        }

        const result = await getRelationships(input.db, input.table, input.schema, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'list_stored_procedures': {
        const input = body.input as ToolRequestWithCredentials<'list_stored_procedures'>['input'];
        if (!input?.db) {
          return withCors(NextResponse.json<ToolResponse>({
            success: false,
            data: null,
            error: 'list_stored_procedures requires db.'
          }, { status: 400 }));
        }

        const result = await listStoredProcedures(input.db, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      default:
        return withCors(NextResponse.json<ToolResponse>({
          success: false,
          data: null,
          error: `Unsupported tool: ${body.tool}`
        }, { status: 400 }));
    }
  } catch (error) {
    return withCors(NextResponse.json<ToolResponse>({
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unexpected server error.'
    }, { status: 500 }));
  }
}
