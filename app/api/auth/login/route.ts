import type { NextRequest } from 'next/server';
import { authenticate, pruneLoginAttempts } from '@/lib/accounts';
import { ApiError, assertSameOrigin, guard, json, readJson } from '@/lib/http';
import { pruneSessions, startSession } from '@/lib/session';
import { joinByCode } from '@/lib/store';
import { checkInviteCode } from '@/lib/validate';

export const dynamic = 'force-dynamic';

export async function POST(request: NextRequest) {
  return guard(async () => {
    assertSameOrigin(request);
    const body = await readJson(request);

    const username = typeof body.username === 'string' ? body.username.trim() : '';
    const password = typeof body.password === 'string' ? body.password : '';
    if (!username || !password) {
      throw new ApiError(400, 'Enter your username and password.', 'missing_credentials');
    }

    const user = await authenticate(username, password);
    await startSession(user.id);
    void pruneSessions().catch(() => undefined);
    void pruneLoginAttempts().catch(() => undefined);

    let groupId: string | null = null;
    if (typeof body.code === 'string' && body.code.trim()) {
      const code = checkInviteCode(body.code);
      if (code.ok) {
        try {
          groupId = (await joinByCode(user, code.value)).groupId;
        } catch {
          groupId = null;
        }
      }
    }

    return json({ user, groupId });
  });
}
