import { NextResponse } from 'next/server';

import { checkMcpUsernameAvailability } from '@/lib/auth/credentials';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const url = new URL(request.url);
  const q = url.searchParams.get('q') ?? '';

  const result = await checkMcpUsernameAvailability(q);

  return NextResponse.json(result, {
    status: 200,
    headers: { 'Cache-Control': 'no-store, max-age=0' }
  });
}
