// Seasons, season rates and date overrides (US-15, US-52).
import type pg from 'pg';
import { query, tx } from '@/lib/db';
import { getClock } from '@/lib/clock-db';
import { bkk } from '@/lib/clock';
import { addDays, daysBetween, seasonGaps, seasonOf } from '@/lib/rules/calendar';
import { RuleError, type SeasonKind } from '@/lib/rules/types';
import { fmtDate } from '@/lib/format';
import { audit, bad, isDate, needDate, notFound, SEASON_KINDS } from './common';

export interface SeasonRow { id: number; kind: SeasonKind; start: string; end: string; label: string }
const mapSeason = (r: Record<string, any>): SeasonRow => ({ id: r.id, kind: r.kind, start: r.start_date, end: r.end_date, label: r.label });

export const GAP_WINDOW_DAYS = 365;

export async function listSeasons() {
  const { rows } = await query('SELECT * FROM seasons ORDER BY start_date, CASE kind WHEN \'PEAK\' THEN 2 ELSE 1 END, id');
  const today = bkk((await getClock()).now()).date;
  return { seasons: rows.map(mapSeason), today, windowEnd: addDays(today, GAP_WINDOW_DAYS - 1) };
}

/** Compress sorted dates into inclusive ranges. */
function toRanges(dates: string[]) {
  const out: { from: string; to: string }[] = [];
  for (const d of dates) {
    const last = out[out.length - 1];
    if (last && addDays(last.to, 1) === d) last.to = d;
    else out.push({ from: d, to: d });
  }
  return out;
}

/** US-15 ข้อ 3: every date in the next 365 days (site clock) must belong to a season. */
async function assertNoGaps(c: pg.PoolClient) {
  const { rows } = await c.query('SELECT kind, start_date, end_date FROM seasons');
  const today = bkk((await getClock(c)).now()).date;
  const missing = seasonGaps(today, GAP_WINDOW_DAYS, rows.map((s) => ({ kind: s.kind, start: s.start_date, end: s.end_date })));
  if (!missing.length) return;
  const ranges = toRanges(missing);
  const fmt = (lang: 'th' | 'en') => ranges.slice(0, 6).map((r) => (r.from === r.to ? fmtDate(r.from, lang) : `${fmtDate(r.from, lang)} – ${fmtDate(r.to, lang)}`)).join(', ') + (ranges.length > 6 ? ' …' : '');
  throw new RuleError('SEASON_GAP', {
    th: `บันทึกไม่ได้: ${missing.length} วันใน 365 วันข้างหน้ายังไม่อยู่ในซีซั่นใด (${fmt('th')})`,
    en: `Cannot save: ${missing.length} day(s) in the next 365 days have no season (${fmt('en')})`,
  }, { missing, ranges });
}

interface SeasonInput { kind?: SeasonKind; start?: string; end?: string; label?: string }

function checkSeason(s: SeasonInput) {
  if (!SEASON_KINDS.includes(s.kind as SeasonKind)) throw bad('ชนิดซีซั่นต้องเป็น LOW HIGH หรือ PEAK', 'Season kind must be LOW, HIGH or PEAK', { field: 'kind' });
  needDate(s.start, 'start');
  needDate(s.end, 'end');
  if (s.end! < s.start!) throw new RuleError('BAD_RANGE', { th: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', en: 'End date must not be before start date' }, { field: 'end' });
  if ((s.label ?? '').length > 80) throw bad('ชื่อยาวเกินไป', 'Label is too long', { field: 'label' });
}

export async function createSeason(staffId: number, s: SeasonInput) {
  checkSeason(s);
  return tx(async (c) => {
    const { rows } = await c.query('INSERT INTO seasons (kind, start_date, end_date, label) VALUES ($1,$2,$3,$4) RETURNING *', [s.kind, s.start, s.end, (s.label ?? '').trim()]);
    await assertNoGaps(c);
    await audit(c, staffId, 'SEASON_CREATE', mapSeason(rows[0]));
    return { season: mapSeason(rows[0]) };
  });
}

export async function updateSeason(staffId: number, id: number, patch: SeasonInput) {
  return tx(async (c) => {
    const { rows: cur } = await c.query('SELECT * FROM seasons WHERE id = $1 FOR UPDATE', [id]);
    if (!cur.length) throw notFound('ไม่พบซีซั่น', 'Season not found');
    const before = mapSeason(cur[0]);
    const next = { kind: patch.kind ?? before.kind, start: patch.start ?? before.start, end: patch.end ?? before.end, label: patch.label ?? before.label };
    checkSeason(next);
    const { rows } = await c.query('UPDATE seasons SET kind=$2, start_date=$3, end_date=$4, label=$5 WHERE id=$1 RETURNING *', [id, next.kind, next.start, next.end, next.label.trim()]);
    await assertNoGaps(c);
    await audit(c, staffId, 'SEASON_UPDATE', { before, after: mapSeason(rows[0]) });
    return { season: mapSeason(rows[0]) };
  });
}

export async function deleteSeason(staffId: number, id: number) {
  return tx(async (c) => {
    const { rows } = await c.query('DELETE FROM seasons WHERE id = $1 RETURNING *', [id]);
    if (!rows.length) throw notFound('ไม่พบซีซั่น', 'Season not found');
    await assertNoGaps(c);
    await audit(c, staffId, 'SEASON_DELETE', mapSeason(rows[0]));
    return { ok: true };
  });
}

// ---------- season rates ----------

export async function getRates() {
  const [types, rates] = await Promise.all([
    query('SELECT code, name_th, name_en FROM room_types ORDER BY sort'),
    query('SELECT room_type_code, kind, price FROM season_rates'),
  ]);
  const out: Record<string, Record<SeasonKind, number>> = {};
  for (const r of rates.rows) (out[r.room_type_code] ??= {} as Record<SeasonKind, number>)[r.kind as SeasonKind] = r.price;
  return { roomTypes: types.rows.map((t) => ({ code: t.code as string, nameTh: t.name_th as string, nameEn: t.name_en as string })), rates: out };
}

const goodPrice = (p: unknown): p is number => typeof p === 'number' && Number.isFinite(p) && p > 0 && p < 10_000_000;
const badPrice = () => new RuleError('BAD_PRICE', { th: 'ราคาต้องมากกว่า 0', en: 'Price must be greater than 0' }, { field: 'price' });

async function knownType(c: pg.PoolClient, code: unknown) {
  const { rowCount } = await c.query('SELECT 1 FROM room_types WHERE code = $1', [code]);
  if (!rowCount) throw bad('ไม่พบประเภทห้อง', 'Unknown room type', { field: 'roomType' });
}

/** US-15 ข้อ 1 + ข้อ 4: prices live per booking (booking_nights), so paid bookings never change. */
export async function putRates(staffId: number, i: { rates?: { roomType: string; kind: SeasonKind; price: number }[] }) {
  if (!Array.isArray(i.rates) || !i.rates.length) throw bad('ไม่มีราคาที่จะบันทึก', 'No rates to save');
  await tx(async (c) => {
    for (const r of i.rates!) {
      if (!SEASON_KINDS.includes(r.kind)) throw bad('ชนิดซีซั่นไม่ถูกต้อง', 'Invalid season kind', { field: 'kind' });
      if (!goodPrice(r.price)) throw badPrice();
      await knownType(c, r.roomType);
      await c.query(`INSERT INTO season_rates (room_type_code, kind, price) VALUES ($1,$2,$3)
                     ON CONFLICT (room_type_code, kind) DO UPDATE SET price = EXCLUDED.price`, [r.roomType, r.kind, r.price]);
    }
    await audit(c, staffId, 'RATES_UPDATE', { rates: i.rates });
  });
  return getRates();
}

// ---------- date overrides (US-52) ----------

export async function listDateRates(i: { month?: string | null; roomType?: string | null }) {
  const { rows } = await query(`SELECT room_type_code, night, price FROM date_rates ORDER BY night, room_type_code`);
  const overrides = rows.map((r) => ({ roomType: r.room_type_code as string, night: r.night as string, price: r.price as number }));
  let calendar: { month: string; roomType: string; days: { date: string; season: SeasonKind | null; price: number | null; seasonPrice: number | null; override: boolean }[] } | null = null;
  if (i.month) {
    if (!/^\d{4}-\d{2}$/.test(i.month) || !isDate(`${i.month}-01`)) throw bad('เดือนไม่ถูกต้อง', 'Invalid month', { field: 'month' });
    const roomType = i.roomType || 'R01';
    const [seasons, rates] = await Promise.all([
      query('SELECT kind, start_date, end_date FROM seasons'),
      query('SELECT kind, price FROM season_rates WHERE room_type_code = $1', [roomType]),
    ]);
    const ss = seasons.rows.map((s) => ({ kind: s.kind as SeasonKind, start: s.start_date as string, end: s.end_date as string }));
    const rate: Partial<Record<SeasonKind, number>> = {};
    for (const r of rates.rows) rate[r.kind as SeasonKind] = r.price;
    const first = `${i.month}-01`;
    const days = [];
    for (let d = first; d.slice(0, 7) === i.month; d = addDays(d, 1)) {
      const season = seasonOf(d, ss);
      const ov = overrides.find((o) => o.roomType === roomType && o.night === d);
      const seasonPrice = season ? rate[season] ?? null : null;
      days.push({ date: d, season, seasonPrice, price: ov ? ov.price : seasonPrice, override: !!ov });
    }
    calendar = { month: i.month, roomType, days };
  }
  return { overrides, calendar };
}

export async function putDateRate(staffId: number, i: { roomType?: string; from?: string; to?: string; night?: string; price?: number }) {
  const from = needDate(i.from ?? i.night, 'from');
  const to = i.to ? needDate(i.to, 'to') : from;
  if (to < from) throw new RuleError('BAD_RANGE', { th: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', en: 'End date must not be before start date' }, { field: 'to' });
  if (daysBetween(from, to) > 366) throw bad('ช่วงวันที่ยาวเกินไป', 'Date range is too long');
  if (!goodPrice(i.price)) throw badPrice();
  await tx(async (c) => {
    await knownType(c, i.roomType);
    for (let d = from; d <= to; d = addDays(d, 1)) {
      await c.query(`INSERT INTO date_rates (room_type_code, night, price) VALUES ($1,$2,$3)
                     ON CONFLICT (room_type_code, night) DO UPDATE SET price = EXCLUDED.price`, [i.roomType, d, i.price]);
    }
    await audit(c, staffId, 'DATE_RATE_SET', { roomType: i.roomType, from, to, price: i.price });
  });
  return listDateRates({});
}

export async function deleteDateRate(staffId: number, i: { roomType?: string | null; night?: string | null }) {
  const night = needDate(i.night, 'night');
  await tx(async (c) => {
    const { rowCount } = await c.query('DELETE FROM date_rates WHERE room_type_code = $1 AND night = $2', [i.roomType, night]);
    if (!rowCount) throw notFound('ไม่พบราคาเฉพาะวันนี้', 'Date rate not found');
    await audit(c, staffId, 'DATE_RATE_DELETE', { roomType: i.roomType, night });
  });
  return listDateRates({});
}
