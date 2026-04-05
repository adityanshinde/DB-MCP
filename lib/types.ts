export type DBType = 'postgres' | 'mssql' | 'mysql' | 'sqlite';

export type ToolName =
  | 'run_query'
  | 'list_tables'
  | 'get_table_schema'
  | 'get_relationships'
  | 'list_stored_procedures';

export type RunQueryInput = {
  db: DBType;
  query: string;
};

export type ListTablesInput = {
  db: DBType;
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
  run_query: RunQueryInput;
  list_tables: ListTablesInput;
  get_table_schema: GetTableSchemaInput;
  get_relationships: GetRelationshipsInput;
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
