import { vi } from 'vitest';

vi.mock('@/lib/db/postgres', () => ({ queryPostgres: vi.fn() }));
vi.mock('@/lib/db/mssql', () => ({ queryMSSQL: vi.fn() }));
vi.mock('@/lib/db/mysql', () => ({ queryMySQL: vi.fn() }));
vi.mock('@/lib/db/sqlite', () => ({ querySQLite: vi.fn() }));

vi.mock('@/lib/cache/metadataCache', () => ({
  METADATA_CACHE_TTLS: {
    tableSchema: 1,
    procedures: 1,
    relationships: 1,
    indexes: 1,
    constraints: 1,
    summary: 1,
    analytics: 1
  },
  readThroughMetadataCache: async <T>(options: { fetcher: () => Promise<T> }) => options.fetcher()
}));

vi.mock('@/lib/runtime/observability', () => ({
  logMcpEvent: vi.fn(),
  logMcpError: vi.fn()
}));
