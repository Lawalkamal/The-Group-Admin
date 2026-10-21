import type { NextRequest } from 'next/server';
import { assertSameOrigin, guard, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { finalizePlan } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ groupId: string }> };

export async function POST(request: NextRequest, context: Context) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { groupId } = await context.params;

    const body: unknown = await request.json().catch(() => ({}));
    const venueId =
      body && typeof body === 'object' && typeof (body as { venueId?: unknown }).venueId === 'string'
        ? ((body as { venueId: string }).venueId || null)
        : null;

    const plan = await finalizePlan(user, groupId, venueId);
    return json({ plan });
  });
}
