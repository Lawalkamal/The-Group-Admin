import type { NextRequest } from 'next/server';
import { ApiError, assertSameOrigin, guard, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { getActivityState, requireMembership, startActivity } from '@/lib/store';
import { checkActivityGoal } from '@/lib/validate';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ groupId: string }> };

export async function GET(_request: Request, context: Context) {
  return guard(async () => {
    const user = await requireUser();
    const { groupId } = await context.params;
    await requireMembership(groupId, user.id);
    return json(await getActivityState(groupId));
  });
}

export async function POST(request: NextRequest, context: Context) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { groupId } = await context.params;
    const body = await readJson(request);

    if (typeof body.scenario !== 'string') {
      throw new ApiError(400, 'Pick a story first.', 'invalid_scenario');
    }
    const goal = checkActivityGoal(body.goal);
    if (!goal.ok) throw new ApiError(400, goal.error, 'invalid_goal');

    return json(await startActivity(user, groupId, body.scenario, goal.value), 201);
  });
}
