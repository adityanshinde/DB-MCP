'use client';

import type { ConnectionPreflightResult } from '@/lib/credentials/testConnection';
import {
  parseMssqlConnectionString,
  parseMysqlUrl,
  parsePostgresUrl,
  type ConnectionDraft
} from '@/lib/site/connectionDraft';

export type ConnectionPreflight =
  | { kind: 'idle' }
  | { kind: 'loading' }
  | { kind: 'done'; data: ConnectionPreflightResult }
  | { kind: 'error'; message: string };

export function ConnectionHints({ conn, preflight }: { conn: ConnectionDraft; preflight: ConnectionPreflight }) {
  const hints: Array<{ tone: 'ok' | 'warn' | 'bad'; text: string }> = [];

  try {
    if (conn.db === 'postgres') {
      const u = conn.postgres.url.trim();
      if (u) {
        parsePostgresUrl(u);
        hints.push({ tone: 'ok', text: 'Postgres URL format looks valid.' });
      }
    }
    if (conn.db === 'mysql') {
      const u = conn.mysql.url.trim();
      if (u) {
        parseMysqlUrl(u);
        hints.push({ tone: 'ok', text: 'MySQL URL format looks valid.' });
      }
    }
    if (conn.db === 'mssql') {
      const cs = conn.mssql.connectionString.trim();
      if (cs && parseMssqlConnectionString(cs)) {
        hints.push({ tone: 'ok', text: 'SQL Server connection string parsed.' });
      }
    }
    if (conn.db === 'sqlite' && conn.sqlite.filePath.trim()) {
      hints.push({ tone: 'ok', text: 'SQLite path set (must exist on the MCP server).' });
    }
  } catch {
    hints.push({ tone: 'bad', text: 'Connection details do not match the selected database type.' });
  }

  if (preflight.kind === 'idle') {
    hints.push({
      tone: 'warn',
      text: 'When this connection is complete, reachability and read-only SQL rules are checked automatically from this deployment (shortly after you stop typing).'
    });
  } else if (preflight.kind === 'loading') {
    hints.push({ tone: 'warn', text: 'Checking connection from this deployment…' });
  } else if (preflight.kind === 'error') {
    hints.push({ tone: 'bad', text: `Preflight failed: ${preflight.message}` });
  } else {
    const { data } = preflight;
    if (data.reachable) {
      hints.push({
        tone: 'ok',
        text: `Reachable from server (${data.latency_ms ?? '?'} ms)${data.server_version ? ` — ${data.server_version}` : ''}.`
      });
    } else {
      hints.push({
        tone: 'bad',
        text: `Not reachable from server: ${data.connection_error || 'Unknown error'}.`
      });
    }

    const ro = data.readonly_policy;
    if (ro.select_allowed && ro.mutation_blocked) {
      hints.push({
        tone: 'ok',
        text: 'Read-only SQL policy: SELECT allowed; mutating statements rejected (same validator as query execution).'
      });
    } else {
      hints.push({
        tone: 'bad',
        text: 'Read-only SQL policy check failed unexpectedly.'
      });
    }
  }

  return (
    <ul className="connection-hints" aria-live="polite">
      {hints.map((h, i) => (
        <li key={`${i}-${h.text.slice(0, 48)}`} className={`connection-hints__row connection-hints__row--${h.tone}`}>
          {h.text}
        </li>
      ))}
    </ul>
  );
}
