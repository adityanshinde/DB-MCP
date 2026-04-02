import sql from 'mssql';

import { CONFIG } from '@/lib/config';

let poolPromise: Promise<sql.ConnectionPool> | null = null;

function getPool(): Promise<sql.ConnectionPool> {
  if (!CONFIG.mssql.user || !CONFIG.mssql.password || !CONFIG.mssql.server || !CONFIG.mssql.database) {
    throw new Error('MSSQL credentials are not fully configured.');
  }

  if (!poolPromise) {
    poolPromise = new sql.ConnectionPool({
      user: CONFIG.mssql.user,
      password: CONFIG.mssql.password,
      server: CONFIG.mssql.server,
      database: CONFIG.mssql.database,
      options: CONFIG.mssql.options,
      pool: {
        max: 10,
        min: 0,
        idleTimeoutMillis: 30_000
      }
    }).connect();
  }

  return poolPromise as Promise<sql.ConnectionPool>;
}

export async function queryMSSQL(sqlText: string, params: Record<string, unknown> = {}) {
  try {
    const pool = await getPool();
    const request = pool.request();

    for (const [name, value] of Object.entries(params)) {
      request.input(name, value as never);
    }

    const result = await request.query(sqlText);
    return {
      rows: result.recordset,
      rowCount: result.rowsAffected?.[0] ?? result.recordset.length,
      columns: Object.keys(result.recordset[0] ?? {})
    };
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to execute MSSQL query.');
  }
}
