import { cookies } from 'next/headers';
import { db } from './db';
import { SESSION_COOKIE, hashToken, newSessionToken, sessionCookieOptions, sessionExpiry } from './auth';
import { ApiError } from './http';

export type User = { id: string; username: string };

type SessionRow = { id: string; username: string; expires_at: string | Date };

export async function currentUser(): Promise<User | null> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (!token) return null;

  const rows = await (await db()).query<SessionRow>(
    `select u.id, u.username, s.expires_at
       from sessions s
       join users u on u.id = s.user_id
      where s.token_hash = $1`,
    [hashToken(token)],
  );
  const row = rows[0];
  if (!row) return null;

  if (new Date(row.expires_at).getTime() < Date.now()) {
    await (await db()).query('delete from sessions where token_hash = $1', [hashToken(token)]);
    return null;
  }
  return { id: row.id, username: row.username };
}

export async function requireUser(): Promise<User> {
  const user = await currentUser();
  if (!user) throw new ApiError(401, 'Sign in to continue.', 'unauthenticated');
  return user;
}

/** Creates a session row and sets the HttpOnly cookie. */
export async function startSession(userId: string): Promise<void> {
  const token = newSessionToken();
  const expiresAt = sessionExpiry();

  await (await db()).query(
    'insert into sessions (token_hash, user_id, expires_at) values ($1, $2, $3)',
    [hashToken(token), userId, expiresAt.toISOString()],
  );

  const store = await cookies();
  store.set(SESSION_COOKIE, token, sessionCookieOptions);
}

export async function endSession(): Promise<void> {
  const store = await cookies();
  const token = store.get(SESSION_COOKIE)?.value;
  if (token) {
    await (await db()).query('delete from sessions where token_hash = $1', [hashToken(token)]);
  }
  store.set(SESSION_COOKIE, '', { ...sessionCookieOptions, maxAge: 0 });
}

/** Housekeeping: drop expired sessions occasionally. */
export async function pruneSessions(): Promise<void> {
  await (await db()).query('delete from sessions where expires_at < now()');
}
