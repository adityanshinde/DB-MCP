import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryMSSQL } from '@/lib/db/mssql';
import { queryMySQL } from '@/lib/db/mysql';
import { queryPostgres } from '@/lib/db/postgres';
import { querySQLite } from '@/lib/db/sqlite';
import { compareObjectVersions } from '@/lib/tools/db/compareObjectVersions';
import { compareSchema } from '@/lib/tools/db/compareSchema';
import { executeReadQuery } from '@/lib/tools/db/executeReadQuery';
import { executeStoredProcedure } from '@/lib/tools/db/executeStoredProcedure';
import { explainQuery } from '@/lib/tools/db/explainQuery';
import { getColumnStats } from '@/lib/tools/db/getColumnStats';
import { getConstraints } from '@/lib/tools/db/getConstraints';
import { getDatabaseInfo } from '@/lib/tools/db/getDatabaseInfo';
import { getIndexes } from '@/lib/tools/db/getIndexes';
import { getRelationships } from '@/lib/tools/db/getRelationships';
import { getRowCount } from '@/lib/tools/db/getRowCount';
import { getSampleRows } from '@/lib/tools/db/getSampleRows';
import { getTableSchema } from '@/lib/tools/db/getSchema';
import { getTableSampleByColumns } from '@/lib/tools/db/getTableSampleByColumns';
import { getViewDefinition } from '@/lib/tools/db/getViewDefinition';
import { listSchemas } from '@/lib/tools/db/listSchemas';
import { listStoredProcedures } from '@/lib/tools/db/listStoredProcedures';
import { listTables } from '@/lib/tools/db/listTables';
import { searchColumns } from '@/lib/tools/db/searchColumns';
import { searchFunctions } from '@/lib/tools/db/searchFunctions';
import { searchProcedures } from '@/lib/tools/db/searchProcedures';
import { searchTables } from '@/lib/tools/db/searchTables';
import { searchViews } from '@/lib/tools/db/searchViews';
import { mssqlResult, postgresResult } from '../../../helpers/responses';

vi.mock('@/lib/db/mysql', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/mysql')>();
  return {
    ...actual,
    queryMySQL: vi.fn(),
    getSchemaMySQL: vi.fn().mockResolvedValue([{ column_name: 'id', data_type: 'int' }]),
    getRelationshipsMySQL: vi.fn().mockResolvedValue([{ table_name: 'orders', referenced_table_name: 'customers' }])
  };
});

vi.mock('@/lib/db/sqlite', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/db/sqlite')>();
  return {
    ...actual,
    querySQLite: vi.fn(),
    getSchemaSQLite: vi.fn().mockResolvedValue([{ name: 'id', type: 'INTEGER' }]),
    getRelationshipsSQLite: vi.fn().mockResolvedValue([{ table: 'orders', references_table: 'customers' }]),
    getTablesSQLite: vi.fn().mockResolvedValue(['orders'])
  };
});

describe('database engine branches', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('listSchemas supports every engine', async () => {
    queryPostgres.mockResolvedValue(postgresResult([{ schema_name: 'public' }]));
    queryMSSQL.mockResolvedValue(mssqlResult([{ schema_name: 'dbo' }]));
    queryMySQL.mockResolvedValue([{ schema_name: 'app' }]);
    querySQLite.mockResolvedValue([{ name: 'main' }]);

    expect((await listSchemas('postgres')).success).toBe(true);
    expect((await listSchemas('mssql')).success).toBe(true);
    expect((await listSchemas('mysql')).success).toBe(true);
    expect((await listSchemas('sqlite')).success).toBe(true);
  });

  it('listTables supports every engine', async () => {
    queryPostgres.mockResolvedValue(postgresResult([{ tablename: 'orders' }]));
    queryMSSQL.mockResolvedValue(mssqlResult([{ TABLE_NAME: 'Orders' }]));
    queryMySQL.mockResolvedValue([{ TABLE_NAME: 'orders' }]);
    querySQLite.mockResolvedValue([{ name: 'orders' }]);

    expect((await listTables('postgres', 'public')).data?.tables).toEqual(['orders']);
    expect((await listTables('mssql', 'dbo')).data?.tables).toEqual(['Orders']);
    expect((await listTables('mysql')).data?.tables).toEqual(['orders']);
    expect((await listTables('sqlite')).data?.tables).toEqual(['orders']);
  });

  it('getDatabaseInfo supports every engine', async () => {
    queryPostgres.mockResolvedValue(postgresResult([{ database_name: 'app' }]));
    queryMSSQL.mockResolvedValue(mssqlResult([{ database_name: 'AppDb' }]));
    queryMySQL.mockResolvedValue([{ database_name: 'app' }]);
    querySQLite.mockResolvedValueOnce([{ name: 'main' }]).mockResolvedValueOnce([{ version: '3.45.0' }]);

    expect((await getDatabaseInfo('postgres')).success).toBe(true);
    expect((await getDatabaseInfo('mssql')).success).toBe(true);
    expect((await getDatabaseInfo('mysql')).success).toBe(true);
    expect((await getDatabaseInfo('sqlite')).success).toBe(true);
  });

  it('getTableSchema supports mysql and sqlite adapters', async () => {
    const mysql = await getTableSchema('mysql', 'orders');
    const sqlite = await getTableSchema('sqlite', 'orders');
    expect(mysql.success).toBe(true);
    expect(sqlite.success).toBe(true);
  });

  it('getRelationships supports mysql and sqlite adapters', async () => {
    const mysql = await getRelationships('mysql', 'orders');
    const sqlite = await getRelationships('sqlite', 'orders');
    expect(mysql.data?.relationships.length).toBeGreaterThan(0);
    expect(sqlite.data?.relationships.length).toBeGreaterThan(0);
  });

  it('search tools support mssql, mysql, and sqlite', async () => {
    queryMSSQL.mockResolvedValue(mssqlResult([{ schema_name: 'dbo', table_name: 'Orders' }]));
    queryMySQL.mockResolvedValue([{ TABLE_SCHEMA: 'app', TABLE_NAME: 'orders' }]);
    querySQLite.mockResolvedValue([{ name: 'orders' }]);
    queryPostgres.mockResolvedValue(postgresResult([{ schemaname: 'public', tablename: 'orders' }]));

    expect((await searchTables('mssql', 'ord', 'dbo')).success).toBe(true);
    expect((await searchTables('mysql', 'ord')).success).toBe(true);
    expect((await searchTables('sqlite', 'ord')).success).toBe(true);
    expect((await searchViews('mssql', 'active', 'dbo')).success).toBe(true);
    expect((await searchViews('mysql', 'active')).success).toBe(true);
    expect((await searchViews('sqlite', 'active')).success).toBe(true);
    expect((await searchFunctions('mssql', 'calc', 'dbo')).success).toBe(true);
    expect((await searchProcedures('mysql', 'refresh')).success).toBe(true);
    expect((await searchColumns('sqlite', 'id')).success).toBe(true);
  });

  it('metadata readers support mssql and sqlite', async () => {
    queryMSSQL.mockResolvedValue(mssqlResult([{ index_name: 'idx_orders' }]));
    querySQLite.mockResolvedValue([{ name: 'sqlite_autoindex_orders_1' }]);
    expect((await getIndexes('mssql', 'Orders', 'dbo')).success).toBe(true);
    expect((await getIndexes('sqlite', 'orders')).success).toBe(true);

    queryMSSQL.mockResolvedValue(mssqlResult([{ constraint_name: 'PK_Orders' }]));
    querySQLite.mockResolvedValue([{ name: 'orders_pkey' }]);
    expect((await getConstraints('mssql', 'Orders', 'dbo')).success).toBe(true);
    expect((await getConstraints('sqlite', 'orders')).success).toBe(true);

    queryMSSQL.mockResolvedValue(mssqlResult([{ definition: 'SELECT 1' }]));
    querySQLite.mockResolvedValue([{ sql: 'SELECT 1' }]);
    expect((await getViewDefinition('mssql', 'ActiveOrders', 'dbo')).success).toBe(true);
    expect((await getViewDefinition('sqlite', 'active_orders')).success).toBe(true);
  });

  it('data sampling and counts support every engine', async () => {
    queryPostgres.mockResolvedValue(postgresResult([{ id: 1 }]));
    queryMSSQL.mockResolvedValue(mssqlResult([{ id: 1 }]));
    queryMySQL.mockResolvedValue([{ id: 1 }]);
    querySQLite.mockResolvedValue([{ id: 1 }]);

    for (const db of ['postgres', 'mssql', 'mysql', 'sqlite'] as const) {
      expect((await getSampleRows(db, 'orders', db === 'postgres' ? 'public' : undefined)).success).toBe(true);
      expect((await getRowCount(db, 'orders', db === 'postgres' ? 'public' : undefined)).success).toBe(true);
    }
  });

  it('executeReadQuery and explainQuery support every engine', async () => {
    queryPostgres.mockResolvedValue(postgresResult([{ id: 1 }], ['id']));
    queryMSSQL.mockResolvedValue(mssqlResult([{ id: 1 }], ['id']));
    queryMySQL.mockResolvedValue([{ id: 1 }]);
    querySQLite.mockResolvedValue([{ id: 1 }]);

    for (const db of ['postgres', 'mssql', 'mysql', 'sqlite'] as const) {
      expect((await executeReadQuery(db, 'SELECT 1 AS id')).success).toBe(true);
    }

    queryPostgres.mockResolvedValue(postgresResult([{ 'QUERY PLAN': 'Seq Scan' }]));
    queryMSSQL.mockResolvedValue(mssqlResult([{ stmt_text: 'Clustered Index Scan' }]));
    queryMySQL.mockResolvedValue([{ id: 1, select_type: 'SIMPLE' }]);
    querySQLite.mockResolvedValue([{ detail: 'SCAN orders' }]);

    expect((await explainQuery('postgres', 'SELECT 1')).success).toBe(true);
    expect((await explainQuery('mssql', 'SELECT 1')).success).toBe(true);
    expect((await explainQuery('mysql', 'SELECT 1')).success).toBe(true);
    expect((await explainQuery('sqlite', 'SELECT 1')).success).toBe(true);
  });

  it('stored procedures support mysql and reject sqlite', async () => {
    queryPostgres.mockResolvedValue(postgresResult([], []));
    queryMSSQL.mockResolvedValue(mssqlResult([], []));
    queryMySQL.mockResolvedValue([{ ok: 1 }]);

    expect((await executeStoredProcedure({ db: 'mysql', procedure: 'refresh_cache' })).success).toBe(true);
    expect((await executeStoredProcedure({ db: 'sqlite', procedure: 'noop' })).success).toBe(false);
  });

  it('listStoredProcedures supports mssql and mysql', async () => {
    queryPostgres.mockResolvedValue(postgresResult([{ schema: 'public', name: 'refresh' }]));
    queryMSSQL.mockResolvedValue(mssqlResult([{ SPECIFIC_SCHEMA: 'dbo', SPECIFIC_NAME: 'Refresh' }]));
    queryMySQL.mockResolvedValue([{ ROUTINE_SCHEMA: 'app', ROUTINE_NAME: 'refresh' }]);

    expect((await listStoredProcedures('mssql')).data?.procedures[0].name).toBe('Refresh');
    expect((await listStoredProcedures('mysql')).data?.procedures[0].schema).toBe('app');
  });

  it('compareSchema reports structural differences', async () => {
    queryPostgres
      .mockResolvedValueOnce(postgresResult([
        { column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, ordinal_position: 1 }
      ]))
      .mockResolvedValueOnce(postgresResult([
        { column_name: 'id', data_type: 'bigint', is_nullable: 'NO', column_default: null, ordinal_position: 1 },
        { column_name: 'total', data_type: 'numeric', is_nullable: 'YES', column_default: null, ordinal_position: 2 }
      ]));

    const result = await compareSchema('postgres', 'orders_v1', 'orders_v2', 'public', 'public');
    expect(result.data?.added_columns).toContain('total');
  });

  it('getTableSampleByColumns supports mysql and sqlite', async () => {
    queryPostgres.mockResolvedValue(postgresResult([{ id: 1 }]));
    queryMySQL.mockResolvedValue([{ id: 1 }]);
    querySQLite.mockResolvedValue([{ id: 1 }]);

    expect((await getTableSampleByColumns('mysql', 'orders', undefined, ['id'])).success).toBe(true);
    expect((await getTableSampleByColumns('sqlite', 'orders', undefined, ['id'])).success).toBe(true);
  });

  it('getColumnStats handles mssql branch', async () => {
    queryPostgres.mockResolvedValue(postgresResult([
      { column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, ordinal_position: 1 }
    ]));
    queryMSSQL
      .mockResolvedValueOnce(mssqlResult([{ count: 3 }]))
      .mockResolvedValueOnce(mssqlResult([{ non_null_rows: 3, null_rows: 0, distinct_rows: 3 }]));

    const pg = await getColumnStats('postgres', 'orders', 'public', 1);
    expect(pg.success).toBe(true);

    queryMSSQL.mockReset();
    queryMSSQL
      .mockResolvedValueOnce(mssqlResult([{ name: 'id', type: 'int', nullable: 0, ordinal_position: 1 }]))
      .mockResolvedValueOnce(mssqlResult([{ count: 3 }]))
      .mockResolvedValueOnce(mssqlResult([{ non_null_rows: 3, null_rows: 0, distinct_rows: 3 }]));

    const mssqlStats = await getColumnStats('mssql', 'Orders', 'dbo', 1);
    expect(mssqlStats.success).toBe(true);
  });

  it('compareObjectVersions supports view, procedure, and function types', async () => {
    const viewSpy = vi.spyOn(await import('@/lib/tools/db/getViewSummary'), 'getViewSummary')
      .mockResolvedValue({ success: true, data: { view: 'v1', schema: 'public', column_count: 1, columns_preview: [], definition_preview: 'A', has_more_columns: false }, error: null });
    const procedureSpy = vi.spyOn(await import('@/lib/tools/db/getProcedureSummary'), 'getProcedureSummary')
      .mockResolvedValue({ success: true, data: { supported: true, routine: { routine_name: 'p1' }, parameters: [{ name: 'id' }] }, error: null });
    const functionSpy = vi.spyOn(await import('@/lib/tools/db/getFunctionSummary'), 'getFunctionSummary')
      .mockResolvedValue({ success: true, data: { supported: true, routine: { routine_name: 'f1' }, parameters: [] }, error: null });

    expect((await compareObjectVersions('postgres', 'view', 'v1', 'v2')).success).toBe(true);
    expect((await compareObjectVersions('postgres', 'procedure', 'p1', 'p2')).success).toBe(true);
    expect((await compareObjectVersions('postgres', 'function', 'f1', 'f2')).success).toBe(true);

    viewSpy.mockRestore();
    procedureSpy.mockRestore();
    functionSpy.mockRestore();
  });
});
