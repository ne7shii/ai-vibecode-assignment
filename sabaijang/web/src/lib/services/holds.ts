import crypto from 'node:crypto';
import type pg from 'pg';
import { tx } from '@/lib/db';
import { getClock } from '@/lib/clock-db';
import { bkk } from '@/lib/clock';
import { stayNights } from '@/lib/rules/calendar';
import { validateStay, RULES } from '@/lib/rules/stay';
import { quote, type Plan, type Quote, type RoomSel, type Addon } from '@/lib/rules/pricing';
import { RuleError } from '@/lib/rules/types';
import type { Actor } from '@/lib/auth';
import { loadCode, loadRuleData, memberCtx, pointsBalance } from './data';
import { sweepExpired, withRetry } from './inventory';

export interface HoldInput {
  checkIn: string;
  checkOut: string;
  rooms: RoomSel[];
  plan: Plan;
  nonref?: boolean;
  festivalCode?: string;
  code?: string | null;
  redeemPoints?: number;
  addons?: Addon[];
  actor: Actor;
}

export const ROOM_GONE = () => new RuleError('ROOM_GONE', { th: 'ห้องนี้เพิ่งถูกจองไป', en: 'This room was just booked by someone else' });

export function newBookingCode(now: Date) {
  return `SJ-${bkk(now).date.slice(0, 4)}-${crypto.randomInt(100000, 1000000)}`;
}

/** Lock inventory rows in a fixed order (room type, night) and adjust a column. */
export async function adjustInventory(c: pg.PoolClient, need: Map<string, number>, column: 'held' | 'sold' | 'closed', sign: 1 | -1, check = true) {
  const keys = [...need.keys()].sort();
  if (!keys.length) return;
  const types = keys.map((k) => k.split('|')[0]);
  const nights = keys.map((k) => k.split('|')[1]);
  const { rows } = await c.query(
    `SELECT room_type_code, night, total, sold, held, closed FROM inventory_nights
     WHERE (room_type_code, night) IN (SELECT * FROM unnest($1::text[], $2::date[]))
     ORDER BY room_type_code, night FOR UPDATE`, [types, nights]);
  if (rows.length !== keys.length) throw new RuleError('NOT_OPEN', { th: 'ยังไม่เปิดขายช่วงวันที่นี้', en: 'These dates are not open for sale yet' });
  if (check && sign === 1) {
    for (const r of rows) {
      const n = need.get(`${r.room_type_code}|${r.night}`)!;
      if (r.sold + r.held + r.closed + n > r.total) throw ROOM_GONE();
    }
  }
  await c.query(
    `UPDATE inventory_nights i SET ${column} = i.${column} + ($3::int * x.n)
     FROM unnest($1::text[], $2::date[], $4::int[]) AS x(t, d, n)
     WHERE i.room_type_code = x.t AND i.night = x.d`,
    [types, nights, sign, keys.map((k) => need.get(k)!)]);
}

export function needFor(rooms: { roomType: string }[], nights: string[]) {
  const need = new Map<string, number>();
  for (const r of rooms) for (const n of nights) need.set(`${r.roomType}|${n}`, (need.get(`${r.roomType}|${n}`) ?? 0) + 1);
  return need;
}

export async function writeBookingDetail(c: pg.PoolClient, code: string, i: { rooms: RoomSel[] }, q: Quote) {
  await c.query('DELETE FROM booking_rooms WHERE booking_code = $1', [code]);
  await c.query('DELETE FROM booking_price_lines WHERE booking_code = $1', [code]);
  await c.query('DELETE FROM booking_promotions WHERE booking_code = $1', [code]);
  for (let idx = 0; idx < i.rooms.length; idx++) {
    const sel = i.rooms[idx];
    const { rows } = await c.query(
      'INSERT INTO booking_rooms (booking_code, room_type_code, adults, extra_bed) VALUES ($1,$2,$3,$4) RETURNING id',
      [code, sel.roomType, sel.adults, q.rooms[idx].extraBed]);
    const id = rows[0].id;
    for (let a = 0; a < sel.adults; a++) await c.query(`INSERT INTO booking_guests (booking_room_id, kind) VALUES ($1,'ADULT')`, [id]);
    for (const age of sel.childAges) await c.query(`INSERT INTO booking_guests (booking_room_id, kind, age_at_checkin) VALUES ($1,'CHILD',$2)`, [id, age]);
    for (const n of q.nights.filter((x) => x.room === idx)) {
      await c.query('INSERT INTO booking_nights (booking_room_id, night, season_kind, base_price) VALUES ($1,$2,$3,$4)', [id, n.night, n.season, n.price]);
    }
  }
  let sort = 0;
  for (const l of q.lines) {
    await c.query('INSERT INTO booking_price_lines (booking_code, sort, kind, label_th, label_en, amount) VALUES ($1,$2,$3,$4,$5,$6)',
      [code, ++sort, l.kind, l.labelTh, l.labelEn, l.amount]);
  }
  for (const p of q.appliedPromos) {
    await c.query('INSERT INTO booking_promotions (booking_code, promotion_code, saved) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [code, p.code, p.saved]);
  }
}

function checkRooms(rooms: RoomSel[]) {
  if (!rooms.length || rooms.length > RULES.maxRoomsPerBooking) {
    throw new RuleError('ROOM_COUNT', { th: 'จองได้ 1–5 ห้องต่อการจอง (6 ห้องขึ้นไปกรุณาขอใบเสนอราคากลุ่ม)', en: 'You can book 1–5 rooms (6+ rooms: request a group quote)' });
  }
  for (const r of rooms) {
    if (r.childAges.some((a) => a === null || !Number.isInteger(a) || a < 0 || a > 17)) {
      throw new RuleError('CHILD_AGE_REQUIRED', { th: 'กรุณากรอกอายุเด็กทุกคน', en: 'Please enter the age of every child' });
    }
  }
}

/** Step 2 → 3: lock rooms for 15 minutes and freeze the price (US-33, US-28 ข้อ 3). */
export async function createHold(i: HoldInput) {
  checkRooms(i.rooms);
  const now = (await getClock()).now();
  await sweepExpired(now);
  const data = await loadRuleData();
  const err = validateStay({ checkIn: i.checkIn, checkOut: i.checkOut, now, seasons: data.seasons })[0];
  if (err) throw new RuleError(err.code, err.msg);
  const member = await memberCtx(i.actor);
  if (i.redeemPoints) {
    if (i.actor.kind !== 'member') throw new RuleError('POINTS_MEMBER_ONLY', { th: 'แลกแต้มได้เฉพาะสมาชิก', en: 'Only members can redeem points' });
    if (i.redeemPoints > (await pointsBalance(i.actor.user.id))) throw new RuleError('POINTS_NOT_ENOUGH', { th: 'แต้มไม่พอ', en: 'Not enough points' });
  }
  const code = await loadCode(i.code);
  const q = quote({ now, checkIn: i.checkIn, checkOut: i.checkOut, rooms: i.rooms, plan: i.plan, nonref: i.nonref, festivalCode: i.festivalCode, member, code, redeemPoints: i.redeemPoints, addons: i.addons, data });
  const nights = stayNights(i.checkIn, i.checkOut);
  const holdExpiresAt = new Date(now.getTime() + RULES.holdMinutes * 60_000);
  const holdToken = crypto.randomBytes(16).toString('hex');

  const bookingCode = await withRetry(() => tx(async (c) => {
    await adjustInventory(c, needFor(i.rooms, nights), 'held', 1);
    let bc = newBookingCode(now);
    for (let k = 0; k < 5; k++) {
      const { rowCount } = await c.query('SELECT 1 FROM bookings WHERE code = $1', [bc]);
      if (!rowCount) break;
      bc = newBookingCode(now);
    }
    await c.query(
      `INSERT INTO bookings (code, user_id, lang, plan, nonref, festival_code, status, hold_token, hold_expires_at, priced_at,
         check_in, check_out, has_peak, total, room_total, deposit, due_at_hotel, free_cancel_until, promo_code,
         points_to_earn, points_redeemed, created_at,
         contact_name, contact_email, contact_phone)
       VALUES ($1,$2,$3,$4,$5,$6,'HELD',$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$9,$21,$22,$23)`,
      [bc, i.actor.kind === 'member' ? i.actor.user.id : null, i.actor.kind === 'member' ? i.actor.user.lang : 'th',
        i.plan, !!i.nonref, i.festivalCode ?? null, holdToken, holdExpiresAt, now,
        i.checkIn, i.checkOut, q.hasPeak, q.total, q.roomTotal, q.deposit, q.dueAtHotel, q.freeCancelUntil,
        q.codeApplied ? code!.code : null, member ? q.pointsToEarn : 0, i.redeemPoints ?? 0,
        i.actor.kind === 'member' ? i.actor.user.displayName : '', i.actor.kind === 'member' ? i.actor.user.email : '', i.actor.kind === 'member' ? i.actor.user.phone : '']);
    await writeBookingDetail(c, bc, i, q);
    for (const a of i.addons ?? []) {
      await c.query(`INSERT INTO booking_addons (booking_code, kind, price, status) VALUES ($1,$2,$3,'PENDING')`, [bc, a.kind, a.price]);
    }
    return bc;
  }));

  return { code: bookingCode, holdToken, holdExpiresAt: holdExpiresAt.toISOString(), status: 'HELD' as const, quote: q };
}
