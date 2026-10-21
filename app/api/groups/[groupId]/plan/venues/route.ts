import type { NextRequest } from 'next/server';
import { ApiError, assertSameOrigin, guard, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { addVenue } from '@/lib/store';
import { checkVenueName, checkVenueNote } from '@/lib/validate';

export const dynamic = 'force-dynamic';

type Context = { params: Promise<{ groupId: string }> };

export async function POST(request: NextRequest, context: Context) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const { groupId } = await context.params;
    const body = await readJson(request);

    const name = checkVenueName(body.name);
    if (!name.ok) throw new ApiError(400, name.error, 'invalid_venue');
    const note = checkVenueNote(body.note);
    if (!note.ok) throw new ApiError(400, note.error, 'invalid_note');

    const plan = await addVenue(user, groupId, name.value, note.value);
    return json({ plan }, 201);
  });
}
