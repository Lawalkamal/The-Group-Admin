import type { NextRequest } from 'next/server';
import { ApiError, assertSameOrigin, guard, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { getSnapshot, setGroupAccess } from '@/lib/store';
import { checkGroupDescription, checkVisibility } from '@/lib/validate';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ groupId: string }> };

export async function GET(_request: Request, context: Context) {
  return guard(async () => {
    const user = await requireUser();
    const { groupId } = await context.params;
    return json({ group: await getSnapshot(groupId, user.id) });
  });
}

/** Community settings. Only the admin can change them. */
export async function PATCH(request: NextRequest, context: Context) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { groupId } = await context.params;
    const body = await readJson(request);

    const patch: { visibility?: 'invite' | 'discoverable'; description?: string } = {};

    if (body.visibility !== undefined) {
      const visibility = checkVisibility(body.visibility);
      if (!visibility.ok) throw new ApiError(400, visibility.error, 'invalid_visibility');
      patch.visibility = visibility.value;
    }
    if (body.description !== undefined) {
      const description = checkGroupDescription(body.description);
      if (!description.ok) throw new ApiError(400, description.error, 'invalid_description');
      patch.description = description.value;
    }
    if (patch.visibility === undefined && patch.description === undefined) {
      throw new ApiError(400, 'Nothing to change.', 'empty_patch');
    }

    const settings = await setGroupAccess(user, groupId, patch);
    return json({ settings });
  });
}
