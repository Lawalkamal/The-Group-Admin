import type { NextRequest } from 'next/server';
import { ApiError, assertSameOrigin, guard, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { postMessage, requireMembership } from '@/lib/store';
import { checkMessageBody } from '@/lib/validate';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ groupId: string }> };

export async function POST(request: NextRequest, context: Context) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { groupId } = await context.params;
    await requireMembership(groupId, user.id);

    const payload = await readJson(request);
    const body = checkMessageBody(payload.body);
    if (!body.ok) throw new ApiError(400, body.error, 'invalid_message');

    const message = await postMessage(groupId, user, body.value);
    return json({ message }, 201);
  });
}
