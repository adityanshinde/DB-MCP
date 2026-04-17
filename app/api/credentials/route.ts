import { NextResponse } from 'next/server';

import { createCredentialToken, getCredentialTtlSeconds } from '@/lib/auth/credentials';
import type { DatabaseCredentials } from '@/lib/types';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

type TokenConnectionInput =
  | {
      name: string;
      label?: string;
      isDefault?: boolean;
      db: 'postgres';
      credentials: {
        host: string;
        port: number;
        username: string;
        password: string;
        database: string;
      };
    }
  | {
      name: string;
      label?: string;
      isDefault?: boolean;
      db: 'mssql';
      credentials: {
        server: string;
        username: string;
        password: string;
        database: string;
        port?: number;
      };
    }
  | {
      name: string;
      label?: string;
      isDefault?: boolean;
      db: 'mysql';
      credentials: {
        host: string;
        port: number;
        username: string;
        password: string;
        database: string;
      };
    }
  | {
      name: string;
      label?: string;
      isDefault?: boolean;
      db: 'sqlite';
      credentials: {
        filePath: string;
      };
    };

type GitHubProfileInput = {
  orgName?: string;
  allowedOrgs?: string[];
  allowedRepos?: string[];
};

type GitHubProfileSummary = {
  org_name?: string;
  allowed_orgs: string[];
  allowed_repos: string[];
};

function toDatabaseCredentials(input: TokenConnectionInput): DatabaseCredentials {
  if (input.db === 'postgres') {
    return {
      type: 'postgres',
      postgres: input.credentials
    };
  }

  if (input.db === 'mssql') {
    return {
      type: 'mssql',
      mssql: input.credentials
    };
  }

  if (input.db === 'mysql') {
    return {
      type: 'mysql',
      mysql: input.credentials
    };
  }

  return {
    type: 'sqlite',
    sqlite: input.credentials
  };
}

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
  label?: string;
  defaultConnection?: string;
  connections: TokenConnectionInput[];
  github?: GitHubProfileInput;
} | null {
  if (!body || typeof body !== 'object') {
    return null;
  }

  const payload = body as {
    label?: unknown;
    defaultConnection?: unknown;
    connections?: unknown;
    github?: unknown;
  };

  if (!Array.isArray(payload.connections) || payload.connections.length === 0) {
    return null;
  }

  const connections = payload.connections.filter((entry): entry is TokenConnectionInput => {
    if (!entry || typeof entry !== 'object') {
      return false;
    }

    const candidate = entry as { name?: unknown; db?: unknown; credentials?: unknown };
    if (typeof candidate.name !== 'string' || typeof candidate.db !== 'string' || !candidate.credentials || typeof candidate.credentials !== 'object') {
      return false;
    }

    if (candidate.db === 'postgres') {
      const credentials = candidate.credentials as Record<string, unknown>;
      return typeof credentials.host === 'string' && typeof credentials.port === 'number' && typeof credentials.username === 'string' && typeof credentials.password === 'string' && typeof credentials.database === 'string';
    }

    if (candidate.db === 'mssql') {
      const credentials = candidate.credentials as Record<string, unknown>;
      return typeof credentials.server === 'string' && typeof credentials.username === 'string' && typeof credentials.password === 'string' && typeof credentials.database === 'string' && (credentials.port === undefined || typeof credentials.port === 'number');
    }

    if (candidate.db === 'mysql') {
      const credentials = candidate.credentials as Record<string, unknown>;
      return typeof credentials.host === 'string' && typeof credentials.port === 'number' && typeof credentials.username === 'string' && typeof credentials.password === 'string' && typeof credentials.database === 'string';
    }

    if (candidate.db === 'sqlite') {
      const credentials = candidate.credentials as Record<string, unknown>;
      return typeof credentials.filePath === 'string';
    }

    return false;
  });

  if (connections.length === 0) {
    return null;
  }

  let github: GitHubProfileInput | undefined;
  if (payload.github && typeof payload.github === 'object') {
    const candidate = payload.github as { orgName?: unknown; allowedOrgs?: unknown; allowedRepos?: unknown };
    github = {
      orgName: typeof candidate.orgName === 'string' ? candidate.orgName.trim() || undefined : undefined,
      allowedOrgs: normalizeList(candidate.allowedOrgs),
      allowedRepos: normalizeList(candidate.allowedRepos)
    };
  }

  return {
    label: typeof payload.label === 'string' ? payload.label.trim() || undefined : undefined,
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
          error: 'Provide a non-empty connections array with named database credentials.',
          data: null
        },
        { status: 400 }
      );
    }

    const normalizedDefaultConnection = normalizeDefaultConnection(body.connections, body.defaultConnection);
    const connections = body.connections.map((connection) => ({
      name: connection.name.trim(),
      label: connection.label?.trim() || undefined,
      type: connection.db,
      credentials: toDatabaseCredentials(connection),
      isDefault: connection.name.trim() === normalizedDefaultConnection
    }));

    const normalizedGitHub = body.github
      ? {
          orgName: body.github.orgName?.trim() || undefined,
          allowedOrgs: body.github.allowedOrgs || [],
          allowedRepos: body.github.allowedRepos || []
        }
      : undefined;

    const { token, expiresAt } = await createCredentialToken({
      label: body.label,
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
                allowed_repos: normalizedGitHub.allowedRepos
              } satisfies GitHubProfileSummary)
            : null
        }
      },
      { status: 201, headers: { 'Cache-Control': 'no-store, max-age=0' } }
    );
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Failed to create credential token.',
        data: null
      },
      { status: 500 }
    );
  }
}