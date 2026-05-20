function parseList(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function parseJsonRecord(value: string | undefined): Record<string, string> {
  if (!value?.trim()) {
    return {};
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    return Object.entries(parsed).reduce<Record<string, string>>((accumulator, [key, entry]) => {
      if (typeof entry === 'string' && key.trim()) {
        accumulator[key.trim()] = entry.trim();
      }

      return accumulator;
    }, {});
  } catch {
    return {};
  }
}

type PostgresServerMap = Record<string, Record<string, string>>;

function parsePostgresConnections(value: string | undefined): { connections: Record<string, string>; servers: PostgresServerMap } {
  if (!value?.trim()) {
    return { connections: {}, servers: {} };
  }

  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    const connections: Record<string, string> = {};
    const servers: PostgresServerMap = {};

    for (const [key, entry] of Object.entries(parsed)) {
      const trimmedKey = key.trim();
      if (!trimmedKey) {
        continue;
      }

      if (typeof entry === 'string') {
        const url = entry.trim();
        if (url) {
          connections[trimmedKey] = url;
        }
        continue;
      }

      if (entry && typeof entry === 'object') {
        const dbEntries = Object.entries(entry as Record<string, unknown>).reduce<Record<string, string>>((accumulator, [dbName, dbUrl]) => {
          const trimmedDb = dbName.trim();
          if (typeof dbUrl === 'string' && trimmedDb) {
            const url = dbUrl.trim();
            if (url) {
              accumulator[trimmedDb] = url;
            }
          }
          return accumulator;
        }, {});

        if (Object.keys(dbEntries).length > 0) {
          servers[trimmedKey] = dbEntries;
          for (const [dbName, dbUrl] of Object.entries(dbEntries)) {
            connections[`${trimmedKey}.${dbName}`] = dbUrl;
          }
        }
      }
    }

    return { connections, servers };
  } catch {
    return { connections: {}, servers: {} };
  }
}

function resolveDefaultPostgresConnection(connections: Record<string, string>): string {
  const explicit = process.env.POSTGRES_DEFAULT?.trim();
  if (explicit) {
    return explicit;
  }

  const firstConnection = Object.keys(connections)[0];
  return firstConnection || 'default';
}

function resolveDefaultMssqlConnection(connections: Record<string, string>): string {
  const explicit = process.env.MSSQL_DEFAULT?.trim();
  if (explicit) {
    return explicit;
  }

  const firstConnection = Object.keys(connections)[0];
  return firstConnection || 'default';
}

const legacyPostgresUrl = process.env.POSTGRES_URL?.trim() || '';
const parsedPostgres = parsePostgresConnections(process.env.POSTGRES_URLS);
const postgresConnections = Object.keys(parsedPostgres.connections).length > 0
  ? parsedPostgres.connections
  : legacyPostgresUrl
    ? { default: legacyPostgresUrl }
    : {};
const postgresServers = Object.keys(parsedPostgres.servers).length > 0
  ? parsedPostgres.servers
  : {};

const legacyMssqlConnectionString = process.env.MSSQL_CONNECTION_STRING?.trim() || '';
const parsedMssqlConnections = parseJsonRecord(process.env.MSSQL_CONNECTIONS);
const mssqlConnections = Object.keys(parsedMssqlConnections).length > 0
  ? parsedMssqlConnections
  : legacyMssqlConnectionString
    ? { default: legacyMssqlConnectionString }
    : {};

export const CONFIG = {
  postgres: {
    url: legacyPostgresUrl,
    defaultConnection: resolveDefaultPostgresConnection(postgresConnections),
    connections: postgresConnections,
    servers: postgresServers
  },
  mssql: {
    connectionString: legacyMssqlConnectionString,
    defaultConnection: resolveDefaultMssqlConnection(mssqlConnections),
    connections: mssqlConnections,
    options: {
      encrypt: true,
      trustServerCertificate: false
    }
  },
  github: {
    pat: process.env.GITHUB_PAT || '',
    orgName: process.env.GITHUB_ORG_NAME || '',
    allowedOrgs: parseList(process.env.GITHUB_ALLOWED_ORGS),
    allowedRepos: parseList(process.env.GITHUB_ALLOWED_REPOS),
    maxFileSizeBytes: Math.max(50_000, Number(process.env.GITHUB_MAX_FILE_SIZE_BYTES || '1000000')),
    treeMaxDepth: Math.max(1, Math.min(5, Number(process.env.GITHUB_TREE_MAX_DEPTH || '5'))),
    orgRepoPageSize: Math.max(1, Math.min(100, Number(process.env.GITHUB_ORG_REPO_PAGE_SIZE || '30'))),
    repoResolutionMaxScans: Math.max(1, Math.min(10, Number(process.env.GITHUB_REPO_RESOLUTION_MAX_SCANS || '3'))),
    summaryContextLines: Math.max(1, Math.min(10, Number(process.env.GITHUB_SUMMARY_CONTEXT_LINES || '3'))),
    summaryPreviewBytes: Math.max(500, Number(process.env.GITHUB_SUMMARY_PREVIEW_BYTES || '2000'))
  },
  app: {
    maxRows: 50,
    previewRows: 5,
    queryTimeoutMs: 15_000,
    allowedSchemas: ['public', 'dbo']
  }
};
