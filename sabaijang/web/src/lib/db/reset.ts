import fs from 'node:fs';
import path from 'node:path';
import type pg from 'pg';
import { pool } from './index';

// Same key for every process/instance: serialises schema builds (pg_advisory_xact_lock).
const INIT_LOCK = 427_100_3100;

function initDir() {
  const candidates = [
    process.env.DB_INIT_DIR,
    path.resolve(process.cwd(), '../db/init'),
    path.resolve(process.cwd(), 'db/init'),
  ].filter(Boolean) as string[];
  const dir = candidates.find((d) => fs.existsSync(path.join(d, '01-schema.sql')));
  if (!dir) throw new Error('db/init not found; set DB_INIT_DIR');
  return dir;
}

async function runInitFiles(c: pg.PoolClient) {
  const dir = initDir();
  for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.sql')).sort()) {
    await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
  }
}

/** Run fn in one transaction holding the init lock, so nobody sees a half-built schema. */
async function withInitLock(fn: (c: pg.PoolClient) => Promise<void>) {
  const c = await pool().connect();
  try {
    await c.query('BEGIN');
    await c.query('SELECT pg_advisory_xact_lock($1)', [INIT_LOCK]);
    await fn(c);
    await c.query('COMMIT');
  } catch (e) {
    await c.query('ROLLBACK').catch(() => undefined);
    throw e;
  } finally {
    c.release();
  }
}

/** Drop everything and rebuild from db/init/*.sql (schema + seed). */
export async function resetDatabase() {
  await withInitLock(runInitFiles);
}

const g = globalThis as unknown as { __hotelEnsure?: Promise<void> };

/**
 * Build schema + seed if the database is empty. Safe to call concurrently and from several
 * instances: one transaction under an advisory lock, re-checked after taking the lock.
 * Called once at server start (src/instrumentation.ts) and defensively by the layout / API.
 */
export function ensureDatabase(opts: { force?: boolean } = {}): Promise<void> {
  if (!opts.force && g.__hotelEnsure) return g.__hotelEnsure;
  const p = withInitLock(async (c) => {
    const { rows } = await c.query(`SELECT to_regclass('public.app_settings') AS t`);
    if (!rows[0].t) await runInitFiles(c);
  });
  if (!opts.force) g.__hotelEnsure = p.catch((e) => { g.__hotelEnsure = undefined; throw e; });
  return opts.force ? p : g.__hotelEnsure!;
}
