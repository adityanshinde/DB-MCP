export type DBType = 'postgres' | 'mssql' | 'mysql' | 'sqlite';

export type ToolName =
  | 'list_schemas'
  | 'get_database_info'
  | 'run_query'
  | 'db_execute_read_query'
  | 'github_list_org_repos'
  | 'github_get_repo_tree'
  | 'github_get_file_content'
  | 'github_search_code'
  | 'github_file_summary'
  | 'github_module_summary'
  | 'github_get_commit_history'
  | 'github_get_file_history'
  | 'github_compare_refs'
  | 'github_get_pull_request_comments'
  | 'list_tables'
  | 'search_tables'
  | 'search_columns'
  | 'get_table_schema'
  | 'get_table_summary'
  | 'get_view_definition'
  | 'get_view_summary'
  | 'get_procedure_summary'
  | 'get_function_summary'
  | 'get_sample_rows'
  | 'explain_query'
  | 'compare_schema'
  | 'get_column_stats'
  | 'search_views'
  | 'get_row_count'
  | 'get_foreign_key_summary'
  | 'search_functions'
  | 'search_procedures'
  | 'get_table_sample_by_columns'
  | 'get_dependency_graph'
  | 'compare_object_versions'
  | 'get_relation_path'
  | 'get_relationships'
  | 'get_indexes'
  | 'get_constraints'
  | 'list_stored_procedures';

export type RunQueryInput = {
  db: DBType;
  query: string;
} & PostgresConnectionInput;

export type ExecuteReadQueryInput = RunQueryInput;

export type PostgresConnectionInput = {
  connection?: string;
};

export type GitHubListOrgReposInput = {
  org?: string;
  page?: number;
  per_page?: number;
  filter?: 'all' | 'public' | 'private' | 'forks' | 'sources' | 'member';
  sort?: 'created' | 'updated' | 'pushed' | 'full_name';
  direction?: 'asc' | 'desc';
};

export type GitHubRepoTreeInput = {
  org?: string;
  repo: string;
  path?: string;
  branch?: string;
  depth?: number;
};

export type GitHubFileContentInput = {
  org?: string;
  repo: string;
  path: string;
  branch?: string;
};

export type GitHubSearchCodeInput = {
  org?: string;
  repo: string;
  query: string;
  limit?: number;
  language?: string;
};

export type GitHubFileSummaryInput = {
  org?: string;
  repo: string;
  path: string;
  branch?: string;
  context_lines?: number;
  focus_pattern?: string;
};

export type GitHubModuleSummaryInput = {
  org?: string;
  repo: string;
  path: string;
  branch?: string;
  max_files?: number;
  extensions?: string[];
};

export type GitHubCommitHistoryInput = {
  org?: string;
  repo: string;
  branch?: string;
  path?: string;
  author?: string;
  page?: number;
  per_page?: number;
};

export type GitHubFileHistoryInput = {
  org?: string;
  repo: string;
  path: string;
  branch?: string;
  page?: number;
  per_page?: number;
};

export type GitHubCompareRefsInput = {
  org?: string;
  repo: string;
  base: string;
  head: string;
  max_files?: number;
};

export type GitHubPullRequestCommentsInput = {
  org?: string;
  repo: string;
  pull_number: number;
};

export type ListTablesInput = {
  db: DBType;
} & PostgresConnectionInput;

export type ListSchemasInput = {
  db: DBType;
} & PostgresConnectionInput;

export type GetDatabaseInfoInput = {
  db: DBType;
} & PostgresConnectionInput;

export type SearchTablesInput = {
  db: DBType;
  query: string;
  schema?: string;
} & PostgresConnectionInput;

export type SearchColumnsInput = {
  db: DBType;
  query: string;
  schema?: string;
  limit?: number;
} & PostgresConnectionInput;

export type GetTableSummaryInput = {
  db: DBType;
  table: string;
  schema?: string;
} & PostgresConnectionInput;

export type GetViewSummaryInput = {
  db: DBType;
  view: string;
  schema?: string;
} & PostgresConnectionInput;

export type GetViewDefinitionInput = {
  db: DBType;
  view: string;
  schema?: string;
} & PostgresConnectionInput;

export type GetProcedureSummaryInput = {
  db: DBType;
  procedure: string;
  schema?: string;
} & PostgresConnectionInput;

export type GetFunctionSummaryInput = {
  db: DBType;
  func: string;
  schema?: string;
} & PostgresConnectionInput;

export type GetSampleRowsInput = {
  db: DBType;
  table: string;
  schema?: string;
  limit?: number;
} & PostgresConnectionInput;

export type ExplainQueryInput = {
  db: DBType;
  query: string;
} & PostgresConnectionInput;

export type CompareSchemaInput = {
  db: DBType;
  left_table: string;
  right_table: string;
  left_schema?: string;
  right_schema?: string;
} & PostgresConnectionInput;

export type GetColumnStatsInput = {
  db: DBType;
  table: string;
  schema?: string;
  limit?: number;
} & PostgresConnectionInput;

export type SearchViewsInput = {
  db: DBType;
  query: string;
  schema?: string;
  limit?: number;
} & PostgresConnectionInput;

export type GetRowCountInput = {
  db: DBType;
  table: string;
  schema?: string;
} & PostgresConnectionInput;

export type GetForeignKeySummaryInput = {
  db: DBType;
  table?: string;
  schema?: string;
  limit?: number;
} & PostgresConnectionInput;

export type SearchFunctionsInput = {
  db: DBType;
  query: string;
  schema?: string;
  limit?: number;
} & PostgresConnectionInput;

export type SearchProceduresInput = {
  db: DBType;
  query: string;
  schema?: string;
  limit?: number;
} & PostgresConnectionInput;

export type GetTableSampleByColumnsInput = {
  db: DBType;
  table: string;
  schema?: string;
  columns?: string[];
  limit?: number;
} & PostgresConnectionInput;

export type GetDependencyGraphInput = {
  db: DBType;
  table?: string;
  schema?: string;
  limit?: number;
} & PostgresConnectionInput;

export type CompareObjectVersionsInput = {
  db: DBType;
  object_type: 'table' | 'view' | 'procedure' | 'function';
  left_name: string;
  right_name: string;
  schema?: string;
  left_schema?: string;
  right_schema?: string;
} & PostgresConnectionInput;

export type GetRelationPathInput = {
  db: DBType;
  source_table: string;
  target_table: string;
  schema?: string;
  limit?: number;
} & PostgresConnectionInput;

export type GetIndexesInput = {
  db: DBType;
  table?: string;
  schema?: string;
} & PostgresConnectionInput;

export type GetConstraintsInput = {
  db: DBType;
  table?: string;
  schema?: string;
} & PostgresConnectionInput;

export type ListStoredProceduresInput = {
  db: DBType;
} & PostgresConnectionInput;

export type GetTableSchemaInput = {
  db: DBType;
  table: string;
  schema?: string;
} & PostgresConnectionInput;

export type GetRelationshipsInput = {
  db: DBType;
  table?: string;
  schema?: string;
} & PostgresConnectionInput;

export type DatabaseCredentials = {
  type: DBType;
  postgres?: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  mssql?: {
    server: string;
    username: string;
    password: string;
    database: string;
    port?: number;
  };
  mysql?: {
    host: string;
    port: number;
    username: string;
    password: string;
    database: string;
  };
  sqlite?: {
    filePath: string;
  };
};

export type ToolInputMap = {
  list_schemas: ListSchemasInput;
  get_database_info: GetDatabaseInfoInput;
  run_query: RunQueryInput;
  'db_execute_read_query': ExecuteReadQueryInput;
  'github_list_org_repos': GitHubListOrgReposInput;
  'github_get_repo_tree': GitHubRepoTreeInput;
  'github_get_file_content': GitHubFileContentInput;
  'github_search_code': GitHubSearchCodeInput;
  'github_file_summary': GitHubFileSummaryInput;
  'github_module_summary': GitHubModuleSummaryInput;
  'github_get_commit_history': GitHubCommitHistoryInput;
  'github_get_file_history': GitHubFileHistoryInput;
  'github_compare_refs': GitHubCompareRefsInput;
  'github_get_pull_request_comments': GitHubPullRequestCommentsInput;
  list_tables: ListTablesInput;
  search_tables: SearchTablesInput;
  search_columns: SearchColumnsInput;
  get_table_schema: GetTableSchemaInput;
  get_table_summary: GetTableSummaryInput;
  get_view_definition: GetViewDefinitionInput;
  get_view_summary: GetViewSummaryInput;
  get_procedure_summary: GetProcedureSummaryInput;
  get_function_summary: GetFunctionSummaryInput;
  get_sample_rows: GetSampleRowsInput;
  explain_query: ExplainQueryInput;
  compare_schema: CompareSchemaInput;
  get_column_stats: GetColumnStatsInput;
  search_views: SearchViewsInput;
  get_row_count: GetRowCountInput;
  get_foreign_key_summary: GetForeignKeySummaryInput;
  search_functions: SearchFunctionsInput;
  search_procedures: SearchProceduresInput;
  get_table_sample_by_columns: GetTableSampleByColumnsInput;
  get_dependency_graph: GetDependencyGraphInput;
  compare_object_versions: CompareObjectVersionsInput;
  get_relation_path: GetRelationPathInput;
  get_relationships: GetRelationshipsInput;
  get_indexes: GetIndexesInput;
  get_constraints: GetConstraintsInput;
  list_stored_procedures: ListStoredProceduresInput;
};

export type ToolRequestWithCredentials<TTool extends ToolName = ToolName> = {
  tool: TTool;
  input: ToolInputMap[TTool];
  credentials?: DatabaseCredentials;
};

export type ToolRequest<TTool extends ToolName = ToolName> = {
  tool: TTool;
  input: ToolInputMap[TTool];
};

export type ToolResponse<TData = unknown> = {
  success: boolean;
  data: TData | null;
  error: string | null;
};

export type QueryMetadata = {
  db: DBType;
  rows: number;
  columns: string[];
  query: string;
};
