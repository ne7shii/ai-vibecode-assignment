// Front office: daily arrivals/departures, check-in, check-out (points), no-show, add-ons, outbox (US-53, US-37, US-43, US-55).
import { query, tx } from '@/lib/db';
import { getClock } from '@/lib/clock-db';
import { bkk, bkkInstant } from '@/lib/clock';
import { addDays, stayNights } from '@/lib/rules/calendar';
import { RuleError, type Msg } from '@/lib/rules/types';
import { paymentGateway } from '@/lib/ports/payment';
import { sendOutbox, HOTEL_LINE_GROUP } from '@/lib/ports/notifier';
import { baht, fmtDate } from '@/lib/format';
import { buildView, type BookingView } from '../bookings';
import { adjustInventory, needFor } from '../holds';
import { withRetry } from '../inventory';
import { audit, bad, needDate, notFound } from './common';

const err = (code: string, th: string, en: string, extra: Record<string, unknown> = {}) => new RuleError(code, { th, en }, extra);
const bookingNotFound = () => notFound('ไม่พบการจอง', 'Booking not found');

async function today() {
  const now = (await getClock()).now();
  return { now, date: bkk(now).date };
}

export interface GuestRow {
  code: string; status: string; contactName: string; phone: string; email: string; isMember: boolean;
  plan: string; planLabel: Msg; nonref: boolean; checkIn: string; checkOut: string; nights: number; arrivalTime: string | null;
  rooms: BookingView['rooms']; addons: BookingView['addons']; total: number; paid: number; dueAtHotel: number; pointsToEarn: number;
  canCheckIn: boolean; canCheckOut: boolean; canNoShow: boolean;
}

function row(v: BookingView, day: string): GuestRow {
  return {
    code: v.code, status: v.status, contactName: v.contact.name, phone: v.contact.phone, email: v.contact.email, isMember: !!v.userId,
    plan: v.plan, planLabel: v.planLabel, nonref: v.nonref, checkIn: v.checkIn, checkOut: v.checkOut, nights: v.nights, arrivalTime: v.arrivalTime,
    rooms: v.rooms, addons: v.addons, total: v.total, paid: v.paid, dueAtHotel: v.dueAtHotel, pointsToEarn: v.pointsToEarn,
    canCheckIn: v.status === 'CONFIRMED' && v.checkIn <= day && day < v.checkOut,
    canCheckOut: v.status === 'CHECKED_IN',
    canNoShow: v.status === 'CONFIRMED' && day > v.checkIn,
  };
}

async function views(sql: string, params: unknown[], day: string) {
  const { rows } = await query(sql, params);
  const out: GuestRow[] = [];
  for (const r of rows) out.push(row(await buildView(r.code), day));
  return out;
}

/** US-53: who arrives, leaves and stays on a date (default: site today). */
export async function arrivals(date?: string | null) {
  const t = await today();
  const day = date ? needDate(date, 'date') : t.date;
  const [arr, dep, inHouse, overdue] = await Promise.all([
    views(`SELECT code FROM bookings WHERE check_in = $1 AND status IN ('CONFIRMED','CHECKED_IN','NO_SHOW') ORDER BY arrival_time NULLS LAST, code`, [day], t.date),
    views(`SELECT code FROM bookings WHERE check_out = $1 AND status IN ('CHECKED_IN','CHECKED_OUT') ORDER BY code`, [day], t.date),
    views(`SELECT code FROM bookings WHERE status = 'CHECKED_IN' AND check_in <= $1 AND check_out >= $1 ORDER BY check_out, code`, [day], t.date),
    views(`SELECT code FROM bookings WHERE status = 'CONFIRMED' AND check_in < $1 AND check_in >= $2 ORDER BY check_in, code`, [t.date, addDays(t.date, -7)], t.date),
  ]);
  // rooms that are free to hand out today (not closed, nobody in them, not pre-assigned to another stay)
  const { rows: free } = await query(
    `SELECT r.room_no, r.room_type_code FROM rooms r
     WHERE NOT EXISTS (SELECT 1 FROM room_closures c WHERE c.room_no = r.room_no AND c.from_date <= $1 AND c.to_date >= $1)
       AND NOT EXISTS (SELECT 1 FROM booking_rooms br JOIN bookings b ON b.code = br.booking_code
                       WHERE br.room_no = r.room_no AND (b.status = 'CHECKED_IN' OR (b.status = 'CONFIRMED' AND b.check_in <= $1 AND b.check_out > $1)))
     ORDER BY r.room_no`, [t.date]);
  const freeRooms: Record<string, string[]> = {};
  for (const r of free) (freeRooms[r.room_type_code] ??= []).push(r.room_no);
  return {
    date: day, today: t.date, arrivals: arr, departures: dep, inHouse, overdue, freeRooms,
    counts: { arrivals: arr.length, departures: dep.length, inHouse: inHouse.length },
  };
}

export async function dashboard() {
  const t = await today();
  const [a, d, h, addons, outbox] = await Promise.all([
    query(`SELECT count(*)::int n FROM bookings WHERE check_in = $1 AND status IN ('CONFIRMED','CHECKED_IN','NO_SHOW')`, [t.date]),
    query(`SELECT count(*)::int n FROM bookings WHERE check_out = $1 AND status IN ('CHECKED_IN','CHECKED_OUT')`, [t.date]),
    query(`SELECT count(*)::int n FROM bookings WHERE status = 'CHECKED_IN' AND check_in <= $1 AND check_out >= $1`, [t.date]),
    query(`SELECT count(*)::int n FROM booking_addons a JOIN bookings b ON b.code = a.booking_code WHERE a.status = 'PENDING' AND b.status IN ('CONFIRMED','CHECKED_IN')`),
    query(`SELECT count(*)::int n FROM outbox_messages WHERE created_at >= $1`, [bkkInstant(t.date)]),
  ]);
  return {
    today: t.date, now: t.now.toISOString(),
    counts: { arrivals: a.rows[0].n, departures: d.rows[0].n, inHouse: h.rows[0].n },
    pendingAddons: addons.rows[0].n, outboxToday: outbox.rows[0].n,
  };
}

/** US-53 ข้อ 2: real room number of the right type, not closed, not occupied. */
export async function checkIn(staffId: number, code: string, i: { roomNo?: string; roomNos?: string[] }) {
  const t = await today();
  await withRetry(() => tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM bookings WHERE code = $1 FOR UPDATE', [code]);
    const b = rows[0];
    if (!b) throw bookingNotFound();
    if (b.status !== 'CONFIRMED') throw err('NOT_CONFIRMED', 'การจองนี้เช็กอินไม่ได้ (สถานะไม่ใช่ยืนยันแล้ว)', 'This booking cannot be checked in (not confirmed)');
    if (t.date < b.check_in) throw err('TOO_EARLY', `ยังไม่ถึงวันเช็กอิน (${fmtDate(b.check_in)})`, `Check-in date is ${fmtDate(b.check_in, 'en')}`);
    if (t.date >= b.check_out) throw err('TOO_LATE', 'เลยวันเช็กเอาต์แล้ว', 'The stay has already ended');
    const { rows: brs } = await c.query('SELECT id, room_type_code, room_no FROM booking_rooms WHERE booking_code = $1 ORDER BY id', [code]);
    const wanted = (i.roomNos?.length ? i.roomNos : i.roomNo !== undefined ? [i.roomNo] : []).map((x) => String(x ?? '').trim());
    const picks = brs.map((br, k) => wanted[k] || br.room_no || '');
    if (picks.some((p) => !p)) throw err('ROOM_NO_REQUIRED', 'กรุณาใส่เลขห้องให้ครบทุกห้อง', 'Please enter a room number for every room');
    if (new Set(picks).size !== picks.length) throw err('ROOM_DUPLICATE', 'ใส่เลขห้องซ้ำกัน', 'The same room number was entered twice');
    for (let k = 0; k < brs.length; k++) {
      const roomNo = picks[k];
      const { rows: room } = await c.query('SELECT room_type_code FROM rooms WHERE room_no = $1', [roomNo]);
      if (!room.length) throw err('NO_ROOM', `ไม่พบห้อง ${roomNo}`, `Room ${roomNo} does not exist`, { roomNo });
      if (room[0].room_type_code !== brs[k].room_type_code) {
        throw err('ROOM_WRONG_TYPE', `ห้อง ${roomNo} เป็น ${room[0].room_type_code} แต่การจองนี้เป็น ${brs[k].room_type_code}`, `Room ${roomNo} is ${room[0].room_type_code}, this booking is ${brs[k].room_type_code}`, { roomNo });
      }
      const { rows: cl } = await c.query('SELECT from_date, to_date, reason FROM room_closures WHERE room_no = $1 AND from_date < $3 AND to_date >= $2 LIMIT 1', [roomNo, t.date, b.check_out]);
      if (cl.length) {
        throw err('ROOM_CLOSED', `ห้อง ${roomNo} ปิดซ่อม ${fmtDate(cl[0].from_date)} – ${fmtDate(cl[0].to_date)}`, `Room ${roomNo} is closed ${fmtDate(cl[0].from_date, 'en')} – ${fmtDate(cl[0].to_date, 'en')}`, { roomNo });
      }
      const { rows: occ } = await c.query(
        `SELECT b.code FROM booking_rooms br JOIN bookings b ON b.code = br.booking_code
         WHERE br.room_no = $1 AND b.code <> $2
           AND (b.status = 'CHECKED_IN' OR (b.status = 'CONFIRMED' AND b.check_in < $4 AND b.check_out > $3))
         ORDER BY b.code LIMIT 1`, [roomNo, code, t.date, b.check_out]);
      if (occ.length) throw err('ROOM_OCCUPIED', `ห้อง ${roomNo} มีแขกอยู่ (${occ[0].code})`, `Room ${roomNo} is occupied (${occ[0].code})`, { roomNo, booking: occ[0].code });
      await c.query('UPDATE booking_rooms SET room_no = $2 WHERE id = $1', [brs[k].id, roomNo]);
    }
    await c.query(`UPDATE bookings SET status = 'CHECKED_IN' WHERE code = $1`, [code]);
    await audit(c, staffId, 'CHECK_IN', { code, rooms: picks });
  }));
  return buildView(code);
}

/** US-53 + US-43 + DESIGN §5.4: CHECKED_OUT and members earn points = floor(room total after discounts / 100). */
export async function checkOut(staffId: number, code: string) {
  const t = await today();
  await tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM bookings WHERE code = $1 FOR UPDATE', [code]);
    const b = rows[0];
    if (!b) throw bookingNotFound();
    if (b.status !== 'CHECKED_IN') throw err('NOT_CHECKED_IN', 'เช็กเอาต์ได้เฉพาะแขกที่เช็กอินแล้ว', 'Only checked-in guests can be checked out');
    let points = 0;
    if (b.user_id && b.points_to_earn > 0) {
      points = b.points_to_earn;
      await c.query(`INSERT INTO points_ledger (user_id, delta, reason, booking_code, created_at) VALUES ($1,$2,'EARN',$3,$4)`, [b.user_id, points, code, t.now]);
    }
    await c.query(`UPDATE bookings SET status = 'CHECKED_OUT', points_earned = $2 WHERE code = $1`, [code, points]);
    const lang = b.lang === 'en' ? 'en' : 'th';
    if (b.contact_email) {
      await sendOutbox(c, {
        channel: 'EMAIL', recipient: b.contact_email, lang, bookingCode: code, event: 'CHECKED_OUT',
        subject: lang === 'th' ? `ขอบคุณที่มาพักกับเรา · ${code}` : `Thank you for staying with us · ${code}`,
        body: lang === 'th'
          ? `เรียน ${b.contact_name}\nขอบคุณที่มาพักที่ CWN สบายจัง รีสอร์ท${points ? `\nได้รับแต้ม +${points}` : ''}\nเขียนรีวิวได้ภายใน 30 วัน: /th/reviews/new?booking=${code}`
          : `Dear ${b.contact_name}\nThank you for staying at CWN Sabai Jang Resort.${points ? `\nPoints earned: +${points}` : ''}\nWrite a review within 30 days: /en/reviews/new?booking=${code}`,
      }, t.now);
    }
    await audit(c, staffId, 'CHECK_OUT', { code, points });
  });
  return buildView(code);
}

/** §6 + DESIGN §3.5: after 23:59 of the check-in day → NO_SHOW, deposit kept, remaining nights back on sale. */
export async function noShow(staffId: number, code: string) {
  const t = await today();
  await withRetry(() => tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM bookings WHERE code = $1 FOR UPDATE', [code]);
    const b = rows[0];
    if (!b) throw bookingNotFound();
    if (b.status !== 'CONFIRMED') throw err('NOT_CONFIRMED', 'กด No-show ได้เฉพาะการจองที่ยืนยันแล้วและยังไม่เช็กอิน', 'No-show is only for confirmed bookings not yet checked in');
    if (t.now < bkkInstant(addDays(b.check_in, 1))) {
      throw err('NO_SHOW_TOO_EARLY', `กด No-show ได้หลัง 23:59 ของวันเช็กอิน (${fmtDate(b.check_in)})`, `No-show is available after 23:59 on the check-in day (${fmtDate(b.check_in, 'en')})`);
    }
    const remaining = stayNights(b.check_in, b.check_out).filter((n) => n >= t.date);
    const { rows: brs } = await c.query('SELECT room_type_code FROM booking_rooms WHERE booking_code = $1', [code]);
    if (remaining.length) await adjustInventory(c, needFor(brs.map((r) => ({ roomType: r.room_type_code })), remaining), 'sold', -1, false);
    await c.query(`UPDATE bookings SET status = 'NO_SHOW', due_at_hotel = 0 WHERE code = $1`, [code]);
    await sendOutbox(c, {
      channel: 'LINE', recipient: HOTEL_LINE_GROUP, lang: 'th', bookingCode: code, event: 'NO_SHOW',
      subject: `[No-show] ${code}`,
      body: `[No-show] ${code} · ${brs.map((r) => r.room_type_code).join(', ')} · ${fmtDate(b.check_in)} – ${fmtDate(b.check_out)} · ${b.contact_name} · ไม่คืนมัดจำ ${baht(Number(b.paid))} · คืนห้อง ${remaining.length} คืน`,
    }, t.now);
    await audit(c, staffId, 'NO_SHOW', { code, releasedNights: remaining });
  }));
  return buildView(code);
}

// ---------- add-ons (US-37) ----------

const ADDON_NAME: Record<string, Msg> = {
  TRANSFER: { th: 'รถรับส่งสนามบิน', en: 'Airport transfer' },
  VAN: { th: 'รถตู้รับส่งสนามบิน', en: 'Airport van transfer' },
  EARLY_IN: { th: 'Early check-in 10:00', en: 'Early check-in 10:00' },
  LATE_OUT: { th: 'Late check-out 18:00', en: 'Late check-out 18:00' },
};

export async function listAddons(i: { status?: string | null } = {}) {
  const { rows } = await query(
    `SELECT a.*, b.contact_name, b.check_in, b.check_out, b.status AS booking_status
     FROM booking_addons a JOIN bookings b ON b.code = a.booking_code
     WHERE b.status IN ('CONFIRMED','CHECKED_IN','CHECKED_OUT') AND ($1::text IS NULL OR a.status = $1)
     ORDER BY (a.status = 'PENDING') DESC, b.check_in, a.id`, [i.status || null]);
  return {
    addons: rows.map((r) => ({
      id: r.id as number, bookingCode: r.booking_code as string, contactName: r.contact_name as string, checkIn: r.check_in as string, checkOut: r.check_out as string,
      bookingStatus: r.booking_status as string, kind: r.kind as string, nameTh: ADDON_NAME[r.kind]?.th ?? r.kind, nameEn: ADDON_NAME[r.kind]?.en ?? r.kind,
      price: r.price as number, status: r.status as string, flightNo: r.flight_no as string | null, arriveTime: r.arrive_time as string | null,
    })),
  };
}

/** Confirm or reject. Rejected → that part is not charged: lower the amount due at the hotel first, refund the rest (US-37 ข้อ 2). */
export async function decideAddon(staffId: number, id: number, status: string) {
  if (status !== 'CONFIRMED' && status !== 'REJECTED') throw bad('สถานะต้องเป็น CONFIRMED หรือ REJECTED', 'Status must be CONFIRMED or REJECTED', { field: 'status' });
  const t = await today();
  const out = await tx(async (c) => {
    const { rows: ar } = await c.query('SELECT * FROM booking_addons WHERE id = $1', [id]);
    if (!ar.length) throw notFound('ไม่พบบริการเสริม', 'Add-on not found');
    const { rows } = await c.query('SELECT * FROM bookings WHERE code = $1 FOR UPDATE', [ar[0].booking_code]);
    const { rows: locked } = await c.query('SELECT * FROM booking_addons WHERE id = $1 FOR UPDATE', [id]);
    const a = locked[0], b = rows[0];
    if (a.status !== 'PENDING') throw err('ADDON_DECIDED', 'บริการเสริมนี้ถูกตัดสินแล้ว', 'This add-on has already been decided');
    if (!['CONFIRMED', 'CHECKED_IN'].includes(b.status)) throw err('BOOKING_NOT_ACTIVE', 'การจองนี้ไม่อยู่ในสถานะที่แก้ได้', 'This booking is not active');
    await c.query('UPDATE booking_addons SET status = $2 WHERE id = $1', [id, status]);
    let refund = 0;
    const price = Number(a.price);
    if (status === 'REJECTED') {
      const fromDue = Math.min(Number(b.due_at_hotel), price);
      refund = Math.min(price - fromDue, Number(b.paid) - Number(b.refunded));
      const key = `${b.code}:addon:${id}`;
      if (refund > 0) {
        await paymentGateway().refund({ key, amount: refund });
        const { rows: last } = await c.query(`SELECT method, card_last4 FROM payments WHERE booking_code=$1 AND status='SUCCESS' AND direction='CHARGE' ORDER BY id DESC LIMIT 1`, [b.code]);
        await c.query(`INSERT INTO payments (booking_code, method, direction, amount, status, card_last4, idempotency_key, created_at) VALUES ($1,$2,'REFUND',$3,'SUCCESS',$4,$5,$6)`,
          [b.code, last[0]?.method ?? 'CARD', refund, last[0]?.card_last4 ?? null, key, t.now]);
      }
      const { rows: s } = await c.query('SELECT COALESCE(MAX(sort),0)::int AS m FROM booking_price_lines WHERE booking_code = $1', [b.code]);
      const name = ADDON_NAME[a.kind] ?? { th: a.kind, en: a.kind };
      await c.query(`INSERT INTO booking_price_lines (booking_code, sort, kind, label_th, label_en, amount) VALUES ($1,$2,'ADDON_REJECTED',$3,$4,$5)`,
        [b.code, s[0].m + 1, `${name.th} (โรงแรมยืนยันไม่ได้ · ไม่คิดเงิน)`, `${name.en} (not available · not charged)`, -price]);
      await c.query('UPDATE bookings SET total = total - $2, due_at_hotel = due_at_hotel - $3, refunded = refunded + $4 WHERE code = $1', [b.code, price, fromDue, refund]);
    }
    const lang = b.lang === 'en' ? 'en' : 'th';
    const name = ADDON_NAME[a.kind] ?? { th: a.kind, en: a.kind };
    if (b.contact_email) {
      await sendOutbox(c, {
        channel: 'EMAIL', recipient: b.contact_email, lang, bookingCode: b.code, event: status === 'CONFIRMED' ? 'ADDON_CONFIRMED' : 'ADDON_REJECTED',
        subject: lang === 'th'
          ? `${status === 'CONFIRMED' ? 'ยืนยัน' : 'ขออภัย ไม่สามารถให้บริการ'} ${name.th} · ${b.code}`
          : `${status === 'CONFIRMED' ? 'Confirmed' : 'Sorry, not available'}: ${name.en} · ${b.code}`,
        body: lang === 'th'
          ? `เรียน ${b.contact_name}\n${status === 'CONFIRMED' ? `โรงแรมยืนยัน ${name.th} สำหรับการจอง ${b.code} แล้ว` : `โรงแรมไม่สามารถให้บริการ ${name.th} ได้ ไม่คิดค่าบริการ ${baht(price)}${refund ? ` และคืนเงิน ${baht(refund)} ทางช่องทางเดิม` : ''}`}`
          : `Dear ${b.contact_name}\n${status === 'CONFIRMED' ? `${name.en} is confirmed for booking ${b.code}.` : `${name.en} is not available. You will not be charged ${baht(price)}${refund ? ` and ${baht(refund)} is refunded to your original payment method` : ''}.`}`,
      }, t.now);
    }
    await audit(c, staffId, status === 'CONFIRMED' ? 'ADDON_CONFIRM' : 'ADDON_REJECT', { id, code: b.code, refund });
    return { code: b.code as string, refund };
  });
  const { addons } = await listAddons({});
  return { addon: addons.find((x) => x.id === id)!, refund: out.refund, booking: await buildView(out.code) };
}

// ---------- outbox (US-55) ----------

export async function listOutbox(i: { channel?: string | null; q?: string | null; limit?: number }) {
  const limit = Math.min(Math.max(i.limit ?? 100, 1), 500);
  const q = i.q?.trim() ? `%${i.q.trim()}%` : null;
  const { rows } = await query(
    `SELECT * FROM outbox_messages
     WHERE ($1::text IS NULL OR channel = $1) AND ($2::text IS NULL OR booking_code ILIKE $2 OR recipient ILIKE $2 OR subject ILIKE $2)
     ORDER BY id DESC LIMIT $3`, [i.channel || null, q, limit]);
  return {
    messages: rows.map((r) => ({
      id: r.id as number, channel: r.channel as 'EMAIL' | 'LINE', recipient: r.recipient as string, lang: r.lang as string, subject: r.subject as string,
      body: r.body as string, bookingCode: r.booking_code as string | null, event: r.event as string, createdAt: new Date(r.created_at).toISOString(),
    })),
  };
}
