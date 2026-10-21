import type { NextRequest } from 'next/server';
import { ApiError, assertSameOrigin, guard, json, readJson } from '@/lib/http';
import { requireUser } from '@/lib/session';
import { joinByCode } from '@/lib/store';
import { checkInviteCode } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return guard(async () => {
    assertSameOrigin(request);
    const user = await requireUser();
    const body = await readJson(request);

    const code = checkInviteCode(body.code);
    if (!code.ok) throw new ApiError(400, code.error, 'invalid_code');

    const result = await joinByCode(user, code.value);
    return json(result);
  });
}
