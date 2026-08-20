import { parseConnectionJson, resolveNamedDefault } from './runtime/parseConnections';
import { loadLocalEnv } from './runtime/loadLocalEnv';

loadLocalEnv();

function parseList(value: string | undefined): string[] {
  return (value || '')
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

const legacyPostgresUrl = process.env.POSTGRES_URL?.trim() || '';
const parsedPostgres = parseConnectionJson(process.env.POSTGRES_URLS);
const postgresConnections = Object.keys(parsedPostgres.connections).length > 0
  ? parsedPostgres.connections
  : legacyPostgresUrl
    ? { default: legacyPostgresUrl }
    : {};
const postgresServers = Object.keys(parsedPostgres.servers).length > 0
  ? parsedPostgres.servers
  : {};

const legacyMssqlConnectionString = process.env.MSSQL_CONNECTION_STRING?.trim() || '';
const parsedMssqlConnections = parseConnectionJson(process.env.MSSQL_CONNECTIONS);
const mssqlConnections = Object.keys(parsedMssqlConnections.connections).length > 0
  ? parsedMssqlConnections.connections
  : legacyMssqlConnectionString
    ? { default: legacyMssqlConnectionString }
    : {};

export const CONFIG = {
  postgres: {
    url: legacyPostgresUrl,
    defaultConnection: resolveNamedDefault(postgresConnections, process.env.POSTGRES_DEFAULT),
    connections: postgresConnections,
    servers: postgresServers
  },
  mssql: {
    connectionString: legacyMssqlConnectionString,
    defaultConnection: resolveNamedDefault(mssqlConnections, process.env.MSSQL_DEFAULT),
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
    maxRows: 500,
    previewRows: 50,
    queryTimeoutMs: 15_000
  }
};
