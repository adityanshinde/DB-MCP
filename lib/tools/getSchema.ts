import { CONFIG } from '@/lib/config';
import { queryMSSQL } from '@/lib/db/mssql';
import { queryPostgres } from '@/lib/db/postgres';
import { getSchemaMySQL } from '@/lib/db/mysql';
import { getSchemaSQLite } from '@/lib/db/sqlite';
import type { DBType, ToolResponse, DatabaseCredentials } from '@/lib/types';

function resolveSchema(db: DBType, schema?: string): string {
  const fallback = db === 'postgres' ? 'public' : 'dbo';
  const resolved = (schema || fallback).trim();

  if (!CONFIG.app.allowedSchemas.includes(resolved)) {
    throw new Error(`Schema ${resolved} is not allowed. Allowed schemas: ${CONFIG.app.allowedSchemas.join(', ')}.`);
  }

  return resolved;
}

export async function getTableSchema(
  db: DBType,
  table: string,
  schema?: string,
  credentials?: DatabaseCredentials
): Promise<ToolResponse<{ table: string; schema: string; columns: Array<Record<string, unknown>> }>> {
  try {
    const resolvedSchema = resolveSchema(db, schema);

    if (db === 'postgres') {
      const result = await queryPostgres(
        `SELECT column_name, data_type, is_nullable, column_default, ordinal_position
         FROM information_schema.columns
         WHERE table_name = $1 AND table_schema = $2
         ORDER BY ordinal_position`,
        [table, resolvedSchema],
        credentials?.postgres
      );

      return {
        success: true,
        data: {
          table,
          schema: resolvedSchema,
          columns: result.rows
        },
        error: null
      };
    } else if (db === 'mssql') {
      const result = await queryMSSQL(
        `SELECT column_name, data_type, is_nullable, ordinal_position
         FROM information_schema.columns
         WHERE table_name = @tableName AND table_schema = @schemaName
         ORDER BY ordinal_position`,
        {
          tableName: table,
          schemaName: resolvedSchema
        },
        credentials?.mssql
      );

      return {
        success: true,
        data: {
          table,
          schema: resolvedSchema,
          columns: result.rows
        },
        error: null
      };
    } else if (db === 'mysql') {
    const columns = await getSchemaMySQL(table, credentials);
    return {
      success: true,
      data: {
        table,
        schema: 'default',
        columns: columns as Array<Record<string, unknown>>
      },
      error: null
    };
    } else if (db === 'sqlite') {
      const columns = await getSchemaSQLite(table, credentials);
      return {
        success: true,
        data: {
          table,
          schema: 'default',
          columns: columns as Array<Record<string, unknown>>
        },
        error: null
      };
    }

    return {
      success: false,
      data: null,
      error: 'Unsupported database type'
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to read table schema.'
    };
  }
}
