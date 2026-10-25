import type { NextRequest } from 'next/server';
import { assertSameOrigin, guard, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { toggleBlock } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ userId: string }> };

/** Toggles a block. Blocked people's messages are hidden from you. */
export async function POST(request: NextRequest, context: Context) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { userId } = await context.params;
    return json(await toggleBlock(user.id, userId));
  });
}
