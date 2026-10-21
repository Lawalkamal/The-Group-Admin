import type { NextRequest } from 'next/server';
import { ApiError, assertSameOrigin, guard, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { updatePlan } from '@/lib/store';
import { checkEventDate, checkFreeText, checkGroupName } from '@/lib/validate';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ groupId: string }> };

export async function PATCH(request: NextRequest, context: Context) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { groupId } = await context.params;
    const body = await readJson(request);

    const patch: { title?: string; eventAt?: string | null; locationNote?: string; budgetNote?: string } = {};

    if (body.title !== undefined) {
      const title = checkGroupName(body.title);
      if (!title.ok) throw new ApiError(400, title.error, 'invalid_title');
      patch.title = title.value;
    }
    if (body.eventAt !== undefined) {
      const eventAt = checkEventDate(body.eventAt);
      if (!eventAt.ok) throw new ApiError(400, eventAt.error, 'invalid_date');
      patch.eventAt = eventAt.value;
    }
    if (body.locationNote !== undefined) {
      const location = checkFreeText(body.locationNote, 120, 'Venue note');
      if (!location.ok) throw new ApiError(400, location.error, 'invalid_location');
      patch.locationNote = location.value;
    }
    if (body.budgetNote !== undefined) {
      const budget = checkFreeText(body.budgetNote, 200, 'Budget note');
      if (!budget.ok) throw new ApiError(400, budget.error, 'invalid_budget');
      patch.budgetNote = budget.value;
    }

    const plan = await updatePlan(user, groupId, patch);
    return json({ plan });
  });
}
