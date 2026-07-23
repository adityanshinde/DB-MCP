import { beforeEach, describe, expect, it, vi } from 'vitest';

import { queryPostgres } from '@/lib/db/postgres';
import { compareSchema } from '@/lib/tools/db/compareSchema';
import { explainQuery } from '@/lib/tools/db/explainQuery';
import { getColumnStats } from '@/lib/tools/db/getColumnStats';
import { getDependencyGraph } from '@/lib/tools/db/getDependencyGraph';
import { getForeignKeySummary } from '@/lib/tools/db/getForeignKeySummary';
import { getRelationPath } from '@/lib/tools/db/getRelationPath';
import { postgresResult } from '../../../helpers/responses';

vi.mock('@/lib/tools/db/getSchema', () => ({
  getTableSchema: vi.fn()
}));

import { getTableSchema } from '@/lib/tools/db/getSchema';

describe('analysis and composition tools', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('compareSchema reports added and changed columns', async () => {
    vi.mocked(getTableSchema)
      .mockResolvedValueOnce({
        success: true,
        data: { table: 'orders_v1', schema: 'public', columns: [{ column_name: 'id', data_type: 'integer', is_nullable: 'NO' }] },
        error: null
      })
      .mockResolvedValueOnce({
        success: true,
        data: {
          table: 'orders_v2',
          schema: 'public',
          columns: [
            { column_name: 'id', data_type: 'bigint', is_nullable: 'NO' },
            { column_name: 'total', data_type: 'numeric', is_nullable: 'YES' }
          ]
        },
        error: null
      });

    const result = await compareSchema('postgres', 'orders_v1', 'orders_v2', 'public', 'public');
    expect(result.data?.added_columns).toContain('total');
    expect(result.data?.changed_columns[0]?.name).toBe('id');
  });

  it('getColumnStats computes cardinality for selected columns', async () => {
    vi.mocked(getTableSchema).mockResolvedValue({
      success: true,
      data: {
        table: 'orders',
        schema: 'public',
        columns: [{ column_name: 'id', data_type: 'integer', is_nullable: 'NO' }]
      },
      error: null
    });

    queryPostgres
      .mockResolvedValueOnce(postgresResult([{ count: '10' }]))
      .mockResolvedValueOnce(postgresResult([{ non_null_rows: '10', null_rows: '0', distinct_rows: '10' }]));

    const result = await getColumnStats('postgres', 'orders', 'public', 1);
    expect(result.data?.columns[0].distinct_rows).toBe(10);
  });

  it('getDependencyGraph builds nodes and edges from relationships', async () => {
    queryPostgres.mockResolvedValue(postgresResult([
      {
        table_schema: 'public',
        table_name: 'orders',
        column_name: 'customer_id',
        foreign_table_schema: 'public',
        foreign_table_name: 'customers',
        foreign_column_name: 'id'
      }
    ]));

    const result = await getDependencyGraph('postgres', undefined, 'public', 10);
    expect(result.data?.edge_count).toBe(1);
    expect(result.data?.nodes.length).toBeGreaterThan(0);
  });

  it('getForeignKeySummary aggregates relationship preview', async () => {
    queryPostgres.mockResolvedValue(postgresResult([
      {
        table_schema: 'public',
        table_name: 'orders',
        column_name: 'customer_id',
        foreign_table_schema: 'public',
        foreign_table_name: 'customers',
        foreign_column_name: 'id'
      }
    ]));

    const result = await getForeignKeySummary('postgres', undefined, 'public', 5);
    expect(result.data?.total_relationships).toBe(1);
    expect(result.data?.preview[0].referenced_table).toBe('customers');
  });

  it('getRelationPath finds path between related tables', async () => {
    queryPostgres.mockResolvedValue(postgresResult([
      {
        table_schema: 'public',
        table_name: 'orders',
        column_name: 'customer_id',
        foreign_table_schema: 'public',
        foreign_table_name: 'customers',
        foreign_column_name: 'id'
      }
    ]));

    const result = await getRelationPath('postgres', 'orders', 'customers', 'public', 10);
    expect(result.data?.found).toBe(true);
    expect(result.data?.path.length).toBeGreaterThan(1);
  });

  it('explainQuery returns postgres plan lines', async () => {
    queryPostgres.mockResolvedValue(postgresResult([{ 'QUERY PLAN': 'Seq Scan on orders' }]));
    const result = await explainQuery('postgres', 'SELECT id FROM orders');
    expect(result.data?.plan[0]).toContain('Seq Scan');
  });
});
