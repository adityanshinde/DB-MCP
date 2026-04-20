import { NextResponse } from 'next/server';

import { buildCredentialProfileSummary, getCredentialTtlSeconds, resolveCredentialContext } from '@/lib/auth/credentials';
import { decryptSecretForStorage } from '@/lib/auth/accountCrypto';
import { verifyPassword } from '@/lib/auth/password';
import { createSessionCookie } from '@/lib/auth/session';
import { getUserByEmail } from '@/lib/auth/appUsers';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const raw = await request.json();

    if (!raw || typeof raw !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid JSON.', data: null }, { status: 400 });
    }

    const email = typeof (raw as { email?: unknown }).email === 'string' ? (raw as { email: string }).email.trim().toLowerCase() : '';
    const password = typeof (raw as { password?: unknown }).password === 'string' ? (raw as { password: string }).password : '';

    if (!email || !password) {
      return NextResponse.json({ success: false, error: 'Email and password are required.', data: null }, { status: 400 });
    }

    const user = await getUserByEmail(email);
    if (!user || !verifyPassword(password, user.password_hash)) {
      return NextResponse.json({ success: false, error: 'Invalid email or password.', data: null }, { status: 401 });
    }

    await createSessionCookie(user.id);

    let mcpToken: string;
    try {
      mcpToken = decryptSecretForStorage(user.mcp_token_cipher);
    } catch {
      return NextResponse.json(
        {
          success: false,
          error: 'Could not read stored MCP token. Set APP_ACCOUNT_SECRET to the same value used at registration.',
          data: null
        },
        { status: 503 }
      );
    }

    const ctx = await resolveCredentialContext(mcpToken);
    if (!ctx) {
      return NextResponse.json(
        {
          success: false,
          error:
            'Your MCP credential expired in Redis. Ask an administrator to clear your workspace or wait for a future re-link flow.',
          data: null
        },
        { status: 410 }
      );
    }

    const summary = buildCredentialProfileSummary(ctx.profile);
    const gh = ctx.profile.github;

    return NextResponse.json({
      success: true,
      error: null,
      data: {
        email: user.email,
        username: user.username,
        token: mcpToken,
        token_type: 'Bearer',
        expires_at: ctx.profile.expiresAt,
        expires_in_seconds: getCredentialTtlSeconds(),
        default_connection: summary.default_connection,
        total_connections: summary.total,
        aliases_by_type: ctx.profile.connections.reduce<Record<string, string[]>>((acc, c) => {
          if (!acc[c.type]) acc[c.type] = [];
          acc[c.type].push(c.name);
          return acc;
        }, {}),
        github: gh
          ? {
              org_name: gh.orgName,
              allowed_orgs: gh.allowedOrgs,
              allowed_repos: gh.allowedRepos,
              has_github_pat: Boolean(gh.pat?.trim())
            }
          : null,
        summary
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Login failed.';
    return NextResponse.json({ success: false, error: message, data: null }, { status: 500 });
  }
}
