import type { NextRequest } from 'next/server';
import { ApiError, assertSameOrigin, guard, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { contributeToActivity } from '@/lib/store';
import { checkActivityNote } from '@/lib/validate';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ groupId: string }> };

export async function POST(request: NextRequest, context: Context) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { groupId } = await context.params;
    const body = await readJson(request);

    if (typeof body.actionId !== 'string' || !body.actionId) {
      throw new ApiError(400, 'Pick an action.', 'invalid_action');
    }
    const note = checkActivityNote(body.note);
    if (!note.ok) throw new ApiError(400, note.error, 'invalid_note');

    return json(await contributeToActivity(user, groupId, body.actionId, note.value));
  });
}
