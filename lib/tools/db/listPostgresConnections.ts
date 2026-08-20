import { CONFIG } from '@/lib/config';
import { queryPostgres } from '@/lib/db/postgres';
import { splitConnectionAlias } from '@/lib/runtime/parseConnections';
import type { ToolResponse } from '@/lib/types';

type PostgresConnectionSummary = {
  name: string;
  is_default: boolean;
  has_url: boolean;
  server?: string;
  database?: string;
  schemas?: string[];
  schema_error?: string;
};

type PostgresServerSummary = {
  name: string;
  databases: Array<{
    name: string;
    connection: string;
    is_default: boolean;
    has_url: boolean;
  }>;
};

const SCHEMA_LIST_QUERY = `SELECT schema_name
   FROM information_schema.schemata
   WHERE schema_name NOT IN ('information_schema', 'pg_catalog')
     AND schema_name !~ '^pg_'
   ORDER BY schema_name`;

async function fetchConnectionSchemas(connection: string): Promise<Pick<PostgresConnectionSummary, 'schemas' | 'schema_error'>> {
  try {
    const result = await queryPostgres<{ schema_name: string }>(SCHEMA_LIST_QUERY, [], undefined, connection);
    return { schemas: result.rows.map((row) => row.schema_name) };
  } catch (error) {
    return { schema_error: error instanceof Error ? error.message : 'Failed to list schemas.' };
  }
}

export async function listPostgresConnections(): Promise<ToolResponse<{ default_connection: string; connections: PostgresConnectionSummary[]; servers?: PostgresServerSummary[]; total: number }>> {
  const hasServers = Object.keys(CONFIG.postgres.servers ?? {}).length > 0;

  const connections = await Promise.all(
    Object.entries(CONFIG.postgres.connections).map(async ([name, url]) => {
      const entry: PostgresConnectionSummary = {
        name,
        is_default: name === CONFIG.postgres.defaultConnection,
        has_url: Boolean(url)
      };

      if (hasServers) {
        const { server, database } = splitConnectionAlias(name);
        if (server) {
          entry.server = server;
          entry.database = database;
        }
      }

      if (entry.has_url) {
        Object.assign(entry, await fetchConnectionSchemas(name));
      }

      return entry;
    })
  );

  const servers = hasServers
    ? Object.entries(CONFIG.postgres.servers).map(([serverName, databases]) => ({
        name: serverName,
        databases: Object.entries(databases).map(([databaseName, url]) => {
          const connectionName = `${serverName}.${databaseName}`;
          return {
            name: databaseName,
            connection: connectionName,
            is_default: connectionName === CONFIG.postgres.defaultConnection,
            has_url: Boolean(url)
          };
        })
      }))
    : undefined;

  return {
    success: true,
    data: {
      default_connection: CONFIG.postgres.defaultConnection,
      connections,
      servers,
      total: connections.length
    },
    error: null
  };
}
