import { guard, json } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { listExploreGroups } from '@/lib/store';

export const dynamic = 'force-dynamic';

export async function GET() {
  return guard(async () => {
    const user = await requireUser();
    return json({ groups: await listExploreGroups(user.id) });
  });
}
