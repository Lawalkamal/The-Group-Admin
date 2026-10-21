import { db } from './db';
import { hashPassword, verifyPassword } from './auth';
import { ApiError } from './http';
import { newId } from './store';
import type { User } from './session';

const LOGIN_WINDOW_MINUTES = 10;
const LOGIN_MAX_ATTEMPTS = 8;

type UserRow = { id: string; username: string; password_hash: string };

export async function findUserByUsername(username: string): Promise<UserRow | null> {
  const rows = await (await db()).query<UserRow>(
    'select id, username, password_hash from users where username_lower = $1',
    [username.toLowerCase()],
  );
  return rows[0] ?? null;
}

export async function registerUser(username: string, password: string): Promise<User> {
  const d = await db();
  const passwordHash = await hashPassword(password);
  const id = newId();

  try {
    await d.query(
      `insert into users (id, username, username_lower, password_hash)
       values ($1, $2, $3, $4)`,
      [id, username, username.toLowerCase(), passwordHash],
    );
  } catch (error) {
    if ((error as { code?: string }).code === '23505') {
      throw new ApiError(409, 'That username is taken. Try another.', 'username_taken');
    }
    throw error;
  }

  return { id, username };
}

export async function authenticate(username: string, password: string): Promise<User> {
  const d = await db();
  const key = username.toLowerCase();

  const attempts = await d.query<{ n: unknown }>(
    `select count(*) as n from login_attempts
      where username_lower = $1 and created_at > now() - interval '${LOGIN_WINDOW_MINUTES} minutes'`,
    [key],
  );
  if (Number(attempts[0]?.n ?? 0) >= LOGIN_MAX_ATTEMPTS) {
    throw new ApiError(429, 'Too many attempts. Wait a few minutes and try again.', 'rate_limited');
  }

  const user = await findUserByUsername(username);
  const valid = await verifyPassword(password, user?.password_hash);
  if (!user || !valid) {
    await d.query('insert into login_attempts (username_lower) values ($1)', [key]);
    throw new ApiError(401, 'Username or password is incorrect.', 'bad_credentials');
  }

  await d.query('delete from login_attempts where username_lower = $1', [key]);
  return { id: user.id, username: user.username };
}

/** Removes old throttle rows so the table stays small. */
export async function pruneLoginAttempts(): Promise<void> {
  await (await db()).query("delete from login_attempts where created_at < now() - interval '1 day'");
}
