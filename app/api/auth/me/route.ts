import { NextResponse } from 'next/server';

import { buildCredentialProfileSummary, resolveCredentialContext } from '@/lib/auth/credentials';
import { decryptSecretForStorage } from '@/lib/auth/accountCrypto';
import { readSessionUserId } from '@/lib/auth/session';
import { getUserById } from '@/lib/auth/appUsers';
import { credentialRecordToTokenInput } from '@/lib/credentials/credentialRecordToTokenInput';
import type { TokenConnectionInput } from '@/lib/credentials/tokenConnection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
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
        {
          success: false,
          error: 'MCP credential not found or expired in Redis.',
          data: null
        },
        { status: 410 }
      );
    }

    const summary = buildCredentialProfileSummary(ctx.profile);

    let connections_as_form: TokenConnectionInput[] = [];
    try {
      connections_as_form = ctx.profile.connections.map((entry) => credentialRecordToTokenInput(entry));
    } catch {
      connections_as_form = [];
    }

    const editorPayload = {
      default_connection: summary.default_connection,
      connections: connections_as_form,
      github: ctx.profile.github ?? null
    };

    return NextResponse.json({
      success: true,
      error: null,
      data: {
        email: user.email,
        username: user.username,
        token: mcpToken,
        summary,
        profile: ctx.profile,
        connections_as_form,
        editor_payload: editorPayload
      }
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to load session.';
    return NextResponse.json({ success: false, error: message, data: null }, { status: 500 });
  }
}
