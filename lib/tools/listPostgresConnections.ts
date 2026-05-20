import { CONFIG } from '@/lib/config';
import type { ToolResponse } from '@/lib/types';

type PostgresConnectionSummary = {
  name: string;
  is_default: boolean;
  has_url: boolean;
  server?: string;
  database?: string;
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

export async function listPostgresConnections(): Promise<ToolResponse<{ default_connection: string; connections: PostgresConnectionSummary[]; servers?: PostgresServerSummary[]; total: number }>> {
  const hasServers = Object.keys(CONFIG.postgres.servers ?? {}).length > 0;

  const connections = Object.entries(CONFIG.postgres.connections).map(([name, url]) => {
    const entry: PostgresConnectionSummary = {
      name,
      is_default: name === CONFIG.postgres.defaultConnection,
      has_url: Boolean(url)
    };

    if (hasServers) {
      const [serverName, database] = name.split('.', 2);
      if (serverName && database) {
        entry.server = serverName;
        entry.database = database;
      }
    }

    return entry;
  });

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