import { Pool, type PoolClient, type QueryConfig, type QueryResultRow } from 'pg';

import { resolveActiveCredentials } from '@/lib/auth/credentials';
import { CONFIG } from '@/lib/config';
import type { DatabaseCredentials } from '@/lib/types';

const pools = new Map<string, Pool>();

function logPostgresEvent(message: string, error?: unknown): void {
  if (error) {
    console.error(`[postgres] ${message}`, error);
    return;
  }

  console.info(`[postgres] ${message}`);
}

function normalizeConnectionName(connection?: string): string {
  return connection?.trim() || CONFIG.postgres.defaultConnection || 'default';
}

function ensureSslModeRequired(connectionString: string): string {
  const trimmed = connectionString.trim();
  if (!trimmed) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    if (url.searchParams.get('sslmode') !== 'require') {
      url.searchParams.set('sslmode', 'require');
    }
    return url.toString();
  } catch {
    return trimmed.includes('sslmode=require')
      ? trimmed
      : `${trimmed}${trimmed.includes('?') ? '&' : '?'}sslmode=require`;
  }
}

function getConfiguredConnectionString(connection?: string): string {
  const connectionName = normalizeConnectionName(connection);
  const url = CONFIG.postgres.connections[connectionName] || (connectionName === 'default' ? CONFIG.postgres.url : '');

  if (!url) {
    const availableConnections = Object.keys(CONFIG.postgres.connections);
    throw new Error(
      availableConnections.length > 0
        ? `Unknown Postgres connection "${connectionName}". Available connections: ${availableConnections.join(', ')}.`
        : 'POSTGRES_URLS or POSTGRES_URL is not configured.'
    );
  }

  return ensureSslModeRequired(url);
}

function getPool(connection?: string): Pool {
  const connectionName = normalizeConnectionName(connection);
  const connectionString = getConfiguredConnectionString(connectionName);
  const existing = pools.get(connectionName);

  if (existing) {
    return existing;
  }

  const pool = new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 10,
    idleTimeoutMillis: 30_000,
    allowExitOnIdle: true,
    connectionTimeoutMillis: CONFIG.app.queryTimeoutMs
  });

  pool.on('error', (error) => {
    logPostgresEvent(`pool error; discarding static pool ${connectionName}`, error);
    pools.delete(connectionName);
  });

  pools.set(connectionName, pool);
  logPostgresEvent(`static pool created for ${connectionName}`);
  return pool;
}

function getDynamicPool(credentials: DatabaseCredentials['postgres']): Pool {
  if (!credentials) {
    throw new Error('PostgreSQL credentials not provided.');
  }

  const connectionString = ensureSslModeRequired(
    `postgresql://${encodeURIComponent(credentials.username)}:${encodeURIComponent(credentials.password)}@${credentials.host}:${credentials.port}/${credentials.database}`
  );

  return new Pool({
    connectionString,
    ssl: { rejectUnauthorized: false },
    max: 5,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
    connectionTimeoutMillis: CONFIG.app.queryTimeoutMs
  });
}

async function acquireClient(currentPool: Pool): Promise<PoolClient> {
  return currentPool.connect();
}

async function executeQuery<T extends QueryResultRow>(
  currentPool: Pool,
  sql: string,
  params: unknown[]
): Promise<{
  rows: T[];
  rowCount: number;
  fields: string[];
}> {
  const client = await acquireClient(currentPool);

  try {
    const result = await client.query<T>({
      text: sql,
      values: params,
      query_timeout: CONFIG.app.queryTimeoutMs
    } as QueryConfig<unknown[]>);

    return {
      rows: result.rows,
      rowCount: result.rowCount ?? result.rows.length,
      fields: result.fields.map((field: { name: string }) => field.name)
    };
  } finally {
    client.release();
  }
}

export async function queryPostgres<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  credentials?: DatabaseCredentials['postgres'],
  connection?: string
) {
  try {
    if (!credentials) {
      try {
        const staticPool = getPool(connection);
        return await executeQuery<T>(staticPool, sql, params);
      } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message !== 'POSTGRES_URLS or POSTGRES_URL is not configured.') {
          throw error;
        }
      }
    }

    const resolvedCredentials = credentials ?? resolveActiveCredentials('postgres', connection).postgres;
    const currentPool = getDynamicPool(resolvedCredentials);

    try {
      return await executeQuery<T>(currentPool, sql, params);
    } finally {
      try {
        await currentPool.end();
        logPostgresEvent('dynamic pool closed');
      } catch (error) {
        logPostgresEvent('failed to close dynamic pool', error);
      }
    }
  } catch (error) {
    const normalizedError = error instanceof Error ? error : new Error('Failed to execute PostgreSQL query.');
    logPostgresEvent('query failed', normalizedError);
    throw normalizedError;
  }
}
