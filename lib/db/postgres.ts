import { Pool, type QueryResultRow } from 'pg';

import { CONFIG } from '@/lib/config';
import type { DatabaseCredentials } from '@/lib/types';

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

function getDynamicPool(credentials: DatabaseCredentials['postgres']): Pool {
  if (!credentials) {
    throw new Error('PostgreSQL credentials not provided.');
  }

  const connectionString = `postgresql://${encodeURIComponent(credentials.username)}:${encodeURIComponent(credentials.password)}@${credentials.host}:${credentials.port}/${credentials.database}`;

  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true
  });
}

export async function queryPostgres<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  credentials?: DatabaseCredentials['postgres']
) {
  try {
    const currentPool = credentials ? getDynamicPool(credentials) : getPool();
    const result = await currentPool.query<T>(sql, params);

    if (credentials) {
      await currentPool.end();
    }

    return {
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
      fields: result.fields.map((field: { name: string }) => field.name)
    };
  } catch (error) {
    throw error instanceof Error ? error : new Error('Failed to execute PostgreSQL query.');
  }
}
