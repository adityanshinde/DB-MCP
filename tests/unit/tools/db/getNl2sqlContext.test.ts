import { beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('@/lib/tools/db/listTables', () => ({ listTables: vi.fn() }));
vi.mock('@/lib/tools/db/getSchema', () => ({ getTableSchema: vi.fn() }));
vi.mock('@/lib/tools/db/getRelationships', () => ({ getRelationships: vi.fn() }));

import { getRelationships } from '@/lib/tools/db/getRelationships';
import { getTableSchema } from '@/lib/tools/db/getSchema';
import { listTables } from '@/lib/tools/db/listTables';
import {
  buildDialectHints,
  clampMaxTables,
  extractKeywords,
  getNl2sqlContext,
  rankTables
} from '@/lib/tools/db/getNl2sqlContext';
import { ok } from '../../../helpers/responses';

const mockedListTables = vi.mocked(listTables);
const mockedGetTableSchema = vi.mocked(getTableSchema);
const mockedGetRelationships = vi.mocked(getRelationships);

describe('getNl2sqlContext', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('pure helpers', () => {
    it('clampMaxTables defaults and clamps', () => {
      expect(clampMaxTables(undefined)).toBe(5);
      expect(clampMaxTables(50)).toBe(10);
      expect(clampMaxTables(0)).toBe(1);
    });

    it('extractKeywords drops stop words and expands plurals', () => {
      const keywords = extractKeywords('How many orders for customers');
      expect(keywords).toContain('orders');
      expect(keywords).toContain('order');
      expect(keywords).toContain('customers');
      expect(keywords).not.toContain('how');
    });

    it('rankTables prefers exact matches', () => {
      const ranked = rankTables(['orders', 'order_items', 'users'], ['orders']);
      expect(ranked[0].table).toBe('orders');
      expect(ranked[0].score).toBeGreaterThan(0);
    });

    it('buildDialectHints returns dialect-specific guidance', () => {
      expect(buildDialectHints('mssql').limit_syntax).toContain('TOP');
      expect(buildDialectHints('postgres').qualify_example).toContain('"schema"');
    });
  });

  describe('getNl2sqlContext', () => {
    it('assembles ranked tables, columns, and relationships', async () => {
      mockedListTables.mockResolvedValue(ok({ schema: 'public', tables: ['orders', 'customers'] }));
      mockedGetTableSchema.mockResolvedValue(ok({
        table: 'orders',
        schema: 'public',
        columns: [{ column_name: 'id', data_type: 'integer', is_nullable: 'NO' }]
      }));
      mockedGetRelationships.mockResolvedValue(ok({
        relationships: [{ table_name: 'orders', foreign_table_name: 'customers' }]
      }));

      const result = await getNl2sqlContext('postgres', 'show orders', 'public');

      expect(result.success).toBe(true);
      expect(result.data?.tables[0].name).toBe('orders');
      expect(result.data?.relationships).toHaveLength(1);
      expect(result.data?.guidance.length).toBeGreaterThan(0);
    });

    it('rejects empty question', async () => {
      const result = await getNl2sqlContext('postgres', '   ');
      expect(result.success).toBe(false);
      expect(mockedListTables).not.toHaveBeenCalled();
    });

    it('propagates listTables failure', async () => {
      mockedListTables.mockResolvedValue({ success: false, data: null, error: 'down' });
      const result = await getNl2sqlContext('postgres', 'orders');
      expect(result.error).toBe('down');
    });
  });
});
