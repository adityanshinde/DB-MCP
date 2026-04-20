import { CONFIG } from '@/lib/config';
import { queryMSSQL } from '@/lib/db/mssql';
import { queryMySQL } from '@/lib/db/mysql';
import { queryPostgres } from '@/lib/db/postgres';
import { logMcpError, logMcpEvent } from '@/lib/runtime/observability';
import type { DatabaseCredentials, ExecuteStoredProcedureInput, QueryMetadata, ToolResponse } from '@/lib/types';

type StoredProcedureResult = {
  metadata: QueryMetadata & {
    procedure: string;
    schema: string | null;
    params: unknown[];
  };
  rows: unknown[];
};

const SIMPLE_IDENTIFIER = /^[A-Za-z_][A-Za-z0-9_]*$/;

function validateIdentifier(value: string, label: string): string {
  const normalized = value.trim();

  if (!normalized) {
    throw new Error(`${label} is required.`);
  }

  if (!SIMPLE_IDENTIFIER.test(normalized)) {
    throw new Error(`${label} must use only letters, numbers, and underscores, with no spaces or punctuation.`);
  }

  return normalized;
}

function resolveSchema(db: ExecuteStoredProcedureInput['db'], schema?: string): string | null {
  if (db === 'sqlite') {
    throw new Error('Stored procedures are not supported for SQLite.');
  }

  if (db === 'mysql') {
    return schema ? validateIdentifier(schema, 'Schema') : null;
  }

  const resolvedSchema = validateIdentifier(schema?.trim() || (db === 'mssql' ? 'dbo' : 'public'), 'Schema');
  const allowedSchemas = new Set(CONFIG.app.allowedSchemas.map((entry) => entry.toLowerCase()));

  if (!allowedSchemas.has(resolvedSchema.toLowerCase())) {
    throw new Error(`Schema "${resolvedSchema}" is not allowlisted. Allowed schemas: ${Array.from(allowedSchemas).join(', ')}.`);
  }

  return resolvedSchema;
}

function buildMssqlCall(schema: string | null, procedure: string, params: unknown[]): { sql: string; paramMap: Record<string, unknown> } {
  const qualifiedName = schema ? `${schema}.${procedure}` : procedure;
  const paramNames = params.map((_, index) => `p${index + 1}`);
  const callArgs = paramNames.map((name) => `@${name}`).join(', ');

  return {
    sql: callArgs ? `EXEC ${qualifiedName} ${callArgs}` : `EXEC ${qualifiedName}`,
    paramMap: Object.fromEntries(paramNames.map((name, index) => [name, params[index]]))
  };
}

function buildPostgresCall(schema: string | null, procedure: string, params: unknown[]): string {
  const qualifiedName = schema ? `${schema}.${procedure}` : procedure;
  const placeholders = params.map((_, index) => `$${index + 1}`).join(', ');
  return `CALL ${qualifiedName}(${placeholders})`;
}

function buildMySqlCall(schema: string | null, procedure: string, params: unknown[]): string {
  const qualifiedName = schema ? `${schema}.${procedure}` : procedure;
  const placeholders = params.map(() => '?').join(', ');
  return `CALL ${qualifiedName}(${placeholders})`;
}

export async function executeStoredProcedure(
  input: ExecuteStoredProcedureInput,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<StoredProcedureResult>> {
  logMcpEvent('tool.execute.start', { tool: 'db_execute_stored_procedure', db: input.db });

  try {
    const procedure = validateIdentifier(input.procedure, 'Procedure');
    const schema = resolveSchema(input.db, input.schema);
    const params = Array.isArray(input.params) ? input.params : [];

    if (input.db === 'postgres') {
      const callSql = buildPostgresCall(schema, procedure, params);
      const result = await queryPostgres(callSql, params, credentials?.postgres, connection);

      return {
        success: true,
        data: {
          metadata: {
            db: input.db,
            rows: result.rowCount,
            columns: result.fields,
            query: callSql,
            procedure,
            schema,
            params
          },
          rows: result.rows
        },
        error: null
      };
    }

    if (input.db === 'mssql') {
      const { sql, paramMap } = buildMssqlCall(schema, procedure, params);
      const result = await queryMSSQL(sql, paramMap, credentials?.mssql, connection);

      return {
        success: true,
        data: {
          metadata: {
            db: input.db,
            rows: result.rowCount,
            columns: result.columns,
            query: sql,
            procedure,
            schema,
            params
          },
          rows: result.rows
        },
        error: null
      };
    }

    if (input.db === 'mysql') {
      const callSql = buildMySqlCall(schema, procedure, params);
      const rows = (await queryMySQL(callSql, credentials, params, connection)) as unknown;
      const rowArray = Array.isArray(rows) ? rows : [];

      return {
        success: true,
        data: {
          metadata: {
            db: input.db,
            rows: rowArray.length,
            columns: Object.keys((rowArray[0] as Record<string, unknown>) || {}),
            query: callSql,
            procedure,
            schema,
            params
          },
          rows: rowArray
        },
        error: null
      };
    }

    return {
      success: false,
      data: null,
      error: 'Stored procedures are not supported for SQLite.'
    };
  } catch (error) {
    logMcpError('tool.execute.failed', error, { tool: 'db_execute_stored_procedure', db: input.db });
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to execute stored procedure.'
    };
  }
}