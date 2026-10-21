import { NextResponse } from 'next/server';

export class ApiError extends Error {
  status: number;
  code: string;

  constructor(status: number, message: string, code = 'error') {
    super(message);
    this.status = status;
    this.code = code;
  }
}

export function json<T>(data: T, status = 200): NextResponse {
  return NextResponse.json(data, {
    status,
    headers: { 'cache-control': 'no-store' },
  });
}

export function fail(status: number, message: string, code = 'error'): NextResponse {
  return json({ error: message, code }, status);
}

/** Wraps a handler so thrown ApiErrors become JSON instead of 500 pages. */
export async function guard<T>(fn: () => Promise<NextResponse<T> | NextResponse>): Promise<NextResponse> {
  try {
    return await fn();
  } catch (error) {
    if (error instanceof ApiError) return fail(error.status, error.message, error.code);
    console.error('[api]', error);
    return fail(500, 'Something went wrong on our end. Try again.');
  }
}

export async function readJson(request: Request): Promise<Record<string, unknown>> {
  try {
    const body = await request.json();
    if (!body || typeof body !== 'object' || Array.isArray(body)) {
      throw new ApiError(400, 'Expected a JSON object.');
    }
    return body as Record<string, unknown>;
  } catch (error) {
    if (error instanceof ApiError) throw error;
    throw new ApiError(400, 'Could not read that request.');
  }
}

/**
 * Blocks cross-site writes. SameSite=Lax already covers most cases; this adds
 * defence in depth for browsers that send an Origin on form posts.
 */
export function assertSameOrigin(request: Request): void {
  const origin = request.headers.get('origin');
  if (!origin || origin === 'null') return;

  const host = request.headers.get('host');
  let originHost: string;
  try {
    originHost = new URL(origin).host;
  } catch {
    throw new ApiError(403, 'Blocked a cross-site request.');
  }
  if (!host || originHost !== host) {
    throw new ApiError(403, 'Blocked a cross-site request.');
  }
}
