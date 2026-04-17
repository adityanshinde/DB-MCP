import { buildCredentialProfileSummary, getCredentialContext } from '@/lib/auth/credentials';
import type { DBType, ToolResponse } from '@/lib/types';

type ConnectionSummary = {
  name: string;
  label?: string;
  type: DBType;
  is_default: boolean;
  expires_at: number;
  has_credentials: boolean;
};

type ListConnectionsResult = {
  source: 'token';
  default_connection: string | null;
  total: number;
  connections: ConnectionSummary[];
};

function filterPostgresConnections(connections: ConnectionSummary[]): ConnectionSummary[] {
  return connections.filter((connection) => connection.type === 'postgres');
}

export async function listConnections(): Promise<ToolResponse<ListConnectionsResult>> {
  const context = getCredentialContext();

  if (!context) {
    return {
      success: false,
      data: null,
      error: 'A valid credential token is required. Generate a fresh token from /api/credentials and retry.'
    };
  }

  const summary = buildCredentialProfileSummary(context.profile);
  return {
    success: true,
    data: {
      source: 'token',
      default_connection: summary.default_connection,
      total: summary.total,
      connections: summary.connections
    },
    error: null
  };
}

export async function listPostgresConnections(): Promise<ToolResponse<ListConnectionsResult>> {
  const response = await listConnections();
  if (!response.success || !response.data) {
    return response;
  }

  const connections = filterPostgresConnections(response.data.connections);
  return {
    success: true,
    data: {
      ...response.data,
      total: connections.length,
      connections,
      default_connection: connections.find((connection) => connection.is_default)?.name || connections[0]?.name || null
    },
    error: null
  };
}