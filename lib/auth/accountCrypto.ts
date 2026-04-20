import crypto from 'node:crypto';

function requireAccountSecret(): string {
  const raw = process.env.APP_ACCOUNT_SECRET?.trim();
  if (!raw || raw.length < 16) {
    throw new Error(
      'APP_ACCOUNT_SECRET is required for accounts (set a long random string of at least 16 characters in the environment).'
    );
  }

  return raw;
}

function deriveStorageKey(): Buffer {
  return crypto.createHash('sha256').update(`db-mcp-account-at-rest:${requireAccountSecret()}`).digest();
}

export function encryptSecretForStorage(plaintext: string): string {
  const key = deriveStorageKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const body = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, body]).toString('base64url');
}

export function decryptSecretForStorage(payload: string): string {
  const key = deriveStorageKey();
  const raw = Buffer.from(payload, 'base64url');
  if (raw.byteLength <= 28) {
    throw new Error('Invalid stored secret.');
  }

  const iv = raw.subarray(0, 12);
  const tag = raw.subarray(12, 28);
  const encrypted = raw.subarray(28);
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}
