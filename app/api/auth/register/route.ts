import { NextResponse } from 'next/server';

import {
  checkMcpUsernameAvailability,
  createCredentialToken,
  deleteStoredCredential,
  getCredentialTtlSeconds,
  hashMcpBearerToken,
  type CredentialGitHubProfile
} from '@/lib/auth/credentials';
import { encryptSecretForStorage } from '@/lib/auth/accountCrypto';
import { hashPassword } from '@/lib/auth/password';
import { createSessionCookie } from '@/lib/auth/session';
import { createAppUser, isEmailTaken, isUsernameTakenInAppDb } from '@/lib/auth/appUsers';
import { normalizeDefaultConnectionForInputs, mapTokenInputsToCredentialRecords } from '@/lib/credentials/connectionMapping';
import { parseTokenConnectionInput, type TokenConnectionInput } from '@/lib/credentials/tokenConnection';
import { normalizeMcpUsername } from '@/lib/mcpUsername';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function normalizeGitHub(payload: unknown): CredentialGitHubProfile | undefined {
  if (!payload || typeof payload !== 'object') {
    return undefined;
  }

  const candidate = payload as { orgName?: unknown; allowedOrgs?: unknown; allowedRepos?: unknown; pat?: unknown };

  return {
    orgName: typeof candidate.orgName === 'string' ? candidate.orgName.trim() || undefined : undefined,
    allowedOrgs: normalizeList(candidate.allowedOrgs),
    allowedRepos: normalizeList(candidate.allowedRepos),
    pat: typeof candidate.pat === 'string' ? candidate.pat.trim() || undefined : undefined
  };
}

function basicEmailOk(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

export async function POST(request: Request) {
  try {
    const raw = await request.json();

    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid JSON.', data: null }, { status: 400 });
    }

    const body = raw as {
      email?: unknown;
      password?: unknown;
      username?: unknown;
      defaultConnection?: unknown;
      connections?: unknown;
      github?: unknown;
    };

    const email = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    const usernameRaw = typeof body.username === 'string' ? body.username.trim() : '';

    if (!email || !basicEmailOk(email)) {
      return NextResponse.json({ success: false, error: 'Provide a valid email address.', data: null }, { status: 400 });
    }

    if (password.length < 10) {
      return NextResponse.json({ success: false, error: 'Password must be at least 10 characters.', data: null }, { status: 400 });
    }

    const normalizedUsername = normalizeMcpUsername(usernameRaw);
    if (!normalizedUsername) {
      return NextResponse.json(
        {
          success: false,
          error: 'Workspace name must be 3–32 characters; start with a letter; letters, digits, hyphen, underscore only.',
          data: null
        },
        { status: 400 }
      );
    }

    const rawConnectionInputs = Array.isArray(body.connections) ? body.connections : [];
    const connectionsParsed = rawConnectionInputs
      .map((entry) => parseTokenConnectionInput(entry))
      .filter((entry): entry is TokenConnectionInput => entry !== null);

    if (rawConnectionInputs.length > 0 && connectionsParsed.length === 0) {
      return NextResponse.json(
        { success: false, error: 'Each connection must include valid name, db, and credential fields.', data: null },
        { status: 400 }
      );
    }

    const allowEmptyConnections = connectionsParsed.length === 0;

    if (await isEmailTaken(email)) {
      return NextResponse.json({ success: false, error: 'That email is already registered.', data: null }, { status: 409 });
    }

    if (await isUsernameTakenInAppDb(normalizedUsername)) {
      return NextResponse.json({ success: false, error: 'That workspace name is already registered to an account.', data: null }, { status: 409 });
    }

    const avail = await checkMcpUsernameAvailability(normalizedUsername);
    if (avail.status === 'taken') {
      return NextResponse.json(
        {
          success: false,
          error:
            'That workspace name is reserved by an active token. Pick another name or wait until it expires (anonymous token generator).',
          data: null
        },
        { status: 409 }
      );
    }

    const defaultConnection =
      connectionsParsed.length > 0
        ? normalizeDefaultConnectionForInputs(
            connectionsParsed,
            typeof body.defaultConnection === 'string' ? body.defaultConnection : undefined
          )
        : 'main';

    const records = connectionsParsed.length > 0 ? mapTokenInputsToCredentialRecords(connectionsParsed, defaultConnection) : [];

    const gh = normalizeGitHub(body.github);

    const { token, expiresAt, credentialEnvelopeJson } = await createCredentialToken(
      {
        username: normalizedUsername,
        defaultConnection,
        connections: records,
        github: gh
      },
      { allowEmptyConnections }
    );

    let createdUserId: string;

    try {
      const userRow = await createAppUser({
        email,
        username: normalizedUsername,
        passwordHash: hashPassword(password),
        mcpTokenCipher: encryptSecretForStorage(token),
        mcpTokenHash: hashMcpBearerToken(token),
        credentialEnvelopeJson
      });
      createdUserId = userRow.id;
    } catch (error) {
      await deleteStoredCredential(token);

      const message = error instanceof Error ? error.message : '';
      if (message.toLowerCase().includes('unique')) {
        return NextResponse.json({ success: false, error: 'Email or workspace name is already registered.', data: null }, { status: 409 });
      }

      throw error;
    }

    await createSessionCookie(createdUserId);

    const aliasesByType = records.reduce<Record<string, string[]>>((accumulator, connection) => {
      if (!accumulator[connection.type]) {
        accumulator[connection.type] = [];
      }

      accumulator[connection.type].push(connection.name);
      return accumulator;
    }, {});

    return NextResponse.json(
      {
        success: true,
        error: null,
        data: {
          email,
          username: normalizedUsername,
          token,
          token_type: 'Bearer',
          expires_at: expiresAt,
          expires_in_seconds: getCredentialTtlSeconds(),
          default_connection: defaultConnection,
          total_connections: records.length,
          aliases_by_type: aliasesByType,
          github: gh
            ? {
                org_name: gh.orgName,
                allowed_orgs: gh.allowedOrgs,
                allowed_repos: gh.allowedRepos,
                has_github_pat: Boolean(gh.pat)
              }
            : null
        }
      },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Registration failed.';
    const lower = message.toLowerCase();

    if (
      lower.includes('app_account_secret') ||
      lower.includes('token storage is not configured') ||
      lower.includes('upstash')
    ) {
      return NextResponse.json({ success: false, error: message, data: null }, { status: 503 });
    }

    if (lower.includes('already taken')) {
      return NextResponse.json({ success: false, error: message, data: null }, { status: 409 });
    }

    return NextResponse.json({ success: false, error: message, data: null }, { status: 500 });
  }
}
