import { Pool, type QueryResultRow } from 'pg';

import { CONFIG } from '@/lib/config';

let pool: Pool | null = null;

function getPool(): Pool {
  if (!CONFIG.postgres.url) {
    throw new Error('POSTGRES_URL is not configured.');
  }

  if (!pool) {
    pool = new Pool({
      connectionString: CONFIG.postgres.url,
      max: 10,
      idleTimeoutMillis: 30_000,
      allowExitOnIdle: true
    });
  }

  return pool;
}

export async function queryPostgres<T extends QueryResultRow = QueryResultRow>(sql: string, params: unknown[] = []) {
  try {
    const result = await getPool().query<T>(sql, params);
    return {
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
      fields: result.fields.map((field: { name: string }) => field.name)
    };
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to execute PostgreSQL query.');
  }
}
