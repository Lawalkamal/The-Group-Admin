import type { NextRequest } from 'next/server';
import { assertSameOrigin, guard, json } from '@/lib/http';
import { endSession } from '@/lib/session';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return guard(async () => {
    assertSameOrigin(request);
    await endSession();
    return json({ ok: true });
  });
}
