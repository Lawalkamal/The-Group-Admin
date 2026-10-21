import type { NextRequest } from 'next/server';
import { ApiError, assertSameOrigin, guard, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { setRsvp } from '@/lib/store';
import { checkRsvp } from '@/lib/validate';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ groupId: string }> };

export async function POST(request: NextRequest, context: Context) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { groupId } = await context.params;
    const body = await readJson(request);

    const status = checkRsvp(body.status);
    if (!status.ok) throw new ApiError(400, status.error, 'invalid_rsvp');

    const plan = await setRsvp(user, groupId, status.value);
    return json({ plan });
  });
}
