import type { NextRequest } from 'next/server';
import { registerUser } from '@/lib/accounts';
import { assertSameOrigin, guard, json, readJson, ApiError } from '@/lib/http';
import { seedDemoGroupFor } from '@/lib/seed';
import { startSession } from '@/lib/session';
import { joinByCode } from '@/lib/store';
import { checkInviteCode, checkPassword, checkUsername } from '@/lib/validate';
import { pruneLoginAttempts } from '@/lib/accounts';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return guard(async () => {
    assertSameOrigin(request);
    const body = await readJson(request);

    const username = checkUsername(body.username);
    if (!username.ok) throw new ApiError(400, username.error, 'invalid_username');
    const password = checkPassword(body.password);
    if (!password.ok) throw new ApiError(400, password.error, 'invalid_password');

    const user = await registerUser(username.value, password.value);
    await startSession(user.id);
    void pruneLoginAttempts().catch(() => undefined);

    let joinedGroupId: string | null = null;
    if (typeof body.code === 'string' && body.code.trim()) {
      const code = checkInviteCode(body.code);
      if (code.ok) {
        try {
          const joined = await joinByCode(user, code.value);
          joinedGroupId = joined.groupId;
        } catch {
          // A bad code must not block account creation.
        }
      }
    }

    const demoGroupId = joinedGroupId ? null : await seedDemoGroupFor(user);

    return json({ user, groupId: joinedGroupId ?? demoGroupId }, 201);
  });
}
