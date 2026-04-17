import crypto from 'node:crypto';
import { AsyncLocalStorage } from 'node:async_hooks';

import { Redis } from '@upstash/redis';

import { CONFIG } from '@/lib/config';
import type { DBType, DatabaseCredentials } from '@/lib/types';

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
};

export type CredentialProfile = {
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

function sanitizeProfile(profile: CredentialProfile): CredentialProfile {
  const uniqueConnections = profile.connections.filter((connection, index, allConnections) =>
    allConnections.findIndex((entry) => entry.name === connection.name) === index
  );

  const normalizedGitHub = profile.github
    ? {
        orgName: profile.github.orgName?.trim() || undefined,
        allowedOrgs: Array.from(new Set(profile.github.allowedOrgs.map((entry) => entry.trim()).filter(Boolean))),
        allowedRepos: Array.from(new Set(profile.github.allowedRepos.map((entry) => entry.trim()).filter(Boolean)))
      }
    : undefined;

  const normalizedDefault = profile.defaultConnection?.trim() || uniqueConnections.find((entry) => entry.isDefault)?.name || uniqueConnections[0]?.name;

  return {
    ...profile,
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

export function resolveActiveCredentials(db: DBType): DatabaseCredentials {
  const context = getCredentialContext();
  if (!context) {
    throw new Error(`A valid credential token is required for ${db} connections.`);
  }

  const matchingConnections = context.profile.connections.filter((connection) => connection.type === db);
  if (matchingConnections.length === 0) {
    throw new Error(`No ${db} credentials are available for this token.`);
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

export async function createCredentialToken(profile: Omit<CredentialProfile, 'createdAt' | 'expiresAt'>): Promise<{ token: string; expiresAt: number }> {
  const client = getRedisClient();
  if (!client) {
    throw new Error('Token storage is not configured. Set UPSTASH_REDIS_REST_URL and UPSTASH_REDIS_REST_TOKEN.');
  }

  const token = crypto.randomBytes(32).toString('base64url');
  const expiresAt = Date.now() + CREDENTIAL_TTL_SECONDS * 1000;
  const normalizedProfile = sanitizeProfile({
    ...profile,
    createdAt: Date.now(),
    expiresAt
  });

  const envelope: StoredCredentialEnvelope = {
    expiresAt,
    payload: encryptProfile(token, normalizedProfile)
  };

  await client.set(getCredentialKey(token), JSON.stringify(envelope), { ex: CREDENTIAL_TTL_SECONDS });

  return { token, expiresAt };
}

export async function resolveCredentialContext(token: string): Promise<CredentialContext | null> {
  const client = getRedisClient();
  if (!client) {
    return null;
  }

  const raw = await client.get<string>(getCredentialKey(token));
  if (!raw) {
    return null;
  }

  try {
    const envelope = JSON.parse(raw) as StoredCredentialEnvelope;
    if (!envelope?.payload || typeof envelope.expiresAt !== 'number' || envelope.expiresAt <= Date.now()) {
      return null;
    }

    const profile = decryptProfile(token, envelope.payload);
    if (!profile || profile.expiresAt <= Date.now()) {
      return null;
    }

    return {
      tokenHash: hashToken(token),
      profile
    };
  } catch {
    return null;
  }
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
  created_at: number;
  expires_at: number;
  default_connection: string | null;
  total: number;
  connections: CredentialConnectionSummary[];
  github?: CredentialGitHubProfile;
} {
  return {
    created_at: profile.createdAt,
    expires_at: profile.expiresAt,
    default_connection: profile.defaultConnection || profile.connections[0]?.name || null,
    total: profile.connections.length,
    connections: buildConnectionSummaries(profile),
    github: profile.github
  };
}