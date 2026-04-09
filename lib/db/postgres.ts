import { Pool, type PoolClient, type QueryConfig, type QueryResultRow } from 'pg';

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

  return url;
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

  const connectionString = `postgresql://${encodeURIComponent(credentials.username)}:${encodeURIComponent(credentials.password)}@${credentials.host}:${credentials.port}/${credentials.database}`;

  return new Pool({
    connectionString,
    max: 5,
    idleTimeoutMillis: 5_000,
    allowExitOnIdle: true,
    connectionTimeoutMillis: CONFIG.app.queryTimeoutMs
  });
}

async function acquireClient(currentPool: Pool): Promise<PoolClient> {
  return currentPool.connect();
}

export async function queryPostgres<T extends QueryResultRow = QueryResultRow>(
  sql: string,
  params: unknown[] = [],
  credentials?: DatabaseCredentials['postgres'],
  connection?: string
) {
  const isDynamic = Boolean(credentials);
  const currentPool = credentials ? getDynamicPool(credentials) : getPool(connection);
  let client: PoolClient | null = null;
  let releaseError: Error | undefined;

  try {
    client = await acquireClient(currentPool);

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
  } catch (error) {
    releaseError = error instanceof Error ? error : new Error('Failed to execute PostgreSQL query.');
    logPostgresEvent('query failed', releaseError);
    throw releaseError;
  } finally {
    if (client) {
      client.release(releaseError);
    }

    if (isDynamic) {
      try {
        await currentPool.end();
        logPostgresEvent('dynamic pool closed');
      } catch (error) {
        logPostgresEvent('failed to close dynamic pool', error);
      }
    }
  }
}
