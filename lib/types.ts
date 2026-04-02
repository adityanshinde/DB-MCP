export type DBType = 'postgres' | 'mssql';

export type ToolName = 'run_query' | 'list_tables' | 'get_table_schema' | 'get_relationships';

export type RunQueryInput = {
  db: DBType;
  query: string;
};

export type ListTablesInput = {
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

export type ToolInputMap = {
  run_query: RunQueryInput;
  list_tables: ListTablesInput;
  get_table_schema: GetTableSchemaInput;
  get_relationships: GetRelationshipsInput;
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
