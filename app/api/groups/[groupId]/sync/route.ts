import type { NextRequest } from 'next/server';
import { guard, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { getSync } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ groupId: string }> };

export async function GET(request: NextRequest, context: Context) {
  return guard(async () => {
    const user = await requireUser();
    const { groupId } = await context.params;

    const raw = Number(request.nextUrl.searchParams.get('after') ?? '0');
    const after = Number.isFinite(raw) && raw > 0 ? Math.floor(raw) : 0;

    return json(await getSync(groupId, user.id, after));
  });
}
