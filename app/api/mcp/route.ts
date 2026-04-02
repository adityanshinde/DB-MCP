import { NextResponse } from 'next/server';

import { getRelationships } from '@/lib/tools/getRelationships';
import { getTableSchema } from '@/lib/tools/getSchema';
import { listTables } from '@/lib/tools/listTables';
import { runQuery } from '@/lib/tools/runQuery';
import type { ToolRequest, ToolResponse } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as Partial<ToolRequest>;

    if (!body.tool) {
      return NextResponse.json<ToolResponse>({
        success: false,
        data: null,
        error: 'A tool name is required.'
      }, { status: 400 });
    }

    switch (body.tool) {
      case 'run_query': {
        const input = body.input as ToolRequest<'run_query'>['input'];
        if (!input?.db || !input?.query) {
          return NextResponse.json<ToolResponse>({
            success: false,
            data: null,
            error: 'run_query requires db and query.'
          }, { status: 400 });
        }

        const result = await runQuery(input.db, input.query);
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
      }

      case 'list_tables': {
        const input = body.input as ToolRequest<'list_tables'>['input'];
        if (!input?.db) {
          return NextResponse.json<ToolResponse>({
            success: false,
            data: null,
            error: 'list_tables requires db.'
          }, { status: 400 });
        }

        const result = await listTables(input.db);
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
      }

      case 'get_table_schema': {
        const input = body.input as ToolRequest<'get_table_schema'>['input'];
        if (!input?.db || !input?.table) {
          return NextResponse.json<ToolResponse>({
            success: false,
            data: null,
            error: 'get_table_schema requires db and table.'
          }, { status: 400 });
        }

        const result = await getTableSchema(input.db, input.table, input.schema);
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
      }

      case 'get_relationships': {
        const input = body.input as ToolRequest<'get_relationships'>['input'];
        if (!input?.db) {
          return NextResponse.json<ToolResponse>({
            success: false,
            data: null,
            error: 'get_relationships requires db.'
          }, { status: 400 });
        }

        const result = await getRelationships(input.db, input.table, input.schema);
        return NextResponse.json(result, { status: result.success ? 200 : 400 });
      }

      default:
        return NextResponse.json<ToolResponse>({
          success: false,
          data: null,
          error: `Unsupported tool: ${body.tool}`
        }, { status: 400 });
    }
  } catch (error) {
    return NextResponse.json<ToolResponse>({
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Unexpected server error.'
    }, { status: 500 });
  }
}
