import { queryMSSQL } from '@/lib/db/mssql';
import { queryMySQL } from '@/lib/db/mysql';
import { queryPostgres } from '@/lib/db/postgres';
import { querySQLite } from '@/lib/db/sqlite';
import type { DatabaseCredentials, DBType } from '@/lib/types';
import { validateReadOnlyQuery } from '@/lib/validators/queryValidator';

export type ReadOnlyPolicyProbe = {
  select_allowed: boolean;
  mutation_blocked: boolean;
};

export type ConnectionPreflightResult = {
  readonly_policy: ReadOnlyPolicyProbe;
  reachable: boolean;
  latency_ms?: number;
  server_version?: string;
  connection_error?: string;
};

function truncateVersion(text: string, max: number): string {
  const t = text.trim();
  if (t.length <= max) {
    return t;
  }

  return `${t.slice(0, max - 1)}…`;
}

export function probeReadOnlyPolicy(): ReadOnlyPolicyProbe {
  let select_allowed = false;
  try {
    validateReadOnlyQuery('SELECT 1');
    select_allowed = true;
  } catch {
    select_allowed = false;
  }

  let mutation_blocked = false;
  try {
    validateReadOnlyQuery('DELETE FROM t');
  } catch {
    mutation_blocked = true;
  }

  return { select_allowed, mutation_blocked };
}

async function probeReachability(db: DBType, creds: DatabaseCredentials): Promise<{
  ok: boolean;
  latency_ms: number;
  server_version?: string;
  error?: string;
}> {
  const started = Date.now();

  try {
    switch (db) {
      case 'postgres': {
        const result = await queryPostgres<{ version: string }>('SELECT version() AS version', [], creds.postgres);
        const version = result.rows[0]?.version;
        return {
          ok: true,
          latency_ms: Date.now() - started,
          server_version: version ? truncateVersion(String(version), 160) : undefined
        };
      }
      case 'mysql': {
        const rows = (await queryMySQL('SELECT VERSION() AS v', creds)) as Array<{ v?: string }>;
        const v = Array.isArray(rows) ? rows[0]?.v : undefined;
        return {
          ok: true,
          latency_ms: Date.now() - started,
          server_version: v ? truncateVersion(String(v), 160) : undefined
        };
      }
      case 'mssql': {
        const result = await queryMSSQL('SELECT @@VERSION AS v', {}, creds.mssql);
        const row = result.rows[0] as { v?: string } | undefined;
        const v = row?.v;
        return {
          ok: true,
          latency_ms: Date.now() - started,
          server_version: v ? truncateVersion(String(v), 200) : undefined
        };
      }
      case 'sqlite': {
        const rows = (await querySQLite('SELECT sqlite_version() AS v', creds)) as Array<{ v?: string }>;
        const v = rows[0]?.v;
        return {
          ok: true,
          latency_ms: Date.now() - started,
          server_version: v ? truncateVersion(`SQLite ${v}`, 120) : undefined
        };
      }
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Connection failed.';
    return {
      ok: false,
      latency_ms: Date.now() - started,
      error: message
    };
  }
}

export async function runConnectionPreflight(db: DBType, creds: DatabaseCredentials): Promise<ConnectionPreflightResult> {
  const readonly_policy = probeReadOnlyPolicy();
  const reach = await probeReachability(db, creds);

  return {
    readonly_policy,
    reachable: reach.ok,
    latency_ms: reach.latency_ms,
    server_version: reach.server_version,
    connection_error: reach.ok ? undefined : reach.error
  };
}
