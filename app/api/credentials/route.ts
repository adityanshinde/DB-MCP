import { NextResponse } from 'next/server';

import { createCredentialToken, getCredentialTtlSeconds } from '@/lib/auth/credentials';
import {
  parseTokenConnectionInput,
  tokenInputToDatabaseCredentials,
  type TokenConnectionInput
} from '@/lib/credentials/tokenConnection';
import { normalizeMcpUsername } from '@/lib/mcpUsername';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type GitHubProfileInput = {
  orgName?: string;
  allowedOrgs?: string[];
  allowedRepos?: string[];
  /** Stored encrypted with the MCP bearer token; never returned in API responses */
  pat?: string;
};

type GitHubProfileSummary = {
  org_name?: string;
  allowed_orgs: string[];
  allowed_repos: string[];
  has_github_pat: boolean;
};

function normalizeList(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value
    .filter((entry): entry is string => typeof entry === 'string')
    .map((entry) => entry.trim())
    .filter(Boolean);
}

function validateRequest(body: unknown): {
  username: string;
  defaultConnection?: string;
  connections: TokenConnectionInput[];
  github?: GitHubProfileInput;
} | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const payload = body as {
    username?: unknown;
    label?: unknown;
    defaultConnection?: unknown;
    connections?: unknown;
    github?: unknown;
  };

  const usernameRaw =
    (typeof payload.username === 'string' && payload.username.trim()) ||
    (typeof payload.label === 'string' && payload.label.trim()) ||
    '';

  if (!usernameRaw || !normalizeMcpUsername(usernameRaw)) {
    return null;
  }

  if (!Array.isArray(payload.connections) || payload.connections.length === 0) {
    return null;
  }

  const connections = payload.connections.map((entry) => parseTokenConnectionInput(entry)).filter((entry): entry is TokenConnectionInput => entry !== null);

  if (connections.length === 0) {
    return null;
  }

  let github: GitHubProfileInput | undefined;
  if (payload.github && typeof payload.github === 'object') {
    const candidate = payload.github as { orgName?: unknown; allowedOrgs?: unknown; allowedRepos?: unknown; pat?: unknown };
    github = {
      orgName: typeof candidate.orgName === 'string' ? candidate.orgName.trim() || undefined : undefined,
      allowedOrgs: normalizeList(candidate.allowedOrgs),
      allowedRepos: normalizeList(candidate.allowedRepos),
      pat: typeof candidate.pat === 'string' ? candidate.pat.trim() || undefined : undefined
    };
  }

  return {
    username: usernameRaw,
    defaultConnection: typeof payload.defaultConnection === 'string' ? payload.defaultConnection.trim() || undefined : undefined,
    connections,
    github
  };
}

function normalizeDefaultConnection(connections: TokenConnectionInput[], requestedDefault?: string): string {
  if (requestedDefault) {
    return requestedDefault;
  }

  const explicitDefault = connections.find((connection) => connection.isDefault)?.name;
  if (explicitDefault) {
    return explicitDefault;
  }

  return connections[0].name;
}

export async function POST(request: Request) {
  try {
    const body = validateRequest(await request.json());
    if (!body) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Provide "username" (3–32 characters; start with a letter; letters, digits, hyphen, underscore only) and a non-empty connections array.',
          data: null
        },
        { status: 400 }
      );
    }

    const normalizedUsername = normalizeMcpUsername(body.username)!;
    const normalizedDefaultConnection = normalizeDefaultConnection(body.connections, body.defaultConnection);
    const connections = body.connections.map((connection) => ({
      name: connection.name.trim(),
      label: connection.label?.trim() || undefined,
      type: connection.db,
      credentials: tokenInputToDatabaseCredentials(connection),
      isDefault: connection.name.trim() === normalizedDefaultConnection
    }));

    const normalizedGitHub = body.github
      ? {
          orgName: body.github.orgName?.trim() || undefined,
          allowedOrgs: body.github.allowedOrgs || [],
          allowedRepos: body.github.allowedRepos || [],
          pat: body.github.pat?.trim() || undefined
        }
      : undefined;

    const { token, expiresAt } = await createCredentialToken({
      username: normalizedUsername,
      defaultConnection: normalizedDefaultConnection,
      connections,
      github: normalizedGitHub
    });

    const aliasesByType = connections.reduce<Record<string, string[]>>((accumulator, connection) => {
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
          username: normalizedUsername,
          token,
          token_type: 'Bearer',
          expires_at: expiresAt,
          expires_in_seconds: getCredentialTtlSeconds(),
          default_connection: normalizedDefaultConnection,
          total_connections: connections.length,
          aliases_by_type: aliasesByType,
          github: normalizedGitHub
            ? ({
                org_name: normalizedGitHub.orgName,
                allowed_orgs: normalizedGitHub.allowedOrgs,
                allowed_repos: normalizedGitHub.allowedRepos,
                has_github_pat: Boolean(normalizedGitHub.pat)
              } satisfies GitHubProfileSummary)
            : null
        }
      },
      { status: 201, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create credential token.';
    const lower = message.toLowerCase();

    if (lower.includes('already taken')) {
      return NextResponse.json({ success: false, error: message, data: null }, { status: 409 });
    }

    if (
      lower.includes('invalid username') ||
      lower.includes('username is required') ||
      lower.includes('username required')
    ) {
      return NextResponse.json({ success: false, error: message, data: null }, { status: 400 });
    }

    return NextResponse.json({ success: false, error: message, data: null }, { status: 500 });
  }
}