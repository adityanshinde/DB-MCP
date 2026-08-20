export type ConnectionServerMap = Record<string, Record<string, string>>;

export function flattenConnectionTree(node: unknown, prefix = ''): Record<string, string> {
  if (typeof node === 'string') {
    const url = node.trim();
    return prefix && url ? { [prefix]: url } : {};
  }

  if (!node || typeof node !== 'object' || Array.isArray(node)) {
    return {};
  }

  const connections: Record<string, string> = {};

  for (const [rawKey, value] of Object.entries(node as Record<string, unknown>)) {
    const key = rawKey.trim();
    if (!key) {
      continue;
    }

    const path = prefix ? `${prefix}.${key}` : key;
    Object.assign(connections, flattenConnectionTree(value, path));
  }

  return connections;
}

export function groupServersFromConnections(connections: Record<string, string>): ConnectionServerMap {
  const servers: ConnectionServerMap = {};

  for (const [name, url] of Object.entries(connections)) {
    const { server, database } = splitConnectionAlias(name);
    if (!server) {
      continue;
    }

    servers[server] ??= {};
    servers[server][database] = url;
  }

  return servers;
}

export function splitConnectionAlias(name: string): { server?: string; database: string } {
  const trimmed = name.trim();
  const lastDot = trimmed.lastIndexOf('.');
  if (lastDot <= 0) {
    return { database: trimmed };
  }

  return {
    server: trimmed.slice(0, lastDot),
    database: trimmed.slice(lastDot + 1)
  };
}

export function parseConnectionJson(value: string | undefined): {
  connections: Record<string, string>;
  servers: ConnectionServerMap;
} {
  if (!value?.trim()) {
    return { connections: {}, servers: {} };
  }

  try {
    const connections = flattenConnectionTree(JSON.parse(value));
    return {
      connections,
      servers: groupServersFromConnections(connections)
    };
  } catch {
    return { connections: {}, servers: {} };
  }
}

export function resolveNamedDefault(connections: Record<string, string>, explicit?: string): string {
  const trimmed = explicit?.trim();
  if (trimmed && connections[trimmed]) {
    return trimmed;
  }

  return Object.keys(connections)[0] || 'default';
}
