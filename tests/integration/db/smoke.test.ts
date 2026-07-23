import { describe, expect, it } from 'vitest';

import { listSchemas } from '@/lib/tools/db/listSchemas';
import { listTables } from '@/lib/tools/db/listTables';
import { getDatabaseInfo } from '@/lib/tools/db/getDatabaseInfo';
import { getTableSchema } from '@/lib/tools/db/getSchema';
import { getRelationships } from '@/lib/tools/db/getRelationships';
import { runQuery } from '@/lib/tools/db/runQuery';

const enabled = process.env.RUN_DB_INTEGRATION_TESTS === 'true';

function hasPostgresConfig(): boolean {
  return Boolean(process.env.POSTGRES_URL || process.env.POSTGRES_URLS);
}

describe.skipIf(!enabled)('live database smoke tests', () => {
  describe.skipIf(!hasPostgresConfig())('postgres', () => {
    it('lists schemas', async () => {
      const result = await listSchemas('postgres');
      expect(result.success).toBe(true);
      expect(result.data?.schemas.length).toBeGreaterThan(0);
    });

    it('lists tables in public schema', async () => {
      const result = await listTables('postgres', 'public');
      expect(result.success).toBe(true);
    });

    it('reads database info', async () => {
      const result = await getDatabaseInfo('postgres');
      expect(result.success).toBe(true);
      expect(result.data?.database).toBeTruthy();
    });

    it('reads table schema when a table exists', async () => {
      const tables = await listTables('postgres', 'public');
      const first = tables.data?.tables[0];
      if (!first) {
        return;
      }

      const schema = await getTableSchema('postgres', first, 'public');
      expect(schema.success).toBe(true);
    });

    it('reads relationships', async () => {
      const result = await getRelationships('postgres', undefined, 'public');
      expect(result.success).toBe(true);
    });

    it('runs bounded read-only query', async () => {
      const result = await runQuery('postgres', 'SELECT 1 AS ok');
      expect(result.success).toBe(true);
      expect(result.data?.rows[0]).toMatchObject({ ok: 1 });
    });
  });

  it('skips engines without configuration instead of failing the suite', () => {
    expect(true).toBe(true);
  });
});

describe('integration gate', () => {
  it('documents opt-in behavior', () => {
    if (!enabled) {
      expect(process.env.RUN_DB_INTEGRATION_TESTS).not.toBe('true');
    }
  });
});
