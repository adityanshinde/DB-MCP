import { NextResponse } from 'next/server';

import { parseTokenConnectionInput, tokenInputToDatabaseCredentials } from '@/lib/credentials/tokenConnection';
import { runConnectionPreflight } from '@/lib/credentials/testConnection';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST(request: Request) {
  try {
    const body = await request.json();

    if (!body || typeof body !== 'object') {
      return NextResponse.json({ success: false, error: 'Invalid JSON body.', data: null }, { status: 400 });
    }

    const raw = (body as { connection?: unknown }).connection;
    const parsed = parseTokenConnectionInput(raw);

    if (!parsed) {
      return NextResponse.json(
        {
          success: false,
          error: 'Provide a valid "connection" object (same shape as each entry in the token generator connections array).',
          data: null
        },
        { status: 400 }
      );
    }

    const creds = tokenInputToDatabaseCredentials(parsed);
    const data = await runConnectionPreflight(parsed.db, creds);

    return NextResponse.json({ success: true, data });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Preflight failed.';
    return NextResponse.json({ success: false, error: message, data: null }, { status: 500 });
  }
}
