export type DBType = 'postgres' | 'mssql' | 'mysql' | 'sqlite';

export type ToolName =
  | 'list_schemas'
  | 'get_database_info'
  | 'run_query'
  | 'list_tables'
  | 'search_tables'
  | 'get_table_schema'
  | 'get_view_definition'
  | 'get_relationships'
  | 'get_indexes'
  | 'get_constraints'
  | 'list_stored_procedures';

export type RunQueryInput = {
  db: DBType;
  query: string;
};

export type ListTablesInput = {
  db: DBType;
};

export type ListSchemasInput = {
  db: DBType;
};

export type GetDatabaseInfoInput = {
  db: DBType;
};

export type SearchTablesInput = {
  db: DBType;
  query: string;
  schema?: string;
};

export type GetIndexesInput = {
  db: DBType;
  table?: string;
  schema?: string;
};

export type GetViewDefinitionInput = {
  db: DBType;
  view: string;
  schema?: string;
};

export type GetConstraintsInput = {
  db: DBType;
  table?: string;
  schema?: string;
};

export type ListStoredProceduresInput = {
  db: DBType;
};

export type GetTableSchemaInput = {
  db: DBType;
  table: string;
  schema?: string;
};

export type GetRelationshipsInput = {
  db: DBType;
  table?: string;
  schema?: string;
};

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
  list_tables: ListTablesInput;
  search_tables: SearchTablesInput;
  get_table_schema: GetTableSchemaInput;
  get_view_definition: GetViewDefinitionInput;
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
