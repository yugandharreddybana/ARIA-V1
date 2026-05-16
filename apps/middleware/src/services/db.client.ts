/**
 * Singleton Postgres pool for the middleware.
 * Used by services that need direct SQL (Token Gateway ledger + replay).
 */

import { Pool } from 'pg';
import { validateEnv } from '../config/env';

let pool: Pool | null = null;

export function getPgPool(): Pool {
  if (pool) return pool;
  const env = validateEnv();
  pool = new Pool({ connectionString: env.DATABASE_URL, max: 10 });
  return pool;
}

export async function closePgPool(): Promise<void> {
  if (pool) {
    await pool.end();
    pool = null;
  }
}
