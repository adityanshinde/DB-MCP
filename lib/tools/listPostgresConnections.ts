import { CONFIG } from '@/lib/config';
import type { ToolResponse } from '@/lib/types';

export async function listPostgresConnections(): Promise<ToolResponse<{ default_connection: string; connections: Array<{ name: string; is_default: boolean; has_url: boolean }>; total: number }>> {
  const connections = Object.entries(CONFIG.postgres.connections).map(([name, url]) => ({
    name,
    is_default: name === CONFIG.postgres.defaultConnection,
    has_url: Boolean(url)
  }));

  return {
    success: true,
    data: {
      default_connection: CONFIG.postgres.defaultConnection,
      connections,
      total: connections.length
    },
    error: null
  };
}