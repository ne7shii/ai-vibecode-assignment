// Promotions, Flash Sale, festival packages and promo codes (US-27, US-28, US-30, US-23).
import type pg from 'pg';
import { query, tx } from '@/lib/db';
import { getClock } from '@/lib/clock-db';
import { quote, type Plan } from '@/lib/rules/pricing';
import { RuleError, type Promotion, type PromoRules } from '@/lib/rules/types';
import { loadRuleData, mapPromotion } from '../data';
import { audit, bad, isDate, isInstant, notFound, SEASON_KINDS } from './common';

const KINDS: Record<Promotion['grp'], Promotion['kind'][]> = {
  PRICE: ['PERCENT', 'AMOUNT', 'FREE_NIGHT'],
  STACK: ['PERCENT'],
  PLAN: ['GREEN', 'HONEYMOON', 'FAMILY_SUMMER', 'FESTIVAL'],
};

export interface AdminPromotion extends Promotion { descTh: string; descEn: string; image: string | null; sort: number }
const mapAdmin = (r: Record<string, any>): AdminPromotion => ({ ...mapPromotion(r), descTh: r.desc_th, descEn: r.desc_en, image: r.image, sort: r.sort });

export async function listPromotions() {
  const { rows } = await query('SELECT * FROM promotions ORDER BY sort, code');
  return { promotions: rows.map(mapAdmin) };
}

export async function getPromotion(code: string) {
  const { rows } = await query('SELECT * FROM promotions WHERE code = $1', [code]);
  if (!rows.length) throw notFound('ไม่พบโปรโมชั่น', 'Promotion not found');
  return { promotion: mapAdmin(rows[0]) };
}

export interface PromotionInput {
  code?: string; grp?: Promotion['grp']; kind?: Promotion['kind']; nameTh?: string; nameEn?: string; descTh?: string; descEn?: string;
  value?: number; rules?: PromoRules; quota?: number | null; memberOnly?: boolean; active?: boolean; image?: string | null; sort?: number;
}

const endBeforeStart = (field: string) => new RuleError('END_BEFORE_START', { th: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', en: 'End date must not be before start date' }, { field });

/** Validate a full promotion (after merging a patch). US-30 ข้อ 3. */
function validate(p: Required<Omit<PromotionInput, 'image'>> & { image: string | null }, used: number, roomTypes: string[]) {
  if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(p.code)) throw bad('รหัสโปรใช้ A–Z 0–9 และ - ได้ 2–20 ตัว', 'Promotion code: 2–20 of A–Z, 0–9 and -', { field: 'code' });
  if (!KINDS[p.grp]) throw bad('กลุ่มโปรไม่ถูกต้อง', 'Invalid promotion group', { field: 'grp' });
  if (!KINDS[p.grp].includes(p.kind)) throw bad(`กลุ่ม ${p.grp} ใช้ชนิด ${KINDS[p.grp].join(' / ')} ได้เท่านั้น`, `Group ${p.grp} allows ${KINDS[p.grp].join(' / ')} only`, { field: 'kind' });
  if (!p.nameTh?.trim() || !p.nameEn?.trim()) throw bad('กรุณากรอกชื่อโปรทั้งภาษาไทยและอังกฤษ', 'Please enter the name in Thai and English', { field: 'name' });
  if (typeof p.value !== 'number' || !Number.isFinite(p.value) || p.value < 0) throw bad('ส่วนลดต้องเป็นตัวเลขไม่ติดลบ', 'Discount must be a non-negative number', { field: 'value' });
  if (p.kind === 'PERCENT' && p.value > 100) {
    throw new RuleError('DISCOUNT_TOO_HIGH', { th: 'ส่วนลดเกิน 100% ไม่ได้', en: 'Discount cannot exceed 100%' }, { field: 'value' });
  }
  if (p.kind === 'PERCENT' && p.value === 0) throw bad('ส่วนลดต้องมากกว่า 0%', 'Discount must be more than 0%', { field: 'value' });
  if (p.quota !== null && (!Number.isInteger(p.quota) || p.quota < 0)) throw bad('จำนวนสิทธิ์ต้องเป็นจำนวนเต็ม', 'Quota must be a whole number', { field: 'quota' });
  if (p.quota !== null && p.quota < used) throw bad(`จำนวนสิทธิ์ต้องไม่น้อยกว่าที่ใช้ไปแล้ว (${used})`, `Quota cannot be below the ${used} already used`, { field: 'quota' });
  const r = p.rules ?? {};
  if (typeof r !== 'object' || Array.isArray(r)) throw bad('เงื่อนไขไม่ถูกต้อง', 'Invalid rules', { field: 'rules' });
  for (const f of ['stayFrom', 'stayTo', 'bookFrom', 'bookTo'] as const) if (r[f] !== undefined && !isDate(r[f])) throw bad('วันที่ไม่ถูกต้อง', 'Invalid date', { field: f });
  for (const f of ['saleFrom', 'saleTo'] as const) if (r[f] !== undefined && !isInstant(r[f])) throw bad('เวลาไม่ถูกต้อง', 'Invalid date-time', { field: f });
  if (r.stayFrom && r.stayTo && r.stayTo < r.stayFrom) throw endBeforeStart('stayTo');
  if (r.bookFrom && r.bookTo && r.bookTo < r.bookFrom) throw endBeforeStart('bookTo');
  if (r.saleFrom && r.saleTo && Date.parse(r.saleTo) < Date.parse(r.saleFrom)) throw endBeforeStart('saleTo');
  for (const f of ['minNights', 'minLeadDays', 'maxLeadDays', 'every'] as const) {
    if (r[f] !== undefined && (!Number.isInteger(r[f]) || r[f]! < 0)) throw bad('ต้องเป็นจำนวนเต็มไม่ติดลบ', 'Must be a non-negative whole number', { field: f });
  }
  if (r.minLeadDays !== undefined && r.maxLeadDays !== undefined && r.maxLeadDays < r.minLeadDays) throw endBeforeStart('maxLeadDays');
  if (r.roomTypes !== undefined && (!Array.isArray(r.roomTypes) || !r.roomTypes.length || r.roomTypes.some((t) => !roomTypes.includes(t)))) {
    throw bad('ห้องที่ร่วมไม่ถูกต้อง', 'Invalid room types', { field: 'roomTypes' });
  }
  if (r.blackout !== undefined && (!Array.isArray(r.blackout) || r.blackout.some((d) => !isDate(d)))) throw bad('วันห้ามใช้ไม่ถูกต้อง', 'Invalid blackout dates', { field: 'blackout' });
  if (r.allSeasons !== undefined && (!Array.isArray(r.allSeasons) || r.allSeasons.some((s) => !SEASON_KINDS.includes(s)))) throw bad('ซีซั่นไม่ถูกต้อง', 'Invalid seasons', { field: 'allSeasons' });
}

/** Drop empty strings / nulls from rules so stored JSON stays clean. */
function cleanRules(r: PromoRules | undefined): PromoRules {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(r ?? {})) {
    if (v === undefined || v === null || v === '' || (Array.isArray(v) && !v.length) || v === false) continue;
    out[k] = v;
  }
  return out as PromoRules;
}

async function roomTypeCodes(c: pg.PoolClient) {
  return (await c.query('SELECT code FROM room_types')).rows.map((r) => r.code as string);
}

function merged(base: Partial<AdminPromotion>, i: PromotionInput) {
  return {
    code: (i.code ?? base.code ?? '').trim().toUpperCase(),
    grp: (i.grp ?? base.grp) as Promotion['grp'],
    kind: (i.kind ?? base.kind) as Promotion['kind'],
    nameTh: (i.nameTh ?? base.nameTh ?? '').trim(),
    nameEn: (i.nameEn ?? base.nameEn ?? '').trim(),
    descTh: (i.descTh ?? base.descTh ?? '').trim(),
    descEn: (i.descEn ?? base.descEn ?? '').trim(),
    value: i.value ?? base.value ?? 0,
    rules: cleanRules(i.rules ?? base.rules),
    quota: i.quota === undefined ? base.quota ?? null : i.quota,
    memberOnly: i.memberOnly ?? base.memberOnly ?? false,
    active: i.active ?? base.active ?? true,
    image: i.image === undefined ? base.image ?? null : i.image,
    sort: i.sort ?? base.sort ?? 100,
  };
}

export async function createPromotion(staffId: number, i: PromotionInput) {
  return tx(async (c) => {
    const p = merged({}, i);
    validate(p, 0, await roomTypeCodes(c));
    const { rowCount } = await c.query('SELECT 1 FROM promotions WHERE code = $1', [p.code]);
    if (rowCount) throw new RuleError('CODE_EXISTS', { th: `มีรหัสโปร ${p.code} แล้ว`, en: `Promotion ${p.code} already exists` }, { field: 'code' });
    const { rows } = await c.query(
      `INSERT INTO promotions (code, grp, kind, name_th, name_en, desc_th, desc_en, value, rules, quota, used, member_only, active, image, sort)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,0,$11,$12,$13,$14) RETURNING *`,
      [p.code, p.grp, p.kind, p.nameTh, p.nameEn, p.descTh, p.descEn, p.value, JSON.stringify(p.rules), p.quota, p.memberOnly, p.active, p.image, p.sort]);
    await audit(c, staffId, 'PROMO_CREATE', p);
    return { promotion: mapAdmin(rows[0]) };
  });
}

/** PATCH: any subset of fields. `active:false` hides it from /api/promotions immediately (US-30 ข้อ 2). */
export async function updatePromotion(staffId: number, code: string, i: PromotionInput) {
  return tx(async (c) => {
    const { rows: cur } = await c.query('SELECT * FROM promotions WHERE code = $1 FOR UPDATE', [code]);
    if (!cur.length) throw notFound('ไม่พบโปรโมชั่น', 'Promotion not found');
    const before = mapAdmin(cur[0]);
    const p = merged(before, { ...i, code: before.code });
    validate(p, before.used, await roomTypeCodes(c));
    const { rows } = await c.query(
      `UPDATE promotions SET grp=$2, kind=$3, name_th=$4, name_en=$5, desc_th=$6, desc_en=$7, value=$8, rules=$9, quota=$10,
         member_only=$11, active=$12, image=$13, sort=$14 WHERE code=$1 RETURNING *`,
      [code, p.grp, p.kind, p.nameTh, p.nameEn, p.descTh, p.descEn, p.value, JSON.stringify(p.rules), p.quota, p.memberOnly, p.active, p.image, p.sort]);
    await audit(c, staffId, i.active === false && Object.keys(i).length === 1 ? 'PROMO_DEACTIVATE' : 'PROMO_UPDATE', { code, patch: i });
    return { promotion: mapAdmin(rows[0]) };
  });
}

const PLAN_OF: Partial<Record<Promotion['kind'], Plan>> = { GREEN: 'GREEN', HONEYMOON: 'HONEYMOON', FAMILY_SUMMER: 'BREAKFAST', FESTIVAL: 'FESTIVAL' };

/** US-30 ข้อ 4: price for a room + dates with only this promotion switched on (works before it is active). */
export async function previewPromotion(i: {
  code?: string; promotion?: PromotionInput; roomType?: string; checkIn?: string; checkOut?: string; adults?: number; childAges?: number[];
}) {
  if (!isDate(i.checkIn) || !isDate(i.checkOut)) throw bad('กรุณาเลือกวันที่', 'Please choose dates', { field: 'checkIn' });
  const data = await loadRuleData();
  let promo: Promotion;
  if (i.code) {
    const p = data.promotions.find((x) => x.code === i.code);
    if (!p) throw notFound('ไม่พบโปรโมชั่น', 'Promotion not found');
    promo = p;
  } else if (i.promotion) {
    const m = merged({}, i.promotion);
    validate({ ...m, code: m.code || 'DRAFT' }, 0, Object.keys(data.roomTypes));
    promo = { code: m.code || 'DRAFT', grp: m.grp, kind: m.kind, nameTh: m.nameTh, nameEn: m.nameEn, value: m.value, rules: m.rules, quota: m.quota, used: 0, memberOnly: m.memberOnly, active: true };
  } else throw bad('กรุณาเลือกโปรโมชั่น', 'Please choose a promotion');
  promo = { ...promo, active: true };
  const roomType = i.roomType ?? promo.rules.roomTypes?.[0] ?? 'R01';
  const now = (await getClock()).now();
  const rooms = [{ roomType, adults: i.adults ?? 2, childAges: i.childAges ?? [] }];
  const plan: Plan = PLAN_OF[promo.kind] ?? 'ROOM_ONLY';
  const member = promo.memberOnly ? { verified: true, birthDate: null } : null;
  const base = { now, checkIn: i.checkIn, checkOut: i.checkOut, rooms, member };
  const before = quote({ ...base, plan: plan === 'BREAKFAST' ? 'BREAKFAST' : 'ROOM_ONLY', data: { ...data, promotions: [] } });
  let after: ReturnType<typeof quote> | null = null;
  let reason: { th: string; en: string } | null = null;
  try {
    after = quote({ ...base, plan, festivalCode: promo.kind === 'FESTIVAL' ? promo.code : undefined, nonref: promo.grp === 'STACK' && !promo.memberOnly, data: { ...data, promotions: [promo] } });
  } catch (e) {
    if (!(e instanceof RuleError)) throw e;
    reason = e.msg;
  }
  const eligible = !!after && (promo.grp === 'PRICE' ? after.pricePromo?.code === promo.code : true);
  if (!eligible && !reason) reason = { th: 'วันที่หรือห้องนี้ไม่เข้าเงื่อนไขของโปร', en: 'These dates or this room do not meet the promotion conditions' };
  const pick = (q: ReturnType<typeof quote>) => ({ roomTotal: q.roomTotal, total: q.total, lines: q.lines, nights: q.nights.map((n) => ({ night: n.night, season: n.season, price: n.price })) });
  return {
    code: promo.code, roomType, checkIn: i.checkIn, checkOut: i.checkOut, eligible, reason,
    baseRoomTotal: before.baseRoomTotal,
    before: pick(before),
    after: after ? pick(after) : pick(before),
    saved: after && eligible ? Math.max(0, before.total - after.total) : 0,
  };
}

// ---------- promo codes ----------

export interface CodeInput { code?: string; discount?: number; minRoomTotal?: number; validUntil?: string; maxUses?: number | null; active?: boolean }
const mapCode = (r: Record<string, any>) => ({ code: r.code as string, discount: r.discount as number, minRoomTotal: r.min_room_total as number, validUntil: r.valid_until as string, maxUses: r.max_uses as number | null, used: r.used as number, active: r.active as boolean });

export async function listCodes() {
  const { rows } = await query('SELECT * FROM promo_codes ORDER BY active DESC, valid_until DESC, code');
  return { codes: rows.map(mapCode) };
}

function validateCode(c: ReturnType<typeof mapCode>) {
  if (!/^[A-Z0-9][A-Z0-9-]{1,19}$/.test(c.code)) throw bad('โค้ดใช้ A–Z 0–9 และ - ได้ 2–20 ตัว', 'Code: 2–20 of A–Z, 0–9 and -', { field: 'code' });
  if (typeof c.discount !== 'number' || !(c.discount > 0)) throw bad('ส่วนลดต้องมากกว่า ฿0', 'Discount must be more than ฿0', { field: 'discount' });
  if (typeof c.minRoomTotal !== 'number' || c.minRoomTotal < 0) throw bad('ยอดขั้นต่ำต้องไม่ติดลบ', 'Minimum spend cannot be negative', { field: 'minRoomTotal' });
  if (!isDate(c.validUntil)) throw bad('วันหมดอายุไม่ถูกต้อง', 'Invalid expiry date', { field: 'validUntil' });
  if (c.maxUses !== null && (!Number.isInteger(c.maxUses) || c.maxUses < c.used || c.maxUses < 1)) {
    throw bad(`จำนวนสิทธิ์ต้องไม่น้อยกว่าที่ใช้ไปแล้ว (${c.used})`, `Max uses cannot be below the ${c.used} already used`, { field: 'maxUses' });
  }
}

export async function createCode(staffId: number, i: CodeInput) {
  const c0 = { code: (i.code ?? '').trim().toUpperCase(), discount: i.discount as number, minRoomTotal: i.minRoomTotal ?? 0, validUntil: i.validUntil as string, maxUses: i.maxUses ?? null, used: 0, active: i.active ?? true };
  validateCode(c0);
  return tx(async (c) => {
    const { rowCount } = await c.query('SELECT 1 FROM promo_codes WHERE code = $1', [c0.code]);
    if (rowCount) throw new RuleError('CODE_EXISTS', { th: `มีโค้ด ${c0.code} แล้ว`, en: `Code ${c0.code} already exists` }, { field: 'code' });
    const { rows } = await c.query('INSERT INTO promo_codes (code, discount, min_room_total, valid_until, max_uses, active) VALUES ($1,$2,$3,$4,$5,$6) RETURNING *',
      [c0.code, c0.discount, c0.minRoomTotal, c0.validUntil, c0.maxUses, c0.active]);
    await audit(c, staffId, 'CODE_CREATE', c0);
    return { code: mapCode(rows[0]) };
  });
}

export async function updateCode(staffId: number, code: string, i: CodeInput) {
  return tx(async (c) => {
    const { rows: cur } = await c.query('SELECT * FROM promo_codes WHERE code = $1 FOR UPDATE', [code]);
    if (!cur.length) throw notFound('ไม่พบโค้ด', 'Code not found');
    const b = mapCode(cur[0]);
    const n = { ...b, discount: i.discount ?? b.discount, minRoomTotal: i.minRoomTotal ?? b.minRoomTotal, validUntil: i.validUntil ?? b.validUntil, maxUses: i.maxUses === undefined ? b.maxUses : i.maxUses, active: i.active ?? b.active };
    validateCode(n);
    const { rows } = await c.query('UPDATE promo_codes SET discount=$2, min_room_total=$3, valid_until=$4, max_uses=$5, active=$6 WHERE code=$1 RETURNING *',
      [code, n.discount, n.minRoomTotal, n.validUntil, n.maxUses, n.active]);
    await audit(c, staffId, 'CODE_UPDATE', { code, patch: i });
    return { code: mapCode(rows[0]) };
  });
}
