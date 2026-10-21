import type { NextRequest } from 'next/server';
import { ApiError, assertSameOrigin, guard, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { toggleVenueVote } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ groupId: string }> };

export async function POST(request: NextRequest, context: Context) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { groupId } = await context.params;
    const body = await readJson(request);

    if (typeof body.venueId !== 'string' || !body.venueId) {
      throw new ApiError(400, 'Pick a venue to vote for.', 'invalid_venue');
    }

    const plan = await toggleVenueVote(user, groupId, body.venueId);
    return json({ plan });
  });
}
