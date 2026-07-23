import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryMSSQL } from '@/lib/db/mssql';
import { queryPostgres } from '@/lib/db/postgres';
import { compareObjectVersions } from '@/lib/tools/db/compareObjectVersions';
import { getConstraints } from '@/lib/tools/db/getConstraints';
import { getFunctionSummary } from '@/lib/tools/db/getFunctionSummary';
import { getIndexes } from '@/lib/tools/db/getIndexes';
import { getProcedureSummary } from '@/lib/tools/db/getProcedureSummary';
import { getRelationships } from '@/lib/tools/db/getRelationships';
import { getTableSchema } from '@/lib/tools/db/getSchema';
import { getTableSummary } from '@/lib/tools/db/getTableSummary';
import { getViewDefinition } from '@/lib/tools/db/getViewDefinition';
import { getViewSummary } from '@/lib/tools/db/getViewSummary';
import { mssqlResult, postgresResult } from '../../../helpers/responses';

describe('metadata tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('getTableSchema returns postgres columns', async () => {
    queryPostgres.mockResolvedValue(postgresResult([
      { column_name: 'id', data_type: 'integer', is_nullable: 'NO', column_default: null, ordinal_position: 1 }
    ]));
    const result = await getTableSchema('postgres', 'orders', 'public');
    expect(result.data?.columns[0]).toMatchObject({ column_name: 'id' });
  });

  it('getTableSchema returns mssql columns', async () => {
    queryMSSQL.mockResolvedValue(mssqlResult([
      { column_name: 'id', data_type: 'int', is_nullable: 'NO', ordinal_position: 1 }
    ]));
    const result = await getTableSchema('mssql', 'Orders', 'dbo');
    expect(result.data?.schema).toBe('dbo');
  });

  it('getViewDefinition returns postgres view sql', async () => {
    queryPostgres.mockResolvedValue(postgresResult([
      { schema_name: 'public', view_name: 'active_orders', definition: 'SELECT 1' }
    ]));
    const result = await getViewDefinition('postgres', 'active_orders', 'public');
    expect(result.data?.definition).toBe('SELECT 1');
  });

  it('getRelationships returns postgres foreign keys', async () => {
    queryPostgres.mockResolvedValue(postgresResult([
      {
        constraint_name: 'fk_orders_customer',
        table_schema: 'public',
        table_name: 'orders',
        column_name: 'customer_id',
        foreign_table_schema: 'public',
        foreign_table_name: 'customers',
        foreign_column_name: 'id'
      }
    ]));
    const result = await getRelationships('postgres', 'orders', 'public');
    expect(result.data?.relationships).toHaveLength(1);
  });

  it('getIndexes returns postgres indexes', async () => {
    queryPostgres.mockResolvedValue(postgresResult([
      { schema_name: 'public', table_name: 'orders', index_name: 'orders_pkey', definition: 'CREATE UNIQUE INDEX' }
    ]));
    const result = await getIndexes('postgres', 'orders', 'public');
    expect(result.data?.indexes).toHaveLength(1);
  });

  it('getConstraints returns postgres constraints', async () => {
    queryPostgres.mockResolvedValue(postgresResult([
      { constraint_name: 'orders_pkey', constraint_type: 'PRIMARY KEY', table_name: 'orders' }
    ]));
    const result = await getConstraints('postgres', 'orders', 'public');
    expect(result.data?.constraints).toBeDefined();
  });

  it('getTableSummary returns compact preview', async () => {
    queryPostgres
      .mockResolvedValueOnce(postgresResult([
        { name: 'id', type: 'integer', nullable: false, ordinal_position: 1 }
      ]))
      .mockResolvedValueOnce(postgresResult([{ column_name: 'id' }]));
    const result = await getTableSummary('postgres', 'orders', 'public');
    expect(result.data?.table).toBe('orders');
  });

  it('getViewSummary returns compact preview', async () => {
    queryPostgres
      .mockResolvedValueOnce(postgresResult([
        { name: 'id', type: 'integer', nullable: false }
      ]))
      .mockResolvedValueOnce(postgresResult([{ definition: 'SELECT 1 AS id' }]));
    const result = await getViewSummary('postgres', 'active_orders', 'public');
    expect(result.data?.view).toBe('active_orders');
  });

  it('getProcedureSummary returns routine metadata', async () => {
    queryPostgres.mockResolvedValue(postgresResult([
      {
        routine_schema: 'public',
        routine_name: 'refresh_cache',
        routine_type: 'PROCEDURE',
        data_type: null,
        routine_definition: 'BEGIN END;'
      }
    ]));
    const result = await getProcedureSummary('postgres', 'refresh_cache', 'public');
    expect(result.data?.routine).toBeTruthy();
  });

  it('getFunctionSummary returns routine metadata', async () => {
    queryPostgres.mockResolvedValue(postgresResult([
      {
        routine_schema: 'public',
        routine_name: 'calc_total',
        routine_type: 'FUNCTION',
        data_type: 'numeric',
        routine_definition: 'SELECT 1;'
      }
    ]));
    const result = await getFunctionSummary('postgres', 'calc_total', 'public');
    expect(result.data?.routine).toBeTruthy();
  });

  it('compareObjectVersions diffs table snapshots', async () => {
    const summarySpy = vi.spyOn(await import('@/lib/tools/db/getTableSummary'), 'getTableSummary')
      .mockResolvedValueOnce({ success: true, data: { table: 'orders_v1', schema: 'public', column_count: 1, columns_preview: [{ name: 'id', type: 'integer', nullable: false }], has_more_columns: false, primary_key_columns: ['id'] }, error: null })
      .mockResolvedValueOnce({ success: true, data: { table: 'orders_v2', schema: 'public', column_count: 2, columns_preview: [{ name: 'id', type: 'integer', nullable: false }, { name: 'total', type: 'numeric', nullable: true }], has_more_columns: false, primary_key_columns: ['id'] }, error: null });

    const result = await compareObjectVersions('postgres', 'table', 'orders_v1', 'orders_v2', 'public');
    expect(result.success).toBe(true);
    expect(result.data?.differences.length).toBeGreaterThan(0);
    summarySpy.mockRestore();
  });
});
