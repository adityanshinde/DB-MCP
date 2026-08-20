import { NextResponse } from 'next/server';
import { randomUUID } from 'node:crypto';

import { McpServer, WebStandardStreamableHTTPServerTransport } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

import { createMcpServer } from '@/lib/mcp/createMcpServer';
import { CONFIG } from '@/lib/config';

import { getConstraints } from '@/lib/tools/db/getConstraints';
import { compareSchema } from '@/lib/tools/db/compareSchema';
import { getForeignKeySummary } from '@/lib/tools/db/getForeignKeySummary';
import { getDatabaseInfo } from '@/lib/tools/db/getDatabaseInfo';
import { getColumnStats } from '@/lib/tools/db/getColumnStats';
import { compareObjectVersions } from '@/lib/tools/db/compareObjectVersions';
import { getDependencyGraph } from '@/lib/tools/db/getDependencyGraph';
import { getFunctionSummary } from '@/lib/tools/db/getFunctionSummary';
import { getIndexes } from '@/lib/tools/db/getIndexes';
import { getRelationPath } from '@/lib/tools/db/getRelationPath';
import { getProcedureSummary } from '@/lib/tools/db/getProcedureSummary';
import { getRelationships } from '@/lib/tools/db/getRelationships';
import { getNl2sqlContext } from '@/lib/tools/db/getNl2sqlContext';
import { getSampleRows } from '@/lib/tools/db/getSampleRows';
import { explainQuery } from '@/lib/tools/db/explainQuery';
import { getTableSchema } from '@/lib/tools/db/getSchema';
import { getTableSampleByColumns } from '@/lib/tools/db/getTableSampleByColumns';
import { getTableSummary } from '@/lib/tools/db/getTableSummary';
import { executeReadQuery } from '@/lib/tools/db/executeReadQuery';
import { executeStoredProcedure } from '@/lib/tools/db/executeStoredProcedure';
import { listOrgRepos } from '@/lib/tools/github/listOrgRepos';
import { getRepoTree } from '@/lib/tools/github/getRepoTree';
import { getFileContent } from '@/lib/tools/github/getFileContent';
import { getFunctionBody } from '@/lib/tools/github/getFunctionBody';
import { grepFile } from '@/lib/tools/github/grepFile';
import { searchFiles, searchSymbols, findReferences, getMethodDefinition, getClassDefinition, getInterfaceImplementations, getMethodCallers, getMethodCallees, readLines, getProjectReferences, getDependencyGraph as getGithubDependencyGraph, findDependencyPath, traceCallChain } from '@/lib/tools/github/csharpTools';
import { searchCode } from '@/lib/tools/github/searchCode';
import { fileSummary } from '@/lib/tools/github/fileSummary';
import { moduleSummary } from '@/lib/tools/github/moduleSummary';
import { getCommitHistory } from '@/lib/tools/github/getCommitHistory';
import { getFileHistory } from '@/lib/tools/github/getFileHistory';
import { compareRefs } from '@/lib/tools/github/compareRefs';
import { getPullRequestComments } from '@/lib/tools/github/getPullRequestComments';
import { getGitHubMetrics } from '@/lib/tools/github/githubClient';
import { getViewSummary } from '@/lib/tools/db/getViewSummary';
import { listSchemas } from '@/lib/tools/db/listSchemas';
import { listPostgresConnections } from '@/lib/tools/db/listPostgresConnections';
import { listMssqlConnections } from '@/lib/tools/db/listMssqlConnections';
import { listStoredProcedures } from '@/lib/tools/db/listStoredProcedures';
import { listTables } from '@/lib/tools/db/listTables';
import { getRowCount } from '@/lib/tools/db/getRowCount';
import { searchTables } from '@/lib/tools/db/searchTables';
import { searchViews } from '@/lib/tools/db/searchViews';
import { searchFunctions } from '@/lib/tools/db/searchFunctions';
import { searchProcedures } from '@/lib/tools/db/searchProcedures';
import { searchColumns } from '@/lib/tools/db/searchColumns';
import { getViewDefinition } from '@/lib/tools/db/getViewDefinition';
import { runQuery } from '@/lib/tools/db/runQuery';
import { getMetadataCacheMetrics } from '@/lib/cache/metadataCache';
import { installProcessGuards } from '@/lib/runtime/processGuards';
import { MCP_METRICS } from '@/lib/runtime/mcpMetrics';
import { logMcpEvent, logMcpError } from '@/lib/runtime/observability';
import type { ToolRequestWithCredentials, ToolResponse } from '@/lib/types';

export { createMcpServer };

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const ALLOWED_ORIGIN = process.env.MCP_UI_ORIGIN?.trim() || '';
const ALLOWED_METHODS = 'POST, GET, DELETE, OPTIONS';
const ALLOWED_HEADERS = 'Content-Type, MCP-Protocol-Version, Mcp-Session-Id';

async function handleMcpRequest(request: Request, rawBody?: string): Promise<Response> {
  MCP_METRICS.request.jsonRpcRequests += 1;
  logRequestEvent('request.incoming', request, {
    requestKind: 'jsonrpc',
    jsonRpcMethod: readMcpMethod(rawBody)
  });

  const coldStartForThisRequest = isColdStart;

  try {
    const server = createMcpServer();
    const transport = new WebStandardStreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
      enableJsonResponse: true
    });

    await server.connect(transport);
    const response = await transport.handleRequest(request);

    isColdStart = false;
    return withCacheHeaders(withCors(response), coldStartForThisRequest);
  } catch (error) {
    MCP_METRICS.request.errors += 1;
    logMcpError('request.transport_failed', error, {
      errors: MCP_METRICS.request.errors
    });

    const fallbackResponse = withCacheHeaders(
      withCors(
        new NextResponse(
          JSON.stringify({
            success: false,
            data: null,
            error: error instanceof Error ? error.message : 'Unexpected transport error.'
          } satisfies ToolResponse),
          {
            status: 500,
            headers: {
              'Content-Type': 'application/json'
            }
          }
        )
      ),
      coldStartForThisRequest
    );
    isColdStart = false;
    return fallbackResponse;
  }
}

async function handleSessionClose(request: Request): Promise<Response> {
  logRequestEvent('request.incoming', request, { requestKind: 'delete' });
  return withCors(
    new NextResponse(null, {
      status: 204
    })
  );
}

async function handleLegacyRequest(request: Request): Promise<Response> {
  MCP_METRICS.request.legacyRequests += 1;
  logRequestEvent('request.incoming', request, { requestKind: 'legacy' });

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

      case 'db_execute_read_query': {
        const input = body.input as ToolRequestWithCredentials<'db_execute_read_query'>['input'];
        if (!input?.db || !input?.query) {
          return withCors(jsonError('db_execute_read_query requires db and query.', 400));
        }

        const result = await executeReadQuery(input.db, input.query, body.credentials);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'db_execute_stored_procedure': {
        const input = body.input as ToolRequestWithCredentials<'db_execute_stored_procedure'>['input'];
        if (!input?.db || !input?.procedure) {
          return withCors(jsonError('db_execute_stored_procedure requires db and procedure.', 400));
        }

        const result = await executeStoredProcedure(input, body.credentials, (input as { connection?: string }).connection);
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

      case 'github_get_repo_tree': {
        const input = body.input as ToolRequestWithCredentials<'github_get_repo_tree'>['input'];
        if (!input?.repo && !input?.org) {
          return withCors(jsonError('github_get_repo_tree requires repo or org.', 400));
        }

        const result = await getRepoTree(input.repo, input.path, input.branch, input.depth, input.org);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_get_file_content': {
        const input = body.input as ToolRequestWithCredentials<'github_get_file_content'>['input'];
        if ((!input?.repo && !input?.org) || !input?.path) {
          return withCors(jsonError('github_get_file_content requires repo or org and path.', 400));
        }

        const result = await getFileContent(input.repo, input.path, input.branch, input.org);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_get_function_body': {
        const input = body.input as ToolRequestWithCredentials<'github_get_function_body'>['input'];
        if ((!input?.repo && !input?.org) || !input?.path || !input?.function_name) {
          return withCors(jsonError('github_get_function_body requires repo or org, path, and function_name.', 400));
        }

        const result = await getFunctionBody(input);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_grep_file': {
        const input = body.input as ToolRequestWithCredentials<'github_grep_file'>['input'];
        if ((!input?.repo && !input?.org) || !input?.path || !input?.query) {
          return withCors(jsonError('github_grep_file requires repo or org, path, and query.', 400));
        }

        const result = await grepFile(input);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_search_files': {
        const input = body.input as ToolRequestWithCredentials<'github_search_files'>['input'];
        if ((!input?.repo && !input?.org) || !input?.query) {
          return withCors(jsonError('github_search_files requires repo or org and query.', 400));
        }

        const result = await searchFiles(input);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_search_symbols': {
        const input = body.input as ToolRequestWithCredentials<'github_search_symbols'>['input'];
        if ((!input?.repo && !input?.org) || !input?.symbol) {
          return withCors(jsonError('github_search_symbols requires repo or org and symbol.', 400));
        }

        const result = await searchSymbols(input);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_find_references': {
        const input = body.input as ToolRequestWithCredentials<'github_find_references'>['input'];
        if ((!input?.repo && !input?.org) || !input?.symbol) {
          return withCors(jsonError('github_find_references requires repo or org and symbol.', 400));
        }

        const result = await findReferences(input);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_get_method_definition': {
        const input = body.input as ToolRequestWithCredentials<'github_get_method_definition'>['input'];
        if ((!input?.repo && !input?.org) || !input?.name) {
          return withCors(jsonError('github_get_method_definition requires repo or org and name.', 400));
        }

        const result = await getMethodDefinition(input);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_get_class_definition': {
        const input = body.input as ToolRequestWithCredentials<'github_get_class_definition'>['input'];
        if ((!input?.repo && !input?.org) || !input?.name) {
          return withCors(jsonError('github_get_class_definition requires repo or org and name.', 400));
        }

        const result = await getClassDefinition(input);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_get_interface_implementations': {
        const input = body.input as ToolRequestWithCredentials<'github_get_interface_implementations'>['input'];
        if ((!input?.repo && !input?.org) || !input?.symbol) {
          return withCors(jsonError('github_get_interface_implementations requires repo or org and symbol.', 400));
        }

        const result = await getInterfaceImplementations(input);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_get_method_callers': {
        const input = body.input as ToolRequestWithCredentials<'github_get_method_callers'>['input'];
        if ((!input?.repo && !input?.org) || !input?.name) {
          return withCors(jsonError('github_get_method_callers requires repo or org and name.', 400));
        }

        const result = await getMethodCallers(input);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_get_method_callees': {
        const input = body.input as ToolRequestWithCredentials<'github_get_method_callees'>['input'];
        if ((!input?.repo && !input?.org) || !input?.name) {
          return withCors(jsonError('github_get_method_callees requires repo or org and name.', 400));
        }

        const result = await getMethodCallees(input);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_read_lines': {
        const input = body.input as ToolRequestWithCredentials<'github_read_lines'>['input'];
        if ((!input?.repo && !input?.org) || !input?.path) {
          return withCors(jsonError('github_read_lines requires repo or org and path.', 400));
        }

        const result = await readLines(input);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_get_project_references':
      case 'github_get_dependency_graph': {
        const input = body.input as ToolRequestWithCredentials<'github_get_project_references'>['input'];
        if ((!input?.repo && !input?.org)) {
          return withCors(jsonError('github_get_project_references requires repo or org.', 400));
        }

        const result = await getProjectReferences(input);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_find_dependency_path': {
        const input = body.input as ToolRequestWithCredentials<'github_find_dependency_path'>['input'];
        if ((!input?.repo && !input?.org) || !input?.from || !input?.to) {
          return withCors(jsonError('github_find_dependency_path requires repo or org, from, and to.', 400));
        }

        const result = await findDependencyPath(input);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_trace_call_chain': {
        const input = body.input as ToolRequestWithCredentials<'github_trace_call_chain'>['input'];
        if ((!input?.repo && !input?.org) || !input?.entry_symbol) {
          return withCors(jsonError('github_trace_call_chain requires repo or org and entry_symbol.', 400));
        }

        const result = await traceCallChain(input);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_search_code': {
        const input = body.input as ToolRequestWithCredentials<'github_search_code'>['input'];
        if ((!input?.repo && !input?.org) || !input?.query) {
          return withCors(jsonError('github_search_code requires repo or org and query.', 400));
        }

        const result = await searchCode(input.repo, input.query, input.limit, input.language, input.org);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_list_org_repos': {
        const input = body.input as ToolRequestWithCredentials<'github_list_org_repos'>['input'];
        const result = await listOrgRepos({
          org: input?.org,
          page: input?.page,
          per_page: input?.per_page,
          filter: input?.filter,
          sort: input?.sort,
          direction: input?.direction
        });
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_file_summary': {
        const input = body.input as ToolRequestWithCredentials<'github_file_summary'>['input'];
        if (!input?.path || (!input?.repo && !input?.org)) {
          return withCors(jsonError('github_file_summary requires repo or org and path.', 400));
        }

        const result = await fileSummary(input);
        return withCors(NextResponse.json(result, { status: result.success ? 200 : 400 }));
      }

      case 'github_module_summary': {
        const input = body.input as ToolRequestWithCredentials<'github_module_summary'>['input'];
        if (!input?.path || (!input?.repo && !input?.org)) {
          return withCors(jsonError('github_module_summary requires repo or org and path.', 400));
        }

        const result = await moduleSummary(input);
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

        const result = await listTables(input.db, input.schema, body.credentials, input.connection);
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

      case 'get_nl2sql_context': {
        const input = body.input as ToolRequestWithCredentials<'get_nl2sql_context'>['input'];
        if (!input?.db || !input?.question) {
          return withCors(jsonError('get_nl2sql_context requires db and question.', 400));
        }

        const result = await getNl2sqlContext(input.db, input.question, input.schema, input.max_tables, body.credentials, input.connection);
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
    MCP_METRICS.request.errors += 1;
    logMcpError('request.legacy_failed', error, {
      requestKind: 'legacy',
      errors: MCP_METRICS.request.errors
    });
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
  try {
    MCP_METRICS.request.totalRequests += 1;
    return await handleMcpRequest(request);
  } catch (error) {
    MCP_METRICS.request.errors += 1;
    logMcpError('request.get_failed', error, { errors: MCP_METRICS.request.errors });
    return withCors(jsonError(error instanceof Error ? error.message : 'Unexpected server error.', 500));
  }
}

export async function DELETE(request: Request) {
  try {
    MCP_METRICS.request.totalRequests += 1;
    return await handleSessionClose(request);
  } catch (error) {
    MCP_METRICS.request.errors += 1;
    logMcpError('request.delete_failed', error, { errors: MCP_METRICS.request.errors });
    return withCors(jsonError(error instanceof Error ? error.message : 'Unexpected server error.', 500));
  }
}

export async function POST(request: Request) {
  try {
    MCP_METRICS.request.totalRequests += 1;
    const rawBody = await request.clone().text();
    if (isMcpJsonRpcBody(rawBody)) {
      return await handleMcpRequest(request, rawBody);
    }

    return await handleLegacyRequest(request);
  } catch (error) {
    MCP_METRICS.request.errors += 1;
    logMcpError('request.post_failed', error, { errors: MCP_METRICS.request.errors });
    return withCors(jsonError(error instanceof Error ? error.message : 'Unexpected server error.', 500));
  }
}
