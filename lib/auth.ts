import { createHash, pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';

const pbkdf2Async = promisify(pbkdf2);

export const PASSWORD_ITERATIONS = 210_000;
export const SESSION_COOKIE = 'tga_session';
export const SESSION_DAYS = 30;

/**
 * Hashes a password with PBKDF2-HMAC-SHA256 and a per-user random salt.
 * Format: pbkdf2$sha256$<iterations>$<salt-b64>$<hash-b64>
 */
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const derived = (await pbkdf2Async(password.normalize('NFKC'), salt, PASSWORD_ITERATIONS, 32, 'sha256')) as Buffer;
  return [
    'pbkdf2',
    'sha256',
    PASSWORD_ITERATIONS,
    salt.toString('base64'),
    derived.toString('base64'),
  ].join('$');
}

/** Verifies a password against a stored hash without leaking timing. */
export async function verifyPassword(password: string, stored: string | null | undefined): Promise<boolean> {
  if (!stored) return false;
  const parts = stored.split('$');
  if (parts.length !== 5 || parts[0] !== 'pbkdf2' || parts[1] !== 'sha256') return false;

  const iterations = Number(parts[2]);
  if (!Number.isInteger(iterations) || iterations < 10_000) return false;

  let salt: Buffer;
  let expected: Buffer;
  try {
    salt = Buffer.from(parts[3], 'base64');
    expected = Buffer.from(parts[4], 'base64');
  } catch {
    return false;
  }
  if (salt.length === 0 || expected.length === 0) return false;

  const derived = (await pbkdf2Async(
    password.normalize('NFKC'),
    salt,
    iterations,
    expected.length,
    'sha256',
  )) as Buffer;

  return derived.length === expected.length && timingSafeEqual(derived, expected);
}

/** Session tokens are stored hashed, so a database leak cannot be replayed. */
export function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

export function newSessionToken(): string {
  return randomBytes(32).toString('base64url');
}

export function sessionExpiry(): Date {
  return new Date(Date.now() + SESSION_DAYS * 24 * 60 * 60 * 1000);
}

export const sessionCookieOptions = {
  httpOnly: true,
  sameSite: 'lax' as const,
  secure: process.env.NODE_ENV === 'production',
  path: '/',
  maxAge: SESSION_DAYS * 24 * 60 * 60,
};
