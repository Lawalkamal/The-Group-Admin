import type { NextRequest } from 'next/server';
import { ApiError, assertSameOrigin, guard, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { cheerActivity } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ groupId: string }> };

export async function POST(request: NextRequest, context: Context) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { groupId } = await context.params;
    const body = await readJson(request);

    if (typeof body.actionId !== 'string' || !body.actionId) {
      throw new ApiError(400, 'Pick an action to back.', 'invalid_action');
    }

    return json(await cheerActivity(user, groupId, body.actionId));
  });
}
