import { describe, expect, it } from 'vitest';

import { normalizeSchemaFilter, quoteIdentifier, truncateText } from '@/lib/tools/db/toolUtils';

describe('toolUtils', () => {
  describe('quoteIdentifier', () => {
    it('uses square brackets for mssql and escapes closing brackets', () => {
      expect(quoteIdentifier('mssql', 'Orders')).toBe('[Orders]');
      expect(quoteIdentifier('mssql', 'we]ird')).toBe('[we]]ird]');
    });

    it('uses backticks for mysql and escapes backticks', () => {
      expect(quoteIdentifier('mysql', 'Orders')).toBe('`Orders`');
      expect(quoteIdentifier('mysql', 'we`ird')).toBe('`we``ird`');
    });

    it('uses double quotes for postgres and sqlite', () => {
      expect(quoteIdentifier('postgres', 'Orders')).toBe('"Orders"');
      expect(quoteIdentifier('sqlite', 'we"ird')).toBe('"we""ird"');
    });
  });

  describe('truncateText', () => {
    it('returns unchanged text within limit', () => {
      expect(truncateText('hello', 10)).toBe('hello');
    });

    it('truncates with ellipsis when over limit', () => {
      expect(truncateText('hello world', 5)).toBe('hello...');
    });
  });

  describe('normalizeSchemaFilter', () => {
    it('falls back to dialect defaults', () => {
      expect(normalizeSchemaFilter('postgres')).toBe('public');
      expect(normalizeSchemaFilter('mssql')).toBe('dbo');
      expect(normalizeSchemaFilter('sqlite')).toBe('main');
      expect(normalizeSchemaFilter('mysql')).toBe('default');
    });

    it('trims caller schema', () => {
      expect(normalizeSchemaFilter('postgres', '  sales  ')).toBe('sales');
    });

    it('throws on empty schema', () => {
      expect(() => normalizeSchemaFilter('postgres', '   ')).toThrow(/schema/i);
    });
  });
});
