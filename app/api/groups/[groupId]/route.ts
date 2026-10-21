import { guard, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { getSnapshot } from '@/lib/store';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ groupId: string }> };

export async function GET(_request: Request, context: Context) {
  return guard(async () => {
    const user = await requireUser();
    const { groupId } = await context.params;
    return json({ group: await getSnapshot(groupId, user.id) });
  });
}
