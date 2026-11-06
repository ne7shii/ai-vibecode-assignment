import fs from 'node:fs';
import path from 'node:path';
import { pool } from './index';

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

/** Drop everything and rebuild from db/init/*.sql (schema + seed). */
export async function resetDatabase() {
  const dir = initDir();
  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.sql')).sort();
  const c = await pool().connect();
  try {
    for (const f of files) await c.query(fs.readFileSync(path.join(dir, f), 'utf8'));
  } finally {
    c.release();
  }
}

/** Build schema on first start if the database is empty. */
export async function ensureDatabase() {
  const { rows } = await pool().query(`SELECT to_regclass('public.app_settings') AS t`);
  if (!rows[0].t) await resetDatabase();
}
