import type { NextRequest } from 'next/server';
import { assertSameOrigin, guard, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { removeMember } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ groupId: string; userId: string }> };

export async function DELETE(request: NextRequest, context: Context) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { groupId, userId } = await context.params;

    const members = await removeMember(user, groupId, userId);
    return json({ members });
  });
}
