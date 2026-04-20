import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

import { Redis } from '@upstash/redis';

import {
  fetchCredentialEnvelopeByTokenHash,
  isUsernameTakenInAppDb,
  updateCredentialEnvelopeByTokenHash
} from '@/lib/auth/appUsers';
import { CONFIG } from '@/lib/config';
import { normalizeMcpUsername } from '@/lib/mcpUsername';
import type { DBType, DatabaseCredentials } from '@/lib/types';

export { normalizeMcpUsername } from '@/lib/mcpUsername';

export type CredentialConnectionRecord = {
  name: string;
  label?: string;
  type: DBType;
  credentials: DatabaseCredentials;
  isDefault?: boolean;
};

export type CredentialGitHubProfile = {
  orgName?: string;
  allowedOrgs: string[];
  allowedRepos: string[];
  /** Fine-grained or classic PAT; encrypted at rest with the MCP bearer token */
  pat?: string;
};

export type CredentialProfile = {
  /** Lowercase normalized handle; unique while the token/username reservation exists */
  username?: string;
  /** Deprecated: use username */
  label?: string;
  createdAt: number;
  expiresAt: number;
  defaultConnection?: string;
  connections: CredentialConnectionRecord[];
  github?: CredentialGitHubProfile;
};

export type CredentialContext = {
  tokenHash: string;
  profile: CredentialProfile;
};

type StoredCredentialEnvelope = {
  expiresAt: number;
  payload: string;
};

/**
 * Upstash REST client auto-deserializes JSON string values from GET into objects.
 * We must accept both the raw string and the parsed object or JSON.parse(object) fails.
 */
function parseStoredCredentialEnvelope(raw: unknown): StoredCredentialEnvelope | null {
  if (raw == null) {
    return null;
  }

  if (typeof raw === 'object' && raw !== null && !Array.isArray(raw)) {
    const candidate = raw as Record<string, unknown>;
    if (typeof candidate.expiresAt === 'number' && typeof candidate.payload === 'string') {
      return {
        expiresAt: candidate.expiresAt,
        payload: candidate.payload
      };
    }

    return null;
  }

  if (typeof raw !== 'string') {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as unknown;
    return parseStoredCredentialEnvelope(parsed);
  } catch {
    return null;
  }
}

type CredentialConnectionSummary = {
  name: string;
  label?: string;
  type: DBType;
  is_default: boolean;
  expires_at: number;
  has_credentials: boolean;
};

const CREDENTIAL_TTL_SECONDS = Math.max(172800, Math.min(259200, Number(process.env.MCP_CREDENTIAL_TTL_SECONDS || '259200')));
const CREDENTIAL_KEY_PREFIX = 'mcp:credentials:v1:';
const USERNAME_KEY_PREFIX = 'mcp:username:v1:';

let redisClient: Redis | null | undefined;
const contextStorage = new AsyncLocalStorage<CredentialContext | null>();

function getRedisClient(): Redis | null {
  if (redisClient !== undefined) {
    return redisClient;
  }

  const url = process.env.UPSTASH_REDIS_REST_URL?.trim();
  const token = process.env.UPSTASH_REDIS_REST_TOKEN?.trim();

  if (!url || !token) {
    redisClient = null;
    return null;
  }

  redisClient = new Redis({ url, token });
  return redisClient;
}

function hashToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/** SHA-256 (hex) of the raw MCP bearer — used for Redis keys, Neon `mcp_token_hash`, and cache lines. */
export function hashMcpBearerToken(token: string): string {
  return hashToken(token);
}

function deriveTokenKey(token: string): Buffer {
  return crypto.createHash('sha256').update(`mcp-credentials:${token}`).digest();
}

function encryptProfile(token: string, profile: CredentialProfile): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', deriveTokenKey(token), iv);
  const body = Buffer.from(JSON.stringify(profile), 'utf8');
  const encrypted = Buffer.concat([cipher.update(body), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([iv, authTag, encrypted]).toString('base64url');
}

function decryptProfile(token: string, payload: string): CredentialProfile | null {
  try {
    const raw = Buffer.from(payload, 'base64url');
    if (raw.byteLength <= 28) {
      return null;
    }

    const iv = raw.subarray(0, 12);
    const authTag = raw.subarray(12, 28);
    const encrypted = raw.subarray(28);
    const decipher = crypto.createDecipheriv('aes-256-gcm', deriveTokenKey(token), iv);
    decipher.setAuthTag(authTag);

    const decrypted = Buffer.concat([decipher.update(encrypted), decipher.final()]);
    return JSON.parse(decrypted.toString('utf8')) as CredentialProfile;
  } catch {
    return null;
  }
}

function getCredentialKey(token: string): string {
  return `${CREDENTIAL_KEY_PREFIX}${hashToken(token)}`;
}

const MAX_GITHUB_PAT_LENGTH = 8000;

function normalizeGithubPat(value: string | undefined): string | undefined {
  const trimmed = value?.trim();
  if (!trimmed) {
    return undefined;
  }
  if (trimmed.length > MAX_GITHUB_PAT_LENGTH) {
    throw new Error(`GitHub PAT is too long (max ${MAX_GITHUB_PAT_LENGTH} characters).`);
  }
  return trimmed;
}

function sanitizeProfile(profile: CredentialProfile): CredentialProfile {
  const uniqueConnections = profile.connections.filter((connection, index, allConnections) =>
    allConnections.findIndex((entry) => entry.name === connection.name) === index
  );

  const githubPat = profile.github ? normalizeGithubPat(profile.github.pat) : undefined;

  const normalizedGitHub = profile.github
    ? {
        orgName: profile.github.orgName?.trim() || undefined,
        allowedOrgs: Array.from(new Set(profile.github.allowedOrgs.map((entry) => entry.trim()).filter(Boolean))),
        allowedRepos: Array.from(new Set(profile.github.allowedRepos.map((entry) => entry.trim()).filter(Boolean))),
        ...(githubPat ? { pat: githubPat } : {})
      }
    : undefined;

  const normalizedDefault = profile.defaultConnection?.trim() || uniqueConnections.find((entry) => entry.isDefault)?.name || uniqueConnections[0]?.name;

  const normalizedUsername =
    profile.username !== undefined && String(profile.username).trim() !== ''
      ? normalizeMcpUsername(String(profile.username))
      : undefined;

  return {
    ...profile,
    ...(normalizedUsername ? { username: normalizedUsername } : { username: undefined }),
    defaultConnection: normalizedDefault,
    connections: uniqueConnections.map((connection) => ({
      ...connection,
      name: connection.name.trim(),
      label: connection.label?.trim() || undefined,
      isDefault: connection.name === normalizedDefault || Boolean(connection.isDefault)
    })),
    github: normalizedGitHub
  };
}

function buildConnectionSummaries(profile: CredentialProfile): CredentialConnectionSummary[] {
  return profile.connections.map((connection) => ({
    name: connection.name,
    label: connection.label,
    type: connection.type,
    is_default: connection.name === (profile.defaultConnection || profile.connections[0]?.name),
    expires_at: profile.expiresAt,
    has_credentials: true
  }));
}

export function getCredentialContext(): CredentialContext | null {
  return contextStorage.getStore() ?? null;
}

export function withCredentialContext<T>(context: CredentialContext | null, work: () => T): T {
  if (!context) {
    return work();
  }

  return contextStorage.run(context, work);
}

export function resolveActiveCredentials(db: DBType, connection?: string): DatabaseCredentials {
  const context = getCredentialContext();
  if (!context) {
    throw new Error(`A valid credential token is required for ${db} connections.`);
  }

  const matchingConnections = context.profile.connections.filter((connection) => connection.type === db);
  if (matchingConnections.length === 0) {
    throw new Error(`No ${db} credentials are available for this token.`);
  }

  const requestedConnectionName = connection?.trim();
  if (requestedConnectionName) {
    const requestedConnection = matchingConnections.find((entry) => entry.name === requestedConnectionName);
    if (!requestedConnection) {
      const availableConnections = matchingConnections.map((entry) => entry.name).join(', ');
      throw new Error(`Unknown ${db} connection "${requestedConnectionName}". Available: ${availableConnections}.`);
    }

    return requestedConnection.credentials;
  }

  const defaultConnectionName = context.profile.defaultConnection;
  const preferredConnection = defaultConnectionName
    ? matchingConnections.find((connection) => connection.name === defaultConnectionName)
    : undefined;

  if (db === 'postgres' && matchingConnections.length > 1 && !preferredConnection) {
    const availableConnections = matchingConnections.map((connection) => connection.name).join(', ');
    throw new Error(`Multiple Postgres connections are available for this token. Use the connection field. Available: ${availableConnections}.`);
  }

  if (matchingConnections.length === 1) {
    return matchingConnections[0].credentials;
  }

  return (preferredConnection ?? matchingConnections[0]).credentials;
}

export type CreateCredentialTokenOptions = {
  /** When true (account bootstrap), empty connections are allowed until the user adds DBs in the dashboard. */
  allowEmptyConnections?: boolean;
};

export async function createCredentialToken(
  profile: Omit<CredentialProfile, 'createdAt' | 'expiresAt'>,
  options?: CreateCredentialTokenOptions
): Promise<{ token: string; expiresAt: number; credentialEnvelopeJson: string }> {
  const client = getRedisClient();
  if (!client) {
    throw new Error('Token storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
  }

  if (!options?.allowEmptyConnections && (!profile.connections || profile.connections.length === 0)) {
    throw new Error('At least one database connection is required.');
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const tokenHashHex = hashToken(token);
  const expiresAt = Date.now() + CREDENTIAL_TTL_SECONDS * 1000;

  if (!profile.username?.trim()) {
    throw new Error('Username is required.');
  }

  const preSanitized = sanitizeProfile({
    ...profile,
    createdAt: Date.now(),
    expiresAt
  });

  const resolvedUsername = preSanitized.username;
  if (!resolvedUsername) {
    throw new Error(
      'Invalid username. Use 3–32 characters: start with a letter, then letters, digits, hyphen, or underscore only.'
    );
  }

  const usernameRedisKey = `${USERNAME_KEY_PREFIX}${resolvedUsername}`;
  let reservedUsername = false;

  try {
    const reserved = await client.set(usernameRedisKey, tokenHashHex, {
      nx: true,
      ex: CREDENTIAL_TTL_SECONDS
    });

    if (!reserved) {
      throw new Error(
        'That username is already taken. Pick another username, or wait until the existing token for that name expires.'
      );
    }

    reservedUsername = true;

    const envelope: StoredCredentialEnvelope = {
      expiresAt,
      payload: encryptProfile(token, preSanitized)
    };

    const envelopeJson = JSON.stringify(envelope);
    await client.set(getCredentialKey(token), envelopeJson, { ex: CREDENTIAL_TTL_SECONDS });

    return { token, expiresAt, credentialEnvelopeJson: envelopeJson };
  } catch (error) {
    if (reservedUsername) {
      await client.del(usernameRedisKey).catch(() => undefined);
    }

    throw error;
  }
}

export async function deleteStoredCredential(token: string): Promise<void> {
  const client = getRedisClient();
  if (!client) {
    return;
  }

  const credentialKey = getCredentialKey(token);
  const raw = await client.get(credentialKey);
  let username: string | undefined;

  const envelope = parseStoredCredentialEnvelope(raw);
  if (envelope?.payload) {
    const profile = decryptProfile(token, envelope.payload);
    username = profile?.username ?? undefined;
  }

  await client.del(credentialKey).catch(() => undefined);

  if (username) {
    await client.del(`${USERNAME_KEY_PREFIX}${username}`).catch(() => undefined);
  }
}

export async function replaceStoredCredentialProfile(
  token: string,
  nextProfile: Omit<CredentialProfile, 'createdAt' | 'expiresAt'>,
  options?: { clearGithub?: boolean }
): Promise<{ expiresAt: number }> {
  const client = getRedisClient();
  if (!client) {
    throw new Error('Token storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
  }

  const credentialKey = getCredentialKey(token);
  const raw = await client.get(credentialKey);
  const envelope = parseStoredCredentialEnvelope(raw);

  if (!envelope?.payload) {
    throw new Error('Unknown or expired MCP token.');
  }

  const existing = decryptProfile(token, envelope.payload);
  if (!existing) {
    throw new Error('Could not decrypt stored credential profile.');
  }

  const expiresAt = Date.now() + CREDENTIAL_TTL_SECONDS * 1000;

  const merged = sanitizeProfile({
    ...nextProfile,
    username: existing.username ?? nextProfile.username,
    connections: nextProfile.connections ?? existing.connections,
    github: options?.clearGithub ? undefined : nextProfile.github !== undefined ? nextProfile.github : existing.github,
    createdAt: existing.createdAt,
    expiresAt
  });

  const nextEnvelope: StoredCredentialEnvelope = { expiresAt, payload: encryptProfile(token, merged) };
  const envelopeJson = JSON.stringify(nextEnvelope);

  await client.set(credentialKey, envelopeJson, {
    ex: CREDENTIAL_TTL_SECONDS
  });

  const usernameKey = merged.username ? `${USERNAME_KEY_PREFIX}${merged.username}` : '';
  if (merged.username) {
    await client.set(usernameKey, hashToken(token), { ex: CREDENTIAL_TTL_SECONDS });
  }

  try {
    await updateCredentialEnvelopeByTokenHash(hashToken(token), envelopeJson);
  } catch (error) {
    console.error('[credentials] Neon envelope update failed (Redis cache still updated)', error);
  }

  return { expiresAt };
}

export type UsernameAvailabilityStatus = 'invalid' | 'available' | 'taken' | 'unknown';

/**
 * Checks whether a workspace name is free. Uses the same Redis key as token creation
 * (`mcp:username:v1:{normalized}`): if the key exists, another active token already holds that name.
 */
export async function checkMcpUsernameAvailability(raw: string): Promise<{
  normalized: string | null;
  status: UsernameAvailabilityStatus;
}> {
  const trimmed = raw.trim();
  if (!trimmed) {
    return { normalized: null, status: 'invalid' };
  }

  const normalized = normalizeMcpUsername(trimmed);
  if (!normalized) {
    return { normalized: null, status: 'invalid' };
  }

  try {
    if (await isUsernameTakenInAppDb(normalized)) {
      return { normalized, status: 'taken' };
    }
  } catch {
    /* Neon unavailable — ignore username collision check */
  }

  const client = getRedisClient();
  if (!client) {
    return { normalized, status: 'unknown' };
  }

  try {
    const key = `${USERNAME_KEY_PREFIX}${normalized}`;
    const existsCount = await client.exists(key);
    return { normalized, status: existsCount >= 1 ? 'taken' : 'available' };
  } catch {
    return { normalized, status: 'unknown' };
  }
}

export async function resolveCredentialContext(token: string): Promise<CredentialContext | null> {
  const credentialKey = getCredentialKey(token);
  const tokenHashHex = hashToken(token);

  const client = getRedisClient();
  let raw: unknown = null;

  if (client) {
    raw = await client.get(credentialKey);
  }

  if (raw == null || raw === '') {
    try {
      const fromPg = await fetchCredentialEnvelopeByTokenHash(tokenHashHex);
      if (fromPg) {
        raw = fromPg;
        if (client) {
          await client.set(credentialKey, fromPg, { ex: CREDENTIAL_TTL_SECONDS }).catch(() => undefined);
        }
      }
    } catch (error) {
      console.error('[credentials] Neon credential fallback failed', error);
    }
  }

  if (raw == null || raw === '') {
    return null;
  }

  const envelope = parseStoredCredentialEnvelope(raw);
  if (!envelope?.payload || envelope.expiresAt <= Date.now()) {
    return null;
  }

  const profile = decryptProfile(token, envelope.payload);
  if (!profile || profile.expiresAt <= Date.now()) {
    return null;
  }

  return {
    tokenHash: tokenHashHex,
    profile
  };
}

export function listContextConnections(): CredentialConnectionSummary[] {
  const context = getCredentialContext();
  if (!context) {
    return [];
  }

  return buildConnectionSummaries(context.profile);
}

export function getContextDefaultConnection(): string | null {
  const context = getCredentialContext();
  if (!context) {
    return null;
  }

  return context.profile.defaultConnection || context.profile.connections[0]?.name || null;
}

export function getCredentialTtlSeconds(): number {
  return CREDENTIAL_TTL_SECONDS;
}

export function buildStaticConnectionSummaries(): CredentialConnectionSummary[] {
  const summaries: CredentialConnectionSummary[] = [];

  if (Object.keys(CONFIG.postgres.connections).length > 0) {
    for (const [name] of Object.entries(CONFIG.postgres.connections)) {
      summaries.push({
        name,
        type: 'postgres',
        label: undefined,
        is_default: name === CONFIG.postgres.defaultConnection,
        expires_at: 0,
        has_credentials: true
      });
    }
  }

  if (CONFIG.mssql.connectionString.trim()) {
    summaries.push({
      name: 'default',
      type: 'mssql',
      label: undefined,
      is_default: true,
      expires_at: 0,
      has_credentials: true
    });
  }

  if (process.env.MYSQL_HOST?.trim() || process.env.MYSQL_DATABASE?.trim()) {
    summaries.push({
      name: 'default',
      type: 'mysql',
      label: undefined,
      is_default: true,
      expires_at: 0,
      has_credentials: true
    });
  }

  if (process.env.SQLITE_PATH?.trim()) {
    summaries.push({
      name: 'default',
      type: 'sqlite',
      label: undefined,
      is_default: true,
      expires_at: 0,
      has_credentials: true
    });
  }

  return summaries;
}

export function buildCredentialProfileSummary(profile: CredentialProfile): {
  username: string | null;
  created_at: number;
  expires_at: number;
  default_connection: string | null;
  total: number;
  connections: CredentialConnectionSummary[];
  github?: Omit<CredentialGitHubProfile, 'pat'> & { has_github_pat: boolean };
} {
  const gh = profile.github;
  return {
    username: profile.username ?? null,
    created_at: profile.createdAt,
    expires_at: profile.expiresAt,
    default_connection: profile.defaultConnection || profile.connections[0]?.name || null,
    total: profile.connections.length,
    connections: buildConnectionSummaries(profile),
    ...(gh
      ? {
          github: {
            orgName: gh.orgName,
            allowedOrgs: gh.allowedOrgs,
            allowedRepos: gh.allowedRepos,
            has_github_pat: Boolean(gh.pat?.trim())
          }
        }
      : {})
  };
}