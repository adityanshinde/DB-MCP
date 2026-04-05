import { queryMSSQL } from '@/lib/db/mssql';
import { queryPostgres } from '@/lib/db/postgres';
import { queryMySQL } from '@/lib/db/mysql';
import type { DBType, ToolResponse, DatabaseCredentials } from '@/lib/types';

type StoredProcedureRow = {
  schema?: string;
  name?: string;
  routine_schema?: string;
  routine_name?: string;
  SPECIFIC_SCHEMA?: string;
  SPECIFIC_NAME?: string;
};

export async function listStoredProcedures(
  db: DBType,
  credentials?: DatabaseCredentials
): Promise<ToolResponse<{ procedures: { schema: string; name: string }[] }>> {
  try {
    if (db === 'postgres') {
      const result = await queryPostgres<StoredProcedureRow>(
        `
          SELECT routine_schema AS schema,
                 routine_name  AS name
          FROM information_schema.routines
          WHERE routine_type = 'PROCEDURE'
          ORDER BY routine_schema, routine_name
        `,
        [],
        credentials?.postgres
      );

      return {
        success: true,
        data: {
          procedures: result.rows.map((row) => ({
            schema: row.schema ?? row.routine_schema ?? 'public',
            name: row.name ?? row.routine_name ?? ''
          }))
        },
        error: null
      };
    } else if (db === 'mssql') {
      const result = await queryMSSQL(
        `
          SELECT SPECIFIC_SCHEMA,
                 SPECIFIC_NAME
          FROM INFORMATION_SCHEMA.ROUTINES
          WHERE ROUTINE_TYPE = 'PROCEDURE'
          ORDER BY SPECIFIC_SCHEMA, SPECIFIC_NAME
        `,
        {},
        credentials?.mssql
      );

      const rows = result.rows as StoredProcedureRow[];

      return {
        success: true,
        data: {
          procedures: rows.map((row) => ({
            schema: String(row.SPECIFIC_SCHEMA ?? row.schema ?? ''),
            name: String(row.SPECIFIC_NAME ?? row.name ?? '')
          }))
        },
        error: null
      };
    } else if (db === 'mysql') {
    const query = `
      SELECT ROUTINE_SCHEMA,
             ROUTINE_NAME
      FROM INFORMATION_SCHEMA.ROUTINES
      WHERE ROUTINE_TYPE = 'PROCEDURE'
      ORDER BY ROUTINE_SCHEMA, ROUTINE_NAME
    `;
    
    const result = (await queryMySQL(query, credentials)) as Array<{ ROUTINE_SCHEMA: string; ROUTINE_NAME: string }>;

    return {
      success: true,
      data: {
        procedures: result.map((row) => ({
          schema: String(row.ROUTINE_SCHEMA ?? ''),
          name: String(row.ROUTINE_NAME ?? '')
        }))
      },
      error: null
    };
  } else if (db === 'sqlite') {
    // SQLite doesn't have traditional stored procedures
    return {
      success: true,
      data: { procedures: [] },
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
      error: error instanceof Error ? error.message : 'Failed to list stored procedures.'
    };
  }
}

