import type { NextRequest } from 'next/server';
import { assertSameOrigin, guard, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { requireAdmin, rotateInviteCode } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ groupId: string }> };

export async function POST(request: NextRequest, context: Context) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { groupId } = await context.params;
    await requireAdmin(groupId, user.id);

    const inviteCode = await rotateInviteCode(groupId);
    return json({ inviteCode });
  });
}
