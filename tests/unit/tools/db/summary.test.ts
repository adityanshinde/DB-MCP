import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { DBType } from '@/lib/types';

import { queryMSSQL } from '@/lib/db/mssql';
import { queryMySQL } from '@/lib/db/mysql';
import { queryPostgres } from '@/lib/db/postgres';
import { querySQLite } from '@/lib/db/sqlite';
import { getFunctionSummary } from '@/lib/tools/db/getFunctionSummary';
import { getProcedureSummary } from '@/lib/tools/db/getProcedureSummary';
import { getTableSummary } from '@/lib/tools/db/getTableSummary';
import { getViewSummary } from '@/lib/tools/db/getViewSummary';
import { listSchemas } from '@/lib/tools/db/listSchemas';
import { runQuery } from '@/lib/tools/db/runQuery';
import { searchColumns } from '@/lib/tools/db/searchColumns';
import { searchProcedures } from '@/lib/tools/db/searchProcedures';
import { mssqlResult, postgresResult } from '../../../helpers/responses';

describe('summary and search coverage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getTableSummary supports mssql, mysql, and sqlite', async () => {
    queryMSSQL
      .mockResolvedValueOnce(mssqlResult([{ name: 'Id', type: 'int', nullable: 0, ordinal_position: 1 }]))
      .mockResolvedValueOnce(mssqlResult([{ column_name: 'Id' }]));
    expect((await getTableSummary('mssql', 'Orders', 'dbo')).data?.table).toBe('Orders');

    queryMySQL
      .mockResolvedValueOnce([{ name: 'id', type: 'int', nullable: 1, ordinal_position: 1, column_key: 'PRI' }])
      .mockResolvedValueOnce([{ column_name: 'id' }]);
    expect((await getTableSummary('mysql', 'orders')).success).toBe(true);

    querySQLite
      .mockResolvedValueOnce([{ name: 'id', type: 'INTEGER', notnull: 1, pk: 1 }])
      .mockResolvedValueOnce([{ name: 'id', type: 'INTEGER', notnull: 1, pk: 1 }]);
    expect((await getTableSummary('sqlite', 'orders')).success).toBe(true);
  });

  it('getViewSummary supports mssql, mysql, and sqlite', async () => {
    queryMSSQL
      .mockResolvedValueOnce(mssqlResult([{ name: 'Id', type: 'int', nullable: 0 }]))
      .mockResolvedValueOnce(mssqlResult([{ definition: 'SELECT 1' }]));
    expect((await getViewSummary('mssql', 'ActiveOrders', 'dbo')).success).toBe(true);

    queryMySQL
      .mockResolvedValueOnce([{ name: 'id', type: 'int', nullable: 1 }])
      .mockResolvedValueOnce([{ definition: 'SELECT 1' }]);
    expect((await getViewSummary('mysql', 'active_orders')).success).toBe(true);

    querySQLite
      .mockResolvedValueOnce([{ name: 'id', type: 'INTEGER', notnull: 1 }])
      .mockResolvedValueOnce([{ sql: 'SELECT 1' }]);
    expect((await getViewSummary('sqlite', 'active_orders')).success).toBe(true);
  });

  it('routine summaries support mssql and mysql parameter metadata', async () => {
    queryMSSQL
      .mockResolvedValueOnce(mssqlResult([{ routine_schema: 'dbo', routine_name: 'Refresh', routine_type: 'PROCEDURE', data_type: null }]))
      .mockResolvedValueOnce(mssqlResult([{ name: 'id', mode: 'IN', data_type: 'int', ordinal_position: 1 }]));
    expect((await getProcedureSummary('mssql', 'Refresh', 'dbo')).data?.parameters.length).toBe(1);

    queryMySQL
      .mockResolvedValueOnce([{ routine_schema: 'app', routine_name: 'calc_total', routine_type: 'FUNCTION', data_type: 'decimal', routine_definition: 'SELECT 1' }])
      .mockResolvedValueOnce([{ name: 'amount', mode: 'IN', data_type: 'decimal', ordinal_position: 1 }]);
    expect((await getFunctionSummary('mysql', 'calc_total')).data?.routine).toBeTruthy();
  });

  it('searchColumns and searchProcedures cover postgres and secondary engines', async () => {
    queryPostgres.mockResolvedValue(postgresResult([
      { table_schema: 'public', table_name: 'orders', column_name: 'total' }
    ]));
    expect((await searchColumns('postgres', 'total', 'public', 10)).data?.matches.length).toBe(1);

    queryMSSQL.mockResolvedValue(mssqlResult([
      { schema_name: 'dbo', table_name: 'Orders', column_name: 'Total' }
    ]));
    expect((await searchColumns('mssql', 'total', 'dbo')).success).toBe(true);

    queryMySQL.mockResolvedValue([
      { TABLE_SCHEMA: 'app', TABLE_NAME: 'orders', COLUMN_NAME: 'total' }
    ]);
    expect((await searchColumns('mysql', 'total')).success).toBe(true);

    queryPostgres.mockResolvedValue(postgresResult([
      { routine_schema: 'public', routine_name: 'refresh_cache' }
    ]));
    expect((await searchProcedures('postgres', 'refresh', 'public')).data?.matches.length).toBe(1);
  });

  it('runQuery preserves existing limit and rejects unsupported db', async () => {
    queryPostgres.mockResolvedValue(postgresResult([{ id: 1 }], ['id']));
    const limited = await runQuery('postgres', 'SELECT id FROM orders LIMIT 10');
    expect(limited.data?.metadata.query).not.toContain('LIMIT 500');

    const unsupported = await runQuery('invalid' as DBType, 'SELECT 1');
    expect(unsupported.success).toBe(false);
  });

  it('returns errors for unsupported database engines', async () => {
    expect((await listSchemas('bad' as DBType)).success).toBe(false);
  });
});
