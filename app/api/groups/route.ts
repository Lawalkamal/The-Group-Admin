import type { NextRequest } from 'next/server';
import { ApiError, assertSameOrigin, guard, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { createGroup, listGroups } from '@/lib/store';
import { checkGroupDescription, checkGroupName, checkVisibility } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export async function GET() {
  return guard(async () => {
    const user = await requireUser();
    return json({ groups: await listGroups(user.id) });
  });
}

export async function POST(request: NextRequest) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson(request);

    const name = checkGroupName(body.name);
    if (!name.ok) throw new ApiError(400, name.error, 'invalid_group_name');

    // Invite-only is the default: discovery has to be chosen deliberately.
    let visibility: 'invite' | 'discoverable' = 'invite';
    if (body.visibility !== undefined) {
      const checked = checkVisibility(body.visibility);
      if (!checked.ok) throw new ApiError(400, checked.error, 'invalid_visibility');
      visibility = checked.value;
    }

    const description = checkGroupDescription(body.description);
    if (!description.ok) throw new ApiError(400, description.error, 'invalid_description');

    const snapshot = await createGroup(user, name.value, {
      visibility,
      description: description.value,
    });
    return json({ groupId: snapshot.id, group: snapshot }, 201);
  });
}
