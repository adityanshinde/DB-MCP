import { McpServer } from '@modelcontextprotocol/server';
import type { CallToolResult } from '@modelcontextprotocol/server';
import * as z from 'zod/v4';

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
import { CONFIG } from '@/lib/config';
import type { ToolResponse } from '@/lib/types';

export const SUPPORTED_DATABASES = ['postgres', 'mssql', 'mysql', 'sqlite'] as const;

const passthroughObject = <T extends z.ZodRawShape>(shape: T) =>
  z.object({
    connection: z.string().optional(),
    ...shape
  }).passthrough();

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

export function createMcpServer(): McpServer {
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES)
      })
    },
    async ({ db, connection }: any) => toTextResult(await listSchemas(db, undefined, connection))
  );

  server.registerTool(
    'list_postgres_connections',
    {
      title: 'List Postgres Connections',
      description: 'List configured Postgres connection aliases with the schemas available in each database, and indicate which connection is the default.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: passthroughObject({})
    },
    async () => toTextResult(await listPostgresConnections())
  );

  server.registerTool(
    'list_mssql_connections',
    {
      title: 'List MSSQL Connections',
      description: 'List configured MSSQL connection aliases and indicate which one is the default. If only MSSQL_CONNECTION_STRING is set, the fallback alias is default.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: passthroughObject({})
    },
    async () => toTextResult(await listMssqlConnections())
  );

  server.registerTool(
    'github_list_org_repos',
    {
      title: 'GitHub List Org Repos',
      description: 'List allowlisted repositories within a configured GitHub organization, using bounded pagination.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        org: z.string().optional(),
        page: z.number().int().min(1).max(100).default(1),
        per_page: z.number().int().min(1).max(100).default(30),
        filter: z.enum(['all', 'public', 'private', 'forks', 'sources', 'member']).default('all'),
        sort: z.enum(['created', 'updated', 'pushed', 'full_name']).default('created'),
        direction: z.enum(['asc', 'desc']).default('desc')
      })
    },
    async ({ org, page, per_page, filter, sort, direction }) => toTextResult(await listOrgRepos({ org, page, per_page, filter, sort, direction }))
  );

  server.registerTool(
    'github_get_repo_tree',
    {
      title: 'GitHub Get Repo Tree',
      description: 'Explore an allowlisted GitHub repository tree with a bounded depth and result cap.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        path: z.string().optional(),
        branch: z.string().optional(),
        depth: z.number().int().min(1).max(CONFIG.github.treeMaxDepth).default(CONFIG.github.treeMaxDepth)
      })
    },
    async ({ org, repo, path, branch, depth }) => toTextResult(await getRepoTree(repo, path, branch, depth, org))
  );

  server.registerTool(
    'github_get_file_content',
    {
      title: 'GitHub Get File Content',
      description: 'Fetch the contents of a single allowlisted repository file.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        path: z.string().min(1),
        branch: z.string().optional()
      })
    },
    async ({ org, repo, path, branch }) => toTextResult(await getFileContent(repo, path, branch, org))
  );

  server.registerTool(
    'github_get_function_body',
    {
      title: 'GitHub Get Function Body',
      description: 'Extract the full body of a named function, method, or function-valued property from a file.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        path: z.string().min(1),
        branch: z.string().optional(),
        function_name: z.string().min(1),
        max_matches: z.number().int().min(1).max(5).default(1)
      })
    },
    async ({ org, repo, path, branch, function_name, max_matches }) =>
      toTextResult(
        await getFunctionBody({
          org,
          repo,
          path,
          branch,
          function_name,
          max_matches
        })
      )
  );

  server.registerTool(
    'github_grep_file',
    {
      title: 'GitHub Grep File',
      description: 'Search a single allowlisted repository file and return matching lines with context.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        path: z.string().min(1),
        branch: z.string().optional(),
        query: z.string().min(1),
        regex: z.boolean().default(false),
        case_sensitive: z.boolean().default(false),
        context_lines: z.number().int().min(0).max(10).default(2),
        start_line: z.number().int().min(1).optional(),
        end_line: z.number().int().min(1).optional(),
        max_matches: z.number().int().min(1).max(500).default(50)
      })
    },
    async ({ org, repo, path, branch, query, regex, case_sensitive, context_lines, start_line, end_line, max_matches }) =>
      toTextResult(
        await grepFile({
          org,
          repo,
          path,
          branch,
          query,
          regex,
          case_sensitive,
          context_lines,
          start_line,
          end_line,
          max_matches
        })
      )
  );

  server.registerTool(
    'github_search_files',
    {
      title: 'GitHub Search Files',
      description: 'Search allowlisted repository file paths for C# workflow navigation.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        branch: z.string().optional(),
        query: z.string().min(1),
        path: z.string().optional(),
        glob: z.string().optional(),
        limit: z.number().int().min(1).max(100).default(20)
      })
    },
    async ({ org, repo, branch, query, path, glob, limit }) => toTextResult(await searchFiles({ org, repo, branch, query, path, glob, limit }))
  );

  server.registerTool(
    'github_search_symbols',
    {
      title: 'GitHub Search Symbols',
      description: 'Search C# symbol definitions and related code matches in allowlisted repositories.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        branch: z.string().optional(),
        symbol: z.string().min(1),
        kind: z.enum(['class', 'interface', 'method', 'property', 'field', 'namespace']).optional(),
        limit: z.number().int().min(1).max(100).default(20)
      })
    },
    async ({ org, repo, branch, symbol, kind, limit }) => toTextResult(await searchSymbols({ org, repo, branch, symbol, kind, limit }))
  );

  server.registerTool(
    'github_find_references',
    {
      title: 'GitHub Find References',
      description: 'Find reference-like C# code matches for a symbol in an allowlisted repository.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        branch: z.string().optional(),
        symbol: z.string().min(1),
        kind: z.enum(['class', 'interface', 'method', 'property', 'field', 'namespace']).optional(),
        limit: z.number().int().min(1).max(100).default(20)
      })
    },
    async ({ org, repo, branch, symbol, kind, limit }) => toTextResult(await findReferences({ org, repo, branch, symbol, kind, limit }))
  );

  server.registerTool(
    'github_get_method_definition',
    {
      title: 'GitHub Get Method Definition',
      description: 'Extract C# method definitions from an allowlisted repository.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        branch: z.string().optional(),
        path: z.string().optional(),
        class_name: z.string().optional(),
        name: z.string().min(1),
        limit: z.number().int().min(1).max(20).default(5)
      })
    },
    async ({ org, repo, branch, path, class_name, name, limit }) => toTextResult(await getMethodDefinition({ org, repo, branch, path, class_name, name, limit }))
  );

  server.registerTool(
    'github_get_class_definition',
    {
      title: 'GitHub Get Class Definition',
      description: 'Extract C# class definitions from an allowlisted repository.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        branch: z.string().optional(),
        path: z.string().optional(),
        class_name: z.string().optional(),
        name: z.string().min(1),
        limit: z.number().int().min(1).max(20).default(5)
      })
    },
    async ({ org, repo, branch, path, class_name, name, limit }) => toTextResult(await getClassDefinition({ org, repo, branch, path, class_name, name, limit }))
  );

  server.registerTool(
    'github_get_interface_implementations',
    {
      title: 'GitHub Get Interface Implementations',
      description: 'Find C# classes that appear to implement a given interface.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        branch: z.string().optional(),
        symbol: z.string().min(1),
        kind: z.enum(['class', 'interface', 'method', 'property', 'field', 'namespace']).optional(),
        limit: z.number().int().min(1).max(100).default(10)
      })
    },
    async ({ org, repo, branch, symbol, kind, limit }) => toTextResult(await getInterfaceImplementations({ org, repo, branch, symbol, kind, limit }))
  );

  server.registerTool(
    'github_get_method_callers',
    {
      title: 'GitHub Get Method Callers',
      description: 'Return call-site style matches for a C# method in an allowlisted repository.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        branch: z.string().optional(),
        path: z.string().optional(),
        class_name: z.string().optional(),
        name: z.string().min(1),
        limit: z.number().int().min(1).max(100).default(10)
      })
    },
    async ({ org, repo, branch, path, class_name, name, limit }) => toTextResult(await getMethodCallers({ org, repo, branch, path, class_name, name, limit }))
  );

  server.registerTool(
    'github_get_method_callees',
    {
      title: 'GitHub Get Method Callees',
      description: 'List likely method calls found inside a C# method body.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        branch: z.string().optional(),
        path: z.string().optional(),
        class_name: z.string().optional(),
        name: z.string().min(1),
        limit: z.number().int().min(1).max(100).default(10)
      })
    },
    async ({ org, repo, branch, path, class_name, name, limit }) => toTextResult(await getMethodCallees({ org, repo, branch, path, class_name, name, limit }))
  );

  server.registerTool(
    'github_read_lines',
    {
      title: 'GitHub Read Lines',
      description: 'Read a bounded line range from a repository file.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        branch: z.string().optional(),
        path: z.string().min(1),
        start: z.number().int().min(1),
        end: z.number().int().min(1)
      })
    },
    async ({ org, repo, branch, path, start, end }) => toTextResult(await readLines({ org, repo, branch, path, start, end }))
  );

  server.registerTool(
    'github_get_project_references',
    {
      title: 'GitHub Get Project References',
      description: 'Parse solution and project references across a repository.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        branch: z.string().optional(),
        root: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50)
      })
    },
    async ({ org, repo, branch, root, limit }) => toTextResult(await getProjectReferences({ org, repo, branch, root, limit }))
  );

  server.registerTool(
    'github_get_dependency_graph',
    {
      title: 'GitHub Get Dependency Graph',
      description: 'Return a compact dependency graph from solution and project references.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        branch: z.string().optional(),
        root: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50)
      })
    },
    async ({ org, repo, branch, root, limit }) => toTextResult(await getGithubDependencyGraph({ org, repo, branch, root, limit }))
  );

  server.registerTool(
    'github_find_dependency_path',
    {
      title: 'GitHub Find Dependency Path',
      description: 'Find a shortest dependency path between two projects or assemblies.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        branch: z.string().optional(),
        from: z.string().min(1),
        to: z.string().min(1),
        root: z.string().optional(),
        limit: z.number().int().min(1).max(200).default(50)
      })
    },
    async ({ org, repo, branch, from, to, root, limit }) => toTextResult(await findDependencyPath({ org, repo, branch, from, to, root, limit }))
  );

  server.registerTool(
    'github_trace_call_chain',
    {
      title: 'GitHub Trace Call Chain',
      description: 'Trace a likely call chain starting from a named C# symbol.',
      annotations: { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: true },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        branch: z.string().optional(),
        entry_symbol: z.string().min(1),
        path: z.string().optional(),
        class_name: z.string().optional(),
        depth: z.number().int().min(1).max(8).default(3),
        limit: z.number().int().min(1).max(200).default(50)
      })
    },
    async ({ org, repo, branch, entry_symbol, path, class_name, depth, limit }) =>
      toTextResult(await traceCallChain({ org, repo, branch, entry_symbol, path, class_name, depth, limit }))
  );

  server.registerTool(
    'github_search_code',
    {
      title: 'GitHub Search Code',
      description: 'Search within an allowlisted GitHub repository using read-only code search.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        query: z.string().min(1),
        limit: z.number().int().min(1).max(20).default(10),
        language: z.string().optional()
      })
    },
    async ({ org, repo, query, limit, language }) => toTextResult(await searchCode(repo, query, limit, language, org))
  );

  server.registerTool(
    'github_file_summary',
    {
      title: 'GitHub File Summary',
      description: 'Return a compact bounded summary for a single file in an allowlisted repository.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        path: z.string().min(1),
        branch: z.string().optional(),
        context_lines: z.number().int().min(1).max(10).default(CONFIG.github.summaryContextLines),
        focus_pattern: z.string().optional()
      })
    },
    async ({ org, repo, path, branch, context_lines, focus_pattern }) =>
      toTextResult(await fileSummary({ org, repo, path, branch, context_lines, focus_pattern }))
  );

  server.registerTool(
    'github_module_summary',
    {
      title: 'GitHub Module Summary',
      description: 'Return a compact bounded summary for a repository folder.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().optional(),
        path: z.string().min(1),
        branch: z.string().optional(),
        max_files: z.number().int().min(5).max(50).default(20),
        extensions: z.array(z.string().min(1)).optional()
      })
    },
    async ({ org, repo, path, branch, max_files, extensions }) =>
      toTextResult(await moduleSummary({ org, repo, path, branch, max_files, extensions }))
  );

  server.registerTool(
    'github_get_commit_history',
    {
      title: 'GitHub Commit History',
      description: 'List recent commits for a repository, optionally filtered by branch, path, or author.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().min(1),
        branch: z.string().optional(),
        path: z.string().optional(),
        author: z.string().optional(),
        page: z.number().int().min(1).max(100).default(1),
        per_page: z.number().int().min(1).max(100).default(10)
      })
    },
    async ({ org, repo, branch, path, author, page, per_page }) =>
      toTextResult(await getCommitHistory(repo, branch, path, author, page, per_page, org))
  );

  server.registerTool(
    'github_get_file_history',
    {
      title: 'GitHub File History',
      description: 'List commit history for a single file to show who changed it over time.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().min(1),
        path: z.string().min(1),
        branch: z.string().optional(),
        page: z.number().int().min(1).max(100).default(1),
        per_page: z.number().int().min(1).max(100).default(10)
      })
    },
    async ({ org, repo, path, branch, page, per_page }) =>
      toTextResult(await getFileHistory(repo, path, branch, page, per_page, org))
  );

  server.registerTool(
    'github_compare_refs',
    {
      title: 'GitHub Compare Refs',
      description: 'Compare two branches, tags, or commits and return a compact diff summary.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().min(1),
        base: z.string().min(1),
        head: z.string().min(1),
        max_files: z.number().int().min(1).max(50).default(20)
      })
    },
    async ({ org, repo, base, head, max_files }) => toTextResult(await compareRefs(repo, base, head, max_files, undefined, org))
  );

  server.registerTool(
    'github_get_pull_request_comments',
    {
      title: 'GitHub Pull Request Comments',
      description: 'Return issue comments, review comments, and review submissions for a pull request.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: z.object({
        org: z.string().optional(),
        repo: z.string().min(1),
        pull_number: z.number().int().min(1)
      })
    },
    async ({ org, repo, pull_number }) => toTextResult(await getPullRequestComments(repo, pull_number, org))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES)
      })
    },
    async ({ db, connection }: any) => toTextResult(await getDatabaseInfo(db, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        query: z.string().min(1)
      })
    },
    async ({ db, query, connection }: any) => toTextResult(await runQuery(db, query, undefined, connection))
  );

  server.registerTool(
    'db_execute_read_query',
    {
      title: 'Execute Read Query',
      description: 'Execute a strictly validated SELECT-only query with a hard result cap.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        query: z.string().min(1)
      })
    },
    async ({ db, query, connection }: any) => toTextResult(await executeReadQuery(db, query, undefined, connection))
  );

  server.registerTool(
    'db_execute_stored_procedure',
    {
      title: 'Execute Stored Procedure',
      description: 'Execute an allowlisted stored procedure and return any rows it produces.',
      annotations: {
        readOnlyHint: false,
        destructiveHint: true,
        idempotentHint: false,
        openWorldHint: true
      },
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        procedure: z.string().min(1),
        schema: z.string().optional(),
        params: z.array(z.unknown()).default([])
      })
    },
    async ({ db, procedure, schema, params, connection }: any) =>
      toTextResult(await executeStoredProcedure({ db, procedure, schema, params, connection }, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        schema: z.string().optional()
      })
    },
    async ({ db, schema, connection }: any) => toTextResult(await listTables(db, schema, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        query: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, query, schema, connection }: any) => toTextResult(await searchTables(db, query, schema, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        query: z.string().min(1),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(20).default(10)
      })
    },
    async ({ db, query, schema, limit, connection }: any) => toTextResult(await searchViews(db, query, schema, limit, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        query: z.string().min(1),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(20).default(10)
      })
    },
    async ({ db, query, schema, limit, connection }: any) => toTextResult(await searchFunctions(db, query, schema, limit, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        query: z.string().min(1),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(20).default(10)
      })
    },
    async ({ db, query, schema, limit, connection }: any) => toTextResult(await searchProcedures(db, query, schema, limit, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        query: z.string().min(1),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(20).default(10)
      })
    },
    async ({ db, query, schema, limit, connection }: any) => toTextResult(await searchColumns(db, query, schema, limit, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, table, schema, connection }: any) => toTextResult(await getTableSchema(db, table, schema, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, table, schema, connection }: any) => toTextResult(await getTableSummary(db, table, schema, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        view: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, view, schema, connection }: any) => toTextResult(await getViewDefinition(db, view, schema, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        view: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, view, schema, connection }: any) => toTextResult(await getViewSummary(db, view, schema, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        procedure: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, procedure, schema, connection }: any) => toTextResult(await getProcedureSummary(db, procedure, schema, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        func: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, func, schema, connection }: any) => toTextResult(await getFunctionSummary(db, func, schema, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().min(1),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(5).default(5)
      })
    },
    async ({ db, table, schema, limit, connection }: any) => toTextResult(await getSampleRows(db, table, schema, limit, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().min(1),
        schema: z.string().optional(),
        columns: z.array(z.string().min(1)).optional(),
        limit: z.number().int().min(1).max(5).default(5)
      })
    },
    async ({ db, table, schema, columns, limit, connection }: any) =>
      toTextResult(await getTableSampleByColumns(db, table, schema, columns, limit, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().min(1),
        schema: z.string().optional()
      })
    },
    async ({ db, table, schema, connection }: any) => toTextResult(await getRowCount(db, table, schema, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        query: z.string().min(1)
      })
    },
    async ({ db, query, connection }: any) => toTextResult(await explainQuery(db, query, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        left_table: z.string().min(1),
        right_table: z.string().min(1),
        left_schema: z.string().optional(),
        right_schema: z.string().optional()
      })
    },
    async ({ db, left_table, right_table, left_schema, right_schema, connection }: any) =>
      toTextResult(await compareSchema(db, left_table, right_table, left_schema, right_schema, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        object_type: z.enum(['table', 'view', 'procedure', 'function']),
        left_name: z.string().min(1),
        right_name: z.string().min(1),
        schema: z.string().optional(),
        left_schema: z.string().optional(),
        right_schema: z.string().optional()
      })
    },
    async ({ db, object_type, left_name, right_name, schema, left_schema, right_schema, connection }: any) =>
      toTextResult(await compareObjectVersions(db, object_type, left_name, right_name, schema, left_schema, right_schema, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().optional(),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(20).default(10)
      })
    },
    async ({ db, table, schema, limit, connection }: any) => toTextResult(await getDependencyGraph(db, table, schema, limit, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().min(1),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(5).default(5)
      })
    },
    async ({ db, table, schema, limit, connection }: any) => toTextResult(await getColumnStats(db, table, schema, limit, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().optional(),
        schema: z.string().optional()
      })
    },
    async ({ db, table, schema, connection }: any) => toTextResult(await getRelationships(db, table, schema, undefined, connection))
  );

  server.registerTool(
    'get_foreign_key_summary',
    {
      title: 'Get Foreign Key Summary',
      description: 'Return a compact summary of foreign-key relationships for a schema or table.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().optional(),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(5).default(5)
      })
    },
    async ({ db, table, schema, limit, connection }: any) =>
      toTextResult(await getForeignKeySummary(db, table, schema, limit, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        source_table: z.string().min(1),
        target_table: z.string().min(1),
        schema: z.string().optional(),
        limit: z.number().int().min(1).max(20).default(10)
      })
    },
    async ({ db, source_table, target_table, schema, limit, connection }: any) =>
      toTextResult(await getRelationPath(db, source_table, target_table, schema, limit, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().optional(),
        schema: z.string().optional()
      })
    },
    async ({ db, table, schema, connection }: any) => toTextResult(await getIndexes(db, table, schema, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        table: z.string().optional(),
        schema: z.string().optional()
      })
    },
    async ({ db, table, schema, connection }: any) => toTextResult(await getConstraints(db, table, schema, undefined, connection))
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
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES)
      })
    },
    async ({ db, connection }: any) => toTextResult(await listStoredProcedures(db, undefined, connection))
  );

  server.registerTool(
    'get_nl2sql_context',
    {
      title: 'Get NL2SQL Context',
      description: 'Return the schema context an agent needs to write SQL for a natural-language question: ranked relevant tables, their columns, foreign-key relationships, and dialect-specific SQL hints. No SQL is generated server-side.',
      annotations: {
        readOnlyHint: true,
        destructiveHint: false,
        idempotentHint: true,
        openWorldHint: true
      },
      inputSchema: passthroughObject({
        db: z.enum(SUPPORTED_DATABASES),
        question: z.string().min(1),
        schema: z.string().optional(),
        max_tables: z.number().int().min(1).max(10).default(5)
      })
    },
    async ({ db, question, schema, max_tables, connection }: any) =>
      toTextResult(await getNl2sqlContext(db, question, schema, max_tables, undefined, connection))
  );

  return server;
}
