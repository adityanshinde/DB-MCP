import { queryMSSQL } from '@/lib/db/mssql';
import { queryPostgres } from '@/lib/db/postgres';
import type { DBType, ToolResponse, DatabaseCredentials } from '@/lib/types';

export async function listTables(db: DBType, credentials?: DatabaseCredentials): Promise<ToolResponse<{ tables: string[] }>> {
  try {
    if (db === 'postgres') {
      const result = await queryPostgres<{ tablename: string }>(
        "SELECT tablename FROM pg_catalog.pg_tables WHERE schemaname = 'public' ORDER BY tablename",
        [],
        credentials?.postgres
      );

      return {
        success: true,
        data: { tables: result.rows.map((row: { tablename: string }) => row.tablename) },
        error: null
      };
    }

    const result = await queryMSSQL(
      "SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_TYPE = 'BASE TABLE' ORDER BY TABLE_NAME",
      {},
      credentials?.mssql
    );

    const rows = result.rows as Array<{ TABLE_NAME: string }>;

    return {
      success: true,
      data: { tables: rows.map((row) => String(row.TABLE_NAME)) },
      error: null
    };
  } catch (error) {
    return {
      success: false,
      data: null,
      error: error instanceof Error ? error.message : 'Failed to list tables.'
    };
  }
}
