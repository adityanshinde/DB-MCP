import { queryMSSQL } from '@/lib/db/mssql';
import { queryMySQL } from '@/lib/db/mysql';
import { queryPostgres } from '@/lib/db/postgres';
import { querySQLite } from '@/lib/db/sqlite';
import { normalizeSchemaFilter, quoteIdentifier } from '@/lib/tools/db/toolUtils';
import type { DBType, ToolResponse, DatabaseCredentials } from '@/lib/types';

export async function listTables(
  db: DBType,
  schema?: string,
  credentials?: DatabaseCredentials,
  connection?: string
): Promise<ToolResponse<{ schema: string; tables: string[] }>> {
  try {
    const resolvedSchema = normalizeSchemaFilter(db, schema);

    if (db === 'postgres') {
      const result = await queryPostgres<{ tablename: string }>(
        'SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = $1 ORDER BY tablename',
        [resolvedSchema],
        credentials?.postgres,
        connection
      );

      return {
        success: true,
        data: { schema: resolvedSchema, tables: result.rows.map((row: { tablename: string }) => row.tablename) },
        error: null
      };
    }

    if (db === 'mssql') {
      const result = await queryMSSQL(
        `SELECT TABLE_NAME
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_TYPE = 'BASE TABLE'
           AND TABLE_SCHEMA = @schemaName
         ORDER BY TABLE_NAME`,
        { schemaName: resolvedSchema },
        credentials?.mssql,
        connection
      );

      const rows = result.rows as Array<{ TABLE_NAME: string }>;

      return {
        success: true,
        data: { schema: resolvedSchema, tables: rows.map((row) => String(row.TABLE_NAME)) },
        error: null
      };
    }

    if (db === 'mysql') {
      const rows = (await queryMySQL(
        `SELECT TABLE_NAME
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_TYPE = 'BASE TABLE'
           AND TABLE_SCHEMA = COALESCE(?, DATABASE())
         ORDER BY TABLE_NAME`,
        credentials,
        [schema?.trim() || null]
      )) as Array<{ TABLE_NAME: string }>;
      return {
        success: true,
        data: { schema: resolvedSchema, tables: rows.map((row) => String(row.TABLE_NAME)) },
        error: null
      };
    }

    if (db === 'sqlite') {
      const rows = (await querySQLite(
        `SELECT name
         FROM ${quoteIdentifier('sqlite', resolvedSchema)}.sqlite_master
         WHERE type = 'table'
           AND name NOT LIKE 'sqlite_%'
         ORDER BY name`,
        credentials
      )) as Array<{ name: string }>;
      return {
        success: true,
        data: { schema: resolvedSchema, tables: rows.map((row) => row.name) },
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
      error: error instanceof Error ? error.message : 'Failed to list tables.'
    };
  }
}
