import type { NextRequest } from 'next/server';
import { ApiError, assertSameOrigin, guard, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { createGroup, listGroups } from '@/lib/store';
import { checkGroupName } from '@/lib/validate';

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

    const snapshot = await createGroup(user, name.value);
    return json({ groupId: snapshot.id, group: snapshot }, 201);
  });
}
