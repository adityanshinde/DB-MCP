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

function resolveDefaultPostgresConnection(connections: Record<string, string>): string {
  const explicit = process.env.POSTGRES_DEFAULT?.trim();
  if (explicit) {
    return explicit;
  }

  const firstConnection = Object.keys(connections)[0];
  return firstConnection || 'default';
}

const legacyPostgresUrl = process.env.POSTGRES_URL?.trim() || '';
const parsedPostgresConnections = parseJsonRecord(process.env.POSTGRES_URLS);
const postgresConnections = Object.keys(parsedPostgresConnections).length > 0
  ? parsedPostgresConnections
  : legacyPostgresUrl
    ? { default: legacyPostgresUrl }
    : {};

export const CONFIG = {
  postgres: {
    url: legacyPostgresUrl,
    defaultConnection: resolveDefaultPostgresConnection(postgresConnections),
    connections: postgresConnections
  },
  mssql: {
    connectionString: process.env.MSSQL_CONNECTION_STRING || '',
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
    maxFileSizeBytes: Math.max(50_000, Number(process.env.GITHUB_MAX_FILE_SIZE_BYTES || '300000')),
    treeMaxDepth: Math.max(1, Math.min(5, Number(process.env.GITHUB_TREE_MAX_DEPTH || '3'))),
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
