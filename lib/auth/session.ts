import crypto from 'node:crypto';

import { cookies } from 'next/headers';

const COOKIE_NAME = 'db_mcp_session';
const SESSION_TTL_MS = 14 * 24 * 60 * 60 * 1000;

function requireSessionSecret(): string {
  const raw = process.env.APP_ACCOUNT_SECRET?.trim();
  if (!raw || raw.length < 16) {
    throw new Error('APP_ACCOUNT_SECRET is required for dashboard sessions.');
  }

  return raw;
}

export type SessionPayload = {
  sub: string;
  exp: number;
};

function signPayload(payload: SessionPayload): string {
  const body = Buffer.from(JSON.stringify(payload), 'utf8').toString('base64url');
  const sig = crypto.createHmac('sha256', requireSessionSecret()).update(body).digest('base64url');
  return `${body}.${sig}`;
}

function verifySignedSession(token: string): SessionPayload | null {
  const dot = token.indexOf('.');
  if (dot === -1) {
    return null;
  }

  const body = token.slice(0, dot);
  const sig = token.slice(dot + 1);
  const expected = crypto.createHmac('sha256', requireSessionSecret()).update(body).digest('base64url');

  try {
    const a = Buffer.from(sig, 'utf8');
    const b = Buffer.from(expected, 'utf8');
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
      return null;
    }
  } catch {
    return null;
  }

  try {
    const parsed = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as SessionPayload;
    if (typeof parsed.sub !== 'string' || typeof parsed.exp !== 'number') {
      return null;
    }

    if (parsed.exp <= Date.now()) {
      return null;
    }

    return parsed;
  } catch {
    return null;
  }
}

export async function createSessionCookie(userId: string): Promise<void> {
  const payload: SessionPayload = {
    sub: userId,
    exp: Date.now() + SESSION_TTL_MS
  };

  const value = signPayload(payload);
  const jar = await cookies();

  jar.set(COOKIE_NAME, value, {
    httpOnly: true,
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
    path: '/',
    maxAge: Math.floor(SESSION_TTL_MS / 1000)
  });
}

export async function clearSessionCookie(): Promise<void> {
  const jar = await cookies();
  jar.set(COOKIE_NAME, '', { httpOnly: true, path: '/', maxAge: 0 });
}

export async function readSessionUserId(): Promise<string | null> {
  try {
    const jar = await cookies();
    const raw = jar.get(COOKIE_NAME)?.value;
    if (!raw) {
      return null;
    }

    const payload = verifySignedSession(raw);
    return payload?.sub ?? null;
  } catch {
    return null;
  }
}
