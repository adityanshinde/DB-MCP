import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryMSSQL } from '@/lib/db/mssql';
import { queryMySQL } from '@/lib/db/mysql';
import { queryPostgres } from '@/lib/db/postgres';
import { querySQLite } from '@/lib/db/sqlite';
import { getDatabaseInfo } from '@/lib/tools/db/getDatabaseInfo';
import { listMssqlConnections } from '@/lib/tools/db/listMssqlConnections';
import { listPostgresConnections } from '@/lib/tools/db/listPostgresConnections';
import { listSchemas } from '@/lib/tools/db/listSchemas';
import { listStoredProcedures } from '@/lib/tools/db/listStoredProcedures';
import { listTables } from '@/lib/tools/db/listTables';
import { searchColumns } from '@/lib/tools/db/searchColumns';
import { searchFunctions } from '@/lib/tools/db/searchFunctions';
import { searchProcedures } from '@/lib/tools/db/searchProcedures';
import { searchTables } from '@/lib/tools/db/searchTables';
import { searchViews } from '@/lib/tools/db/searchViews';
import { mssqlResult, postgresResult } from '../../../helpers/responses';

vi.mock('@/lib/config', () => ({
  CONFIG: {
    postgres: {
      defaultConnection: 'default',
      connections: { default: 'postgres://local/app', analytics: 'postgres://local/analytics' },
      servers: {
        prod: { app: 'postgres://prod/app' }
      }
    },
    mssql: {
      defaultConnection: 'default',
      connections: { default: 'Server=localhost;', reporting: 'Server=report;' }
    }
  }
}));

describe('discovery and connection tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('listSchemas', () => {
    it('lists postgres schemas excluding system schemas', async () => {
      queryPostgres.mockResolvedValue(postgresResult([{ schema_name: 'public' }, { schema_name: 'sales' }]));
      const result = await listSchemas('postgres');
      expect(result.success).toBe(true);
      expect(result.data?.schemas).toEqual(['public', 'sales']);
    });

    it('lists mssql schemas', async () => {
      queryMSSQL.mockResolvedValue(mssqlResult([{ schema_name: 'dbo' }]));
      const result = await listSchemas('mssql');
      expect(result.data?.schemas).toEqual(['dbo']);
    });

    it('lists mysql current database', async () => {
      queryMySQL.mockResolvedValue([{ schema_name: 'appdb' }]);
      const result = await listSchemas('mysql');
      expect(result.data?.schemas).toEqual(['appdb']);
    });

    it('lists sqlite attached databases', async () => {
      querySQLite.mockResolvedValue([{ name: 'main' }]);
      const result = await listSchemas('sqlite');
      expect(result.data?.schemas).toEqual(['main']);
    });
  });

  describe('listTables', () => {
    it('lists postgres tables for schema', async () => {
      queryPostgres.mockResolvedValue(postgresResult([{ tablename: 'orders' }]));
      const result = await listTables('postgres', 'public');
      expect(result.data).toEqual({ schema: 'public', tables: ['orders'] });
    });

    it('lists mssql tables', async () => {
      queryMSSQL.mockResolvedValue(mssqlResult([{ TABLE_NAME: 'Orders' }]));
      const result = await listTables('mssql', 'dbo');
      expect(result.data?.tables).toEqual(['Orders']);
    });

    it('lists mysql tables', async () => {
      queryMySQL.mockResolvedValue([{ TABLE_NAME: 'orders' }]);
      const result = await listTables('mysql');
      expect(result.data?.tables).toEqual(['orders']);
    });

    it('lists sqlite tables', async () => {
      querySQLite.mockResolvedValue([{ name: 'orders' }]);
      const result = await listTables('sqlite');
      expect(result.data?.tables).toEqual(['orders']);
    });
  });

  describe('search tools', () => {
    it('searchTables returns postgres matches', async () => {
      queryPostgres.mockResolvedValue(postgresResult([{ schemaname: 'public', tablename: 'orders' }]));
      const result = await searchTables('postgres', 'ord', 'public');
      expect(result.data?.matches[0]).toEqual({ schema: 'public', table: 'orders' });
    });

    it('searchTables rejects empty query', async () => {
      const result = await searchTables('postgres', '  ');
      expect(result.success).toBe(false);
    });

    it('searchViews queries postgres', async () => {
      queryPostgres.mockResolvedValue(postgresResult([{ schemaname: 'public', viewname: 'active_orders' }]));
      const result = await searchViews('postgres', 'active', 'public');
      expect(result.success).toBe(true);
      expect(result.data?.matches.length).toBe(1);
    });

    it('searchFunctions queries postgres', async () => {
      queryPostgres.mockResolvedValue(postgresResult([{ routine_schema: 'public', routine_name: 'calc_total' }]));
      const result = await searchFunctions('postgres', 'calc', 'public');
      expect(result.success).toBe(true);
    });

    it('searchProcedures queries postgres', async () => {
      queryPostgres.mockResolvedValue(postgresResult([{ routine_schema: 'public', routine_name: 'refresh' }]));
      const result = await searchProcedures('postgres', 'refresh', 'public');
      expect(result.success).toBe(true);
    });

    it('searchColumns queries postgres', async () => {
      queryPostgres.mockResolvedValue(postgresResult([{ table_schema: 'public', table_name: 'orders', column_name: 'total' }]));
      const result = await searchColumns('postgres', 'total', 'public');
      expect(result.success).toBe(true);
      expect(result.data?.matches[0].column).toBe('total');
    });
  });

  describe('connection listing', () => {
    it('listPostgresConnections includes schemas when url exists', async () => {
      queryPostgres.mockResolvedValue(postgresResult([{ schema_name: 'public' }]));
      const result = await listPostgresConnections();
      expect(result.success).toBe(true);
      expect(result.data?.total).toBeGreaterThan(0);
      expect(result.data?.connections.some((c) => c.schemas?.includes('public'))).toBe(true);
    });

    it('listMssqlConnections returns configured aliases', async () => {
      const result = await listMssqlConnections();
      expect(result.data?.connections.map((c) => c.name)).toEqual(['default', 'reporting']);
      expect(result.data?.default_connection).toBe('default');
    });
  });

  describe('getDatabaseInfo and listStoredProcedures', () => {
    it('getDatabaseInfo returns postgres metadata', async () => {
      queryPostgres.mockResolvedValue(postgresResult([{ database_name: 'app', current_user: 'reader' }]));
      const result = await getDatabaseInfo('postgres');
      expect(result.data?.database).toMatchObject({ database_name: 'app' });
    });

    it('listStoredProcedures returns postgres routines', async () => {
      queryPostgres.mockResolvedValue(postgresResult([{ schema: 'public', name: 'refresh_cache' }]));
      const result = await listStoredProcedures('postgres');
      expect(result.data?.procedures[0]).toEqual({ schema: 'public', name: 'refresh_cache' });
    });

    it('listStoredProcedures returns empty list for sqlite', async () => {
      const result = await listStoredProcedures('sqlite');
      expect(result.data?.procedures).toEqual([]);
    });
  });
});
