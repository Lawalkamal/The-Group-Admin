import { Pool } from 'pg';
import { SCHEMA_STATEMENTS } from './schema';

export type Row = Record<string, unknown>;

export interface Db {
  query<T extends Row = Row>(text: string, params?: unknown[]): Promise<T[]>;
}

const CONNECTION_ERROR =
  'DATABASE_URL is not set. Run `npm run dev` (it starts a local Postgres) or point DATABASE_URL at your Neon database.';

type Global = typeof globalThis & {
  __tgaPool?: Pool;
  __tgaSchema?: Promise<void>;
};

const globalState = globalThis as Global;

function pool(): Pool {
  const url = process.env.DATABASE_URL?.trim();
  if (!url) throw new Error(CONNECTION_ERROR);

  if (!globalState.__tgaPool) {
    // One connection per process: serverless functions should not hold many,
    // and the local embedded Postgres multiplexes a single connection.
    globalState.__tgaPool = new Pool({
      connectionString: url,
      max: 1,
      idleTimeoutMillis: 10_000,
      connectionTimeoutMillis: 15_000,
    });
    globalState.__tgaPool.on('error', (error) => {
      console.error('[db] idle client error', error.message);
    });
  }
  return globalState.__tgaPool;
}

const client: Db = {
  async query<T extends Row = Row>(text: string, params: unknown[] = []) {
    const result = await pool().query(text, params);
    return result.rows as T[];
  },
};

/**
 * Creates tables on first use. Idempotent and cached per process.
 */
export function ensureSchema(): Promise<void> {
  if (!globalState.__tgaSchema) {
    globalState.__tgaSchema = (async () => {
      for (const statement of SCHEMA_STATEMENTS) {
        await client.query(statement);
      }
    })().catch((error) => {
      globalState.__tgaSchema = undefined;
      throw error;
    });
  }
  return globalState.__tgaSchema;
}

export async function db(): Promise<Db> {
  await ensureSchema();
  return client;
}
