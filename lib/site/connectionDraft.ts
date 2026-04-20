import type { TokenConnectionInput } from '@/lib/credentials/tokenConnection';
import { normalizeMcpUsername } from '@/lib/mcpUsername';

export type DbType = 'postgres' | 'mssql' | 'mysql' | 'sqlite';

export type ConnectionDraft = {
  id: string;
  name: string;
  label: string;
  db: DbType;
  postgres: {
    url: string;
    host: string;
    port: string;
    username: string;
    password: string;
    database: string;
  };
  mssql: {
    connectionString: string;
    server: string;
    port: string;
    username: string;
    password: string;
    database: string;
  };
  mysql: {
    url: string;
    host: string;
    port: string;
    username: string;
    password: string;
    database: string;
  };
  sqlite: {
    filePath: string;
  };
  manualDbFieldsOpen?: boolean;
};

export type GitHubFormState = {
  orgName: string;
  allowedOrgs: string;
  allowedRepos: string;
  pat: string;
};

export const EMPTY_GITHUB_FORM: GitHubFormState = {
  orgName: '',
  allowedOrgs: '',
  allowedRepos: '',
  pat: ''
};

export const DEFAULT_CONNECTION: ConnectionDraft = {
  id: 'connection-main',
  name: 'main',
  label: 'Primary database',
  db: 'postgres',
  postgres: {
    url: '',
    host: 'localhost',
    port: '5432',
    username: 'postgres',
    password: '',
    database: 'appdb'
  },
  mssql: {
    connectionString: '',
    server: 'localhost',
    port: '1433',
    username: 'sa',
    password: '',
    database: 'master'
  },
  mysql: {
    url: '',
    host: 'localhost',
    port: '3306',
    username: 'root',
    password: '',
    database: 'appdb'
  },
  sqlite: {
    filePath: 'data/app.db'
  }
};

export function createConnectionId(): string {
  return globalThis.crypto?.randomUUID?.() || `connection-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function createConnectionRow(overrides: Partial<ConnectionDraft> = {}): ConnectionDraft {
  return {
    ...DEFAULT_CONNECTION,
    ...overrides,
    id: overrides.id || createConnectionId(),
    postgres: { ...DEFAULT_CONNECTION.postgres, ...overrides.postgres },
    mssql: { ...DEFAULT_CONNECTION.mssql, ...overrides.mssql },
    mysql: { ...DEFAULT_CONNECTION.mysql, ...overrides.mysql },
    sqlite: { ...DEFAULT_CONNECTION.sqlite, ...overrides.sqlite },
    manualDbFieldsOpen: overrides.manualDbFieldsOpen ?? false
  };
}

export function suggestWorkspaceHandles(normalizedBase: string): string[] {
  const base = normalizedBase.trim().toLowerCase();
  if (!base || base.length > 26) {
    return [];
  }

  const suffixes = ['_mcp', '_2', '_dev'];
  const out: string[] = [];

  for (const suf of suffixes) {
    const candidate = (base + suf).slice(0, 32);
    const ok = normalizeMcpUsername(candidate);
    if (ok && ok !== base) {
      out.push(ok);
    }
  }

  return [...new Set(out)].slice(0, 4);
}

export function buildFriendlyNameFromUrl(urlText: string): string {
  const trimmed = urlText.trim();
  if (!trimmed) {
    return '';
  }

  try {
    const parsed = new URL(trimmed);
    return parsed.pathname.replace(/^\//, '') || 'main';
  } catch {
    return 'main';
  }
}

export function parsePostgresUrl(urlText: string): Partial<ConnectionDraft['postgres']> {
  const trimmed = urlText.trim();
  if (!trimmed) {
    return {};
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'postgres:' && parsed.protocol !== 'postgresql:') {
    throw new Error('Postgres URL must start with postgres:// or postgresql://.');
  }

  if (parsed.searchParams.get('sslmode') !== 'require') {
    parsed.searchParams.set('sslmode', 'require');
  }

  const password = parsed.password ? decodeURIComponent(parsed.password) : '';
  const database = parsed.pathname.replace(/^\//, '');

  return {
    url: parsed.toString(),
    host: parsed.hostname,
    port: parsed.port || '5432',
    username: parsed.username ? decodeURIComponent(parsed.username) : '',
    password,
    database: database ? decodeURIComponent(database) : ''
  };
}

export function parseMysqlUrl(urlText: string): Partial<ConnectionDraft['mysql']> {
  const trimmed = urlText.trim();
  if (!trimmed) {
    return {};
  }

  const parsed = new URL(trimmed);
  if (parsed.protocol !== 'mysql:') {
    throw new Error('MySQL URL must start with mysql://.');
  }

  const password = parsed.password ? decodeURIComponent(parsed.password) : '';
  const database = parsed.pathname.replace(/^\//, '');

  return {
    host: parsed.hostname,
    port: parsed.port || '3306',
    username: parsed.username ? decodeURIComponent(parsed.username) : '',
    password,
    database: database ? decodeURIComponent(database) : ''
  };
}

export function parseMssqlConnectionString(text: string): Partial<ConnectionDraft['mssql']> | null {
  const trimmed = text.trim();
  if (!trimmed || trimmed.includes('://')) {
    return null;
  }

  const segments = trimmed.split(';').map((s) => s.trim()).filter(Boolean);
  const map: Record<string, string> = {};
  for (const seg of segments) {
    const eq = seg.indexOf('=');
    if (eq === -1) continue;
    const key = seg.slice(0, eq).trim().toLowerCase();
    map[key] = seg.slice(eq + 1).trim();
  }

  const serverRaw =
    map['server'] ||
    map['data source'] ||
    map['addr'] ||
    map['network address'] ||
    '';

  let server = serverRaw.replace(/^tcp:/i, '').trim();
  let port = '1433';
  if (server.includes(',')) {
    const [hostPart, portPart] = server.split(',').map((s) => s.trim());
    server = hostPart.replace(/^tcp:/i, '').trim();
    if (portPart) port = portPart;
  }

  const database =
    map['initial catalog'] || map['database'] || map['attachdb filename']?.split(/[/\\]/).pop() || '';

  const username = map['user id'] || map['uid'] || map['user'] || '';
  const password = map['password'] || map['pwd'] || '';

  if (!server && !database && !username) {
    return null;
  }

  return { server: server || 'localhost', port, username, password, database: database || 'master' };
}

export function buildConnectionPayload(connection: ConnectionDraft, isDefault: boolean): TokenConnectionInput {
  const base = {
    name: connection.name.trim(),
    label: connection.label.trim() || undefined,
    isDefault
  };

  if (connection.db === 'postgres') {
    const parsedUrl = connection.postgres.url.trim() ? parsePostgresUrl(connection.postgres.url) : {};
    return {
      ...base,
      db: 'postgres' as const,
      credentials: {
        host: (parsedUrl.host || connection.postgres.host).trim(),
        port: Number(parsedUrl.port || connection.postgres.port),
        username: (parsedUrl.username || connection.postgres.username).trim(),
        password: parsedUrl.password ?? connection.postgres.password,
        database: (parsedUrl.database || connection.postgres.database).trim()
      }
    };
  }

  if (connection.db === 'mssql') {
    const portNum = Number(connection.mssql.port);
    return {
      ...base,
      db: 'mssql' as const,
      credentials: {
        server: connection.mssql.server.trim(),
        ...(Number.isFinite(portNum) ? { port: portNum } : {}),
        username: connection.mssql.username.trim(),
        password: connection.mssql.password,
        database: connection.mssql.database.trim()
      }
    };
  }

  if (connection.db === 'mysql') {
    return {
      ...base,
      db: 'mysql' as const,
      credentials: {
        host: connection.mysql.host.trim(),
        port: Number(connection.mysql.port),
        username: connection.mysql.username.trim(),
        password: connection.mysql.password,
        database: connection.mysql.database.trim()
      }
    };
  }

  return {
    ...base,
    db: 'sqlite' as const,
    credentials: {
      filePath: connection.sqlite.filePath.trim()
    }
  };
}

export function getDefaultConnectionName(connections: ConnectionDraft[]): string {
  return connections[0]?.name.trim() || 'main';
}

export function prepareConnectionForPayload(c: ConnectionDraft): ConnectionDraft {
  if (c.db === 'mssql' && c.mssql.connectionString?.trim()) {
    const parsed = parseMssqlConnectionString(c.mssql.connectionString);
    if (parsed) {
      return { ...c, mssql: { ...c.mssql, ...parsed } };
    }
  }

  if (c.db === 'mysql' && c.mysql.url?.trim()) {
    try {
      const parsed = parseMysqlUrl(c.mysql.url);
      return { ...c, mysql: { ...c.mysql, ...parsed, url: c.mysql.url } };
    } catch {
      return c;
    }
  }

  if (c.db === 'postgres' && c.postgres.url?.trim()) {
    try {
      const parsed = parsePostgresUrl(c.postgres.url);
      return { ...c, postgres: { ...c.postgres, ...parsed } };
    } catch {
      return c;
    }
  }

  return c;
}

export function fallbackConnectionName(c: ConnectionDraft, index: number): string {
  if (c.name.trim()) {
    return c.name.trim();
  }

  if (c.db === 'postgres' && c.postgres.url.trim()) {
    try {
      return buildFriendlyNameFromUrl(c.postgres.url);
    } catch {
      /* fall through */
    }
  }

  return `conn_${index + 1}`;
}

export function tokenInputToConnectionDraft(input: TokenConnectionInput): ConnectionDraft {
  switch (input.db) {
    case 'postgres':
      return createConnectionRow({
        name: input.name,
        label: input.label || '',
        db: 'postgres',
        postgres: {
          url: '',
          host: input.credentials.host,
          port: String(input.credentials.port),
          username: input.credentials.username,
          password: input.credentials.password,
          database: input.credentials.database
        }
      });
    case 'mysql':
      return createConnectionRow({
        name: input.name,
        label: input.label || '',
        db: 'mysql',
        mysql: {
          url: '',
          host: input.credentials.host,
          port: String(input.credentials.port),
          username: input.credentials.username,
          password: input.credentials.password,
          database: input.credentials.database
        }
      });
    case 'mssql':
      return createConnectionRow({
        name: input.name,
        label: input.label || '',
        db: 'mssql',
        mssql: {
          connectionString: '',
          server: input.credentials.server,
          port: input.credentials.port != null ? String(input.credentials.port) : '1433',
          username: input.credentials.username,
          password: input.credentials.password,
          database: input.credentials.database
        }
      });
    case 'sqlite':
      return createConnectionRow({
        name: input.name,
        label: input.label || '',
        db: 'sqlite',
        sqlite: {
          filePath: input.credentials.filePath
        }
      });
  }
}

export function tokenInputsToConnectionDrafts(inputs: TokenConnectionInput[]): ConnectionDraft[] {
  return inputs.map((entry) => tokenInputToConnectionDraft(entry));
}

export function githubFormFromApi(
  gh: { orgName?: string; allowedOrgs?: string[]; allowedRepos?: string[] } | null | undefined
): GitHubFormState {
  if (!gh) {
    return { ...EMPTY_GITHUB_FORM };
  }

  return {
    orgName: gh.orgName || '',
    allowedOrgs: (gh.allowedOrgs || []).join('\n'),
    allowedRepos: (gh.allowedRepos || []).join('\n'),
    pat: ''
  };
}
