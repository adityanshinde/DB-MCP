import { NextResponse } from 'next/server';

import {
  replaceStoredCredentialProfile,
  resolveCredentialContext,
  type CredentialGitHubProfile
} from '@/lib/auth/credentials';
import { decryptSecretForStorage } from '@/lib/auth/accountCrypto';
import { readSessionUserId } from '@/lib/auth/session';
import { getUserById } from '@/lib/auth/appUsers';
import { normalizeDefaultConnectionForInputs, mapTokenInputsToCredentialRecords } from '@/lib/credentials/connectionMapping';
import { parseTokenConnectionInput, type TokenConnectionInput } from '@/lib/credentials/tokenConnection';

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

export async function PUT(request: Request) {
  try {
    const userId = await readSessionUserId();
    if (!userId) {
      return NextResponse.json({ success: false, error: 'Not signed in.', data: null }, { status: 401 });
    }

    const user = await getUserById(userId);
    if (!user) {
      return NextResponse.json({ success: false, error: 'Account not found.', data: null }, { status: 401 });
    }

    let mcpToken: string;
    try {
      mcpToken = decryptSecretForStorage(user.mcp_token_cipher);
    } catch {
      return NextResponse.json({ success: false, error: 'Could not decrypt stored MCP token.', data: null }, { status: 503 });
    }

    const ctx = await resolveCredentialContext(mcpToken);
    if (!ctx) {
      return NextResponse.json(
        { success: false, error: 'MCP credential expired in Redis; profile cannot be updated.', data: null },
        { status: 410 }
      );
    }

    const raw = await request.json();
    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid JSON.', data: null }, { status: 400 });
    }

    const body = raw as {
      defaultConnection?: unknown;
      connections?: unknown;
      github?: unknown;
    };

    const connectionsProvided = body.connections !== undefined && body.connections !== null;

    let records: ReturnType<typeof mapTokenInputsToCredentialRecords>;
    let defaultConnection: string;

    if (connectionsProvided) {
      const rawConnections = Array.isArray(body.connections) ? body.connections : [];
      const parsedConnections = rawConnections
        .map((entry) => parseTokenConnectionInput(entry))
        .filter((entry): entry is TokenConnectionInput => entry !== null);

      if (parsedConnections.length === 0) {
        return NextResponse.json(
          { success: false, error: 'Provide at least one valid database connection.', data: null },
          { status: 400 }
        );
      }

      defaultConnection = normalizeDefaultConnectionForInputs(
        parsedConnections,
        typeof body.defaultConnection === 'string' ? body.defaultConnection : undefined
      );

      records = mapTokenInputsToCredentialRecords(parsedConnections, defaultConnection);
    } else {
      records = ctx.profile.connections;
      if (records.length === 0) {
        return NextResponse.json(
          { success: false, error: 'No connections in profile; add connections before updating GitHub only.', data: null },
          { status: 400 }
        );
      }

      defaultConnection =
        typeof body.defaultConnection === 'string' && body.defaultConnection.trim()
          ? body.defaultConnection.trim()
          : ctx.profile.defaultConnection || records[0]?.name.trim() || 'main';
    }

    const prevPat = ctx.profile.github?.pat?.trim();

    let githubNext: CredentialGitHubProfile | undefined;
    let clearGithub = false;

    if (body.github !== undefined && body.github !== null) {
      if (typeof body.github !== 'object') {
        return NextResponse.json({ success: false, error: 'Invalid github object.', data: null }, { status: 400 });
      }

      const candidate = body.github as { orgName?: unknown; allowedOrgs?: unknown; allowedRepos?: unknown; pat?: unknown };

      githubNext = {
        orgName: typeof candidate.orgName === 'string' ? candidate.orgName.trim() || undefined : undefined,
        allowedOrgs: normalizeList(candidate.allowedOrgs),
        allowedRepos: normalizeList(candidate.allowedRepos),
        pat:
          typeof candidate.pat === 'string' && candidate.pat.trim()
            ? candidate.pat.trim()
            : prevPat || undefined
      };
    } else if (body.github === null) {
      clearGithub = true;
    } else {
      githubNext = ctx.profile.github;
    }

    await replaceStoredCredentialProfile(mcpToken, {
      username: user.username,
      defaultConnection,
      connections: records,
      github: githubNext
    }, { clearGithub });

    const nextCtx = await resolveCredentialContext(mcpToken);

    return NextResponse.json({
      success: true,
      error: null,
      data: {
        username: user.username,
        expires_at: nextCtx?.profile.expiresAt ?? null,
        total_connections: records.length,
        default_connection: defaultConnection
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Update failed.';
    return NextResponse.json({ success: false, error: message, data: null }, { status: 500 });
  }
}
