import { randomUUID } from 'node:crypto';

import { Pool } from 'pg';

export type AppUserRow = {
  id: string;
  email: string;
  username: string;
  password_hash: string;
  mcp_token_cipher: string;
  mcp_token_hash: string;
  credential_envelope_json: string;
  created_at: Date;
};

function getDatabaseUrl(): string {
  const url =
    process.env.DATABASE_URL?.trim() ||
    process.env.NEON_DATABASE_URL?.trim() ||
    process.env.APP_DATABASE_URL?.trim();

  if (!url) {
    throw new Error(
      'DATABASE_URL or NEON_DATABASE_URL must be set (Neon PostgreSQL connection string) for accounts and persisted MCP credentials.'
    );
  }

  return url;
}

let pool: Pool | null = null;
let schemaReady: Promise<void> | null = null;

export function getAccountsPool(): Pool {
  if (!pool) {
    pool = new Pool({
      connectionString: getDatabaseUrl(),
      max: Math.min(10, Number(process.env.APP_DATABASE_POOL_MAX || '10')),
      idleTimeoutMillis: 30_000,
      connectionTimeoutMillis: 10_000
    });
  }

  return pool;
}

async function ensureSchema(target: Pool): Promise<void> {
  await target.query(`
    CREATE TABLE IF NOT EXISTS app_users (
      id TEXT PRIMARY KEY,
      email TEXT UNIQUE NOT NULL,
      username TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      mcp_token_cipher TEXT NOT NULL,
      mcp_token_hash TEXT UNIQUE NOT NULL,
      credential_envelope_json TEXT NOT NULL,
      created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
      updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);

  await target.query(`CREATE INDEX IF NOT EXISTS idx_app_users_username ON app_users(username)`);
  await target.query(`CREATE INDEX IF NOT EXISTS idx_app_users_email_lower ON app_users(lower(email))`);
}

export async function withAccountsReady<T>(work: () => Promise<T>): Promise<T> {
  const p = getAccountsPool();
  if (!schemaReady) {
    schemaReady = ensureSchema(p).catch((error) => {
      schemaReady = null;
      throw error;
    });
  }

  await schemaReady;
  return work();
}

export async function isUsernameTakenInAppDb(normalizedUsername: string): Promise<boolean> {
  try {
    return await withAccountsReady(async () => {
      const p = getAccountsPool();
      const result = await p.query<{ c: string }>('SELECT COUNT(1)::text AS c FROM app_users WHERE username = $1', [
        normalizedUsername
      ]);
      const row = result.rows[0];
      return Boolean(row && Number(row.c) >= 1);
    });
  } catch {
    return false;
  }
}

export async function isEmailTaken(email: string): Promise<boolean> {
  return withAccountsReady(async () => {
    const p = getAccountsPool();
    const result = await p.query<{ c: string }>(
      'SELECT COUNT(1)::text AS c FROM app_users WHERE lower(email) = lower($1)',
      [email.trim()]
    );
    const row = result.rows[0];
    return Boolean(row && Number(row.c) >= 1);
  });
}

export async function createAppUser(input: {
  email: string;
  username: string;
  passwordHash: string;
  mcpTokenCipher: string;
  mcpTokenHash: string;
  credentialEnvelopeJson: string;
}): Promise<AppUserRow> {
  return withAccountsReady(async () => {
    const p = getAccountsPool();
    const id = randomUUID();

    await p.query(
      `INSERT INTO app_users (id, email, username, password_hash, mcp_token_cipher, mcp_token_hash, credential_envelope_json)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [
        id,
        input.email.trim().toLowerCase(),
        input.username,
        input.passwordHash,
        input.mcpTokenCipher,
        input.mcpTokenHash,
        input.credentialEnvelopeJson
      ]
    );

    const loaded = await getUserById(id);
    if (!loaded) {
      throw new Error('Failed to load user after insert.');
    }

    return loaded;
  });
}

export async function getUserByEmail(email: string): Promise<AppUserRow | undefined> {
  return withAccountsReady(async () => {
    const p = getAccountsPool();
    const result = await p.query<AppUserRow>('SELECT * FROM app_users WHERE lower(email) = lower($1) LIMIT 1', [
      email.trim()
    ]);
    return result.rows[0];
  });
}

export async function getUserById(id: string): Promise<AppUserRow | undefined> {
  return withAccountsReady(async () => {
    const p = getAccountsPool();
    const result = await p.query<AppUserRow>('SELECT * FROM app_users WHERE id = $1 LIMIT 1', [id]);
    return result.rows[0];
  });
}

/** Load encrypted MCP envelope by bearer hash (same as Redis key suffix). Used for cache miss → Neon → warm Redis. */
export async function fetchCredentialEnvelopeByTokenHash(tokenHashHex: string): Promise<string | null> {
  return withAccountsReady(async () => {
    const p = getAccountsPool();
    const result = await p.query<{ credential_envelope_json: string }>(
      'SELECT credential_envelope_json FROM app_users WHERE mcp_token_hash = $1 LIMIT 1',
      [tokenHashHex]
    );
    return result.rows[0]?.credential_envelope_json ?? null;
  });
}

/** Persist updated envelope after dashboard save (authoritative copy in Neon). */
export async function updateCredentialEnvelopeByTokenHash(tokenHashHex: string, credentialEnvelopeJson: string): Promise<boolean> {
  return withAccountsReady(async () => {
    const p = getAccountsPool();
    const result = await p.query(
      `UPDATE app_users SET credential_envelope_json = $1, updated_at = NOW() WHERE mcp_token_hash = $2`,
      [credentialEnvelopeJson, tokenHashHex]
    );
    return (result.rowCount ?? 0) >= 1;
  });
}

/** Registration rollback: remove row if INSERT succeeded but a later step failed. */
export async function deleteUserByTokenHash(tokenHashHex: string): Promise<void> {
  await withAccountsReady(async () => {
    const p = getAccountsPool();
    await p.query('DELETE FROM app_users WHERE mcp_token_hash = $1', [tokenHashHex]);
  });
}
