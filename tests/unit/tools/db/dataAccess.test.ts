import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CONFIG } from '@/lib/config';
import { queryMSSQL } from '@/lib/db/mssql';
import { queryMySQL } from '@/lib/db/mysql';
import { queryPostgres } from '@/lib/db/postgres';
import { querySQLite } from '@/lib/db/sqlite';
import { executeReadQuery } from '@/lib/tools/db/executeReadQuery';
import { executeStoredProcedure } from '@/lib/tools/db/executeStoredProcedure';
import { getRowCount } from '@/lib/tools/db/getRowCount';
import { getSampleRows } from '@/lib/tools/db/getSampleRows';
import { getTableSampleByColumns } from '@/lib/tools/db/getTableSampleByColumns';
import { runQuery } from '@/lib/tools/db/runQuery';
import { mssqlResult, postgresResult } from '../../../helpers/responses';

vi.mock('@/lib/tools/db/getSchema', () => ({
  getTableSchema: vi.fn().mockResolvedValue({
    success: true,
    data: {
      table: 'orders',
      schema: 'public',
      columns: [{ column_name: 'id' }, { column_name: 'total' }]
    },
    error: null
  })
}));

describe('data access tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('runQuery', () => {
    it('executes postgres select with injected limit', async () => {
      queryPostgres.mockResolvedValue(postgresResult([{ id: 1 }], ['id']));
      const result = await runQuery('postgres', 'SELECT id FROM orders');
      expect(result.success).toBe(true);
      expect(result.data?.metadata.query).toContain(`LIMIT ${CONFIG.app.maxRows}`);
    });

    it('executes mssql select with injected top', async () => {
      queryMSSQL.mockResolvedValue(mssqlResult([{ id: 1 }], ['id']));
      const result = await runQuery('mssql', 'SELECT id FROM dbo.orders');
      expect(result.data?.metadata.query).toContain('TOP');
    });

    it('rejects unsafe sql', async () => {
      const result = await runQuery('postgres', 'DELETE FROM orders');
      expect(result.success).toBe(false);
      expect(queryPostgres).not.toHaveBeenCalled();
    });

    it('executes mysql and sqlite queries', async () => {
      queryMySQL.mockResolvedValue([{ id: 1 }]);
      querySQLite.mockResolvedValue([{ id: 1 }]);
      expect((await runQuery('mysql', 'SELECT id FROM orders')).success).toBe(true);
      expect((await runQuery('sqlite', 'SELECT id FROM orders')).success).toBe(true);
    });
  });

  describe('executeReadQuery', () => {
    it('wraps postgres query with subquery limit', async () => {
      queryPostgres.mockResolvedValue(postgresResult([{ id: 1 }], ['id']));
      const result = await executeReadQuery('postgres', 'SELECT id FROM orders');
      expect(result.data?.metadata.query).toContain('LIMIT');
    });

    it('injects mssql top clause', async () => {
      queryMSSQL.mockResolvedValue(mssqlResult([{ id: 1 }], ['id']));
      const result = await executeReadQuery('mssql', 'SELECT id FROM dbo.orders');
      expect(result.data?.metadata.query).toContain('TOP');
    });
  });

  describe('executeStoredProcedure', () => {
    it('builds postgres call statement', async () => {
      queryPostgres.mockResolvedValue(postgresResult([], []));
      const result = await executeStoredProcedure({ db: 'postgres', procedure: 'refresh_cache', schema: 'public', params: [1] });
      expect(result.success).toBe(true);
      expect(result.data?.metadata.query).toContain('CALL "public"."refresh_cache"');
    });

    it('builds mssql exec statement', async () => {
      queryMSSQL.mockResolvedValue(mssqlResult([], []));
      const result = await executeStoredProcedure({ db: 'mssql', procedure: 'RefreshCache', schema: 'dbo' });
      expect(result.data?.metadata.query).toContain('EXEC [dbo].[RefreshCache]');
    });

    it('rejects sqlite stored procedures', async () => {
      const result = await executeStoredProcedure({ db: 'sqlite', procedure: 'noop' });
      expect(result.success).toBe(false);
    });
  });

  describe('sampling and counts', () => {
    it('getSampleRows clamps limit to 5', async () => {
      queryPostgres.mockResolvedValue(postgresResult([{ id: 1 }]));
      const result = await getSampleRows('postgres', 'orders', 'public', 100);
      expect(result.data?.limit).toBe(5);
    });

    it('getRowCount returns exact count', async () => {
      queryPostgres.mockResolvedValue(postgresResult([{ row_count: '42' }]));
      const result = await getRowCount('postgres', 'orders', 'public');
      expect(result.data?.row_count).toBe(42);
    });

    it('getTableSampleByColumns selects requested columns', async () => {
      queryPostgres.mockResolvedValue(postgresResult([{ id: 1, total: 10 }]));
      const result = await getTableSampleByColumns('postgres', 'orders', 'public', ['id', 'total'], 2);
      expect(result.success).toBe(true);
      expect(result.data?.columns).toEqual(['id', 'total']);
    });
  });
});
