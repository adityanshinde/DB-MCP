import { CONFIG } from '@/lib/config';
import { queryMSSQL } from '@/lib/db/mssql';
import { queryPostgres } from '@/lib/db/postgres';
import type { DBType, ToolResponse } from '@/lib/types';

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
  schema?: string
): Promise<ToolResponse<{ table: string; schema: string; columns: Array<Record<string, unknown>> }>> {
  try {
    const resolvedSchema = resolveSchema(db, schema);

    if (db === 'postgres') {
      const result = await queryPostgres(
        `SELECT column_name, data_type, is_nullable, column_default, ordinal_position
         FROM information_schema.columns
         WHERE table_name = $1 AND table_schema = $2
         ORDER BY ordinal_position`,
        [table, resolvedSchema]
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
    }

    const result = await queryMSSQL(
      `SELECT column_name, data_type, is_nullable, ordinal_position
       FROM information_schema.columns
       WHERE table_name = @tableName AND table_schema = @schemaName
       ORDER BY ordinal_position`,
      {
        tableName: table,
        schemaName: resolvedSchema
      }
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
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to read table schema.'
    };
  }
}
