#!/usr/bin/env node
/**
 * Local development entry point.
 *
 * Starts an embedded Postgres (PGlite over the Postgres wire protocol) and then
 * Next.js, so the app talks to Postgres exactly like it does on Vercel/Neon.
 * The database lives in .data/pg and survives restarts; `npm run db:reset` wipes it.
 */
import { spawn } from 'node:child_process';
import { mkdir } from 'node:fs/promises';
import { join } from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { PGLiteSocketServer } from '@electric-sql/pglite-socket';

const cwd = process.cwd();
const dataDir = join(cwd, '.data', 'pg');
const dbPort = Number(process.env.DB_PORT || 5433);
// APP_PORT is deliberate: some shells export PORT=0, which makes Next pick a
// random port (breaking cookies/screenshot checks against a fixed URL).
const appPort = process.env.APP_PORT || '3000';
const nextBin = join(cwd, 'node_modules', 'next', 'dist', 'bin', 'next');

await mkdir(join(cwd, '.data'), { recursive: true });

const pg = new PGlite(dataDir);
await pg.waitReady;

const server = new PGLiteSocketServer({ db: pg, port: dbPort, host: '127.0.0.1' });
try {
  await server.start();
} catch (error) {
  console.error(`[db] could not listen on 127.0.0.1:${dbPort} — is another dev server running?`);
  console.error(error instanceof Error ? error.message : error);
  await pg.close();
  process.exit(1);
}

const databaseUrl = `postgresql://postgres:postgres@127.0.0.1:${dbPort}/postgres`;
console.log(`[db] embedded Postgres ready on 127.0.0.1:${dbPort} (${dataDir})`);

const childEnvironment = { ...process.env, DATABASE_URL: databaseUrl };
delete childEnvironment.PORT;

const child = spawn(process.execPath, [nextBin, 'dev', '-p', String(appPort)], {
  stdio: 'inherit',
  env: childEnvironment,
});

let shuttingDown = false;
async function shutdown(code) {
  if (shuttingDown) return;
  shuttingDown = true;
  child.kill();
  await server.stop().catch(() => undefined);
  await pg.close().catch(() => undefined);
  process.exit(code);
}

child.on('exit', (code) => void shutdown(code ?? 0));
process.on('SIGINT', () => void shutdown(0));
process.on('SIGTERM', () => void shutdown(0));
