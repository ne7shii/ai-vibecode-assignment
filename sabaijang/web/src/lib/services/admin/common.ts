// Shared helpers for the back office: audit log, input checks, errors.
import fs from 'node:fs';
import path from 'node:path';
import { query, Db } from '@/lib/db';
import { getClock } from '@/lib/clock-db';
import { AppError } from '@/lib/http';
import { RuleError } from '@/lib/rules/types';

/** Every admin write inserts audit_log (DESIGN §2.1). Pass the transaction client so it rolls back together. */
export async function audit(db: Db, staffId: number, action: string, detail: unknown) {
  const now = (await getClock(db)).now();
  await query('INSERT INTO audit_log (staff_id, action, detail, created_at) VALUES ($1,$2,$3,$4)', [staffId, action, JSON.stringify(detail ?? {}), now], db);
}

export const bad = (th: string, en: string, extra: Record<string, unknown> = {}) => new RuleError('BAD_INPUT', { th, en }, extra);
export const notFound = (th = 'ไม่พบข้อมูล', en = 'Not found') => new AppError(404, 'NOT_FOUND', { th, en });

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
export function isDate(v: unknown): v is string {
  if (typeof v !== 'string' || !DATE_RE.test(v)) return false;
  const d = new Date(`${v}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === v;
}
export function needDate(v: unknown, field: string): string {
  if (!isDate(v)) throw bad(`วันที่ไม่ถูกต้อง (${field})`, `Invalid date (${field})`, { field });
  return v;
}
export const isInstant = (v: unknown): v is string => typeof v === 'string' && !Number.isNaN(Date.parse(v));
export const SEASON_KINDS = ['LOW', 'HIGH', 'PEAK'] as const;
export const ROOM_TYPES_RE = /^R\d{2}$/;

/**
 * db/init/04-admin.sql is additive and idempotent. A database built before it existed (e.g. the running dev DB)
 * gets it applied once per process the first time an admin service needs it.
 */
const g = globalThis as unknown as { __adminSchema?: Promise<void> };
export function ensureAdminSchema(): Promise<void> {
  g.__adminSchema ??= (async () => {
    const { rows } = await query(`SELECT 1 FROM information_schema.columns WHERE table_schema = 'public' AND table_name = 'room_types' AND column_name = 'amenities_en'`);
    if (rows.length) return;
    const dir = [process.env.DB_INIT_DIR, path.resolve(process.cwd(), '../db/init'), path.resolve(process.cwd(), 'db/init')]
      .filter(Boolean).find((d) => fs.existsSync(path.join(d!, '04-admin.sql')));
    if (!dir) throw new Error('db/init/04-admin.sql not found');
    await query(fs.readFileSync(path.join(dir, '04-admin.sql'), 'utf8'));
  })().catch((e) => { g.__adminSchema = undefined; throw e; });
  return g.__adminSchema;
}

export function parseId(v: string | undefined): number {
  const n = Number(v);
  if (!Number.isInteger(n) || n <= 0) throw notFound();
  return n;
}
