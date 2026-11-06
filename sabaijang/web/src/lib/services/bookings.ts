import type pg from 'pg';
import { query, tx, Db } from '@/lib/db';
import { getClock } from '@/lib/clock-db';
import { AppError } from '@/lib/http';
import { stayNights } from '@/lib/rules/calendar';
import { quote, type Plan, type Addon, type RoomSel } from '@/lib/rules/pricing';
import { RuleError, type Msg } from '@/lib/rules/types';
import { loadMember, type Actor } from '@/lib/auth';
import { paymentGateway, type ChargeRequest } from '@/lib/ports/payment';
import { sendOutbox, HOTEL_LINE_GROUP, SALES_EMAIL } from '@/lib/ports/notifier';
import { loadCode, loadRuleData, memberCtx, pointsBalance } from './data';
import { adjustInventory, needFor } from './holds';
import { confirmationEmail, hotelLine } from './emails';

export const ADDON_PRICES = { TRANSFER: 800, VAN: 1200, EARLY_IN: 800, LATE_OUT: 1000 } as const; // §3
const ADDON_LABEL: Record<string, Msg> = {
  TRANSFER: { th: 'รถรับส่งสนามบิน (รถเก๋ง ≤ 3 คน)', en: 'Airport transfer (car, up to 3)' },
  VAN: { th: 'รถรับส่งสนามบิน (รถตู้ 4–8 คน)', en: 'Airport transfer (van, 4–8)' },
  EARLY_IN: { th: 'Early check-in 10:00 (รอยืนยัน)', en: 'Early check-in 10:00 (on request)' },
  LATE_OUT: { th: 'Late check-out 18:00 (รอยืนยัน)', en: 'Late check-out 18:00 (on request)' },
};

export const PLAN_LABELS: Record<Plan, Msg> = {
  ROOM_ONLY: { th: 'ห้องอย่างเดียว', en: 'Room only' },
  BREAKFAST: { th: 'รวมอาหารเช้า', en: 'Breakfast included' },
  GREEN: { th: 'Green Season Getaway', en: 'Green Season Getaway' },
  HONEYMOON: { th: 'แพ็กเกจฮันนีมูน', en: 'Honeymoon package' },
  FESTIVAL: { th: 'แพ็กเกจเทศกาล', en: 'Festival package' },
};

export type BookingView = Awaited<ReturnType<typeof buildView>>;
const notFound = () => new AppError(404, 'NOT_FOUND', { th: 'ไม่พบการจอง', en: 'Booking not found' });
const err = (code: string, th: string, en: string, extra = {}) => new RuleError(code, { th, en }, extra);

export async function buildView(code: string, db?: Db) {
  const { rows } = await query('SELECT * FROM bookings WHERE code = $1', [code], db);
  const b = rows[0];
  if (!b) throw notFound();
  const [rooms, guests, lines, promos, addons, taxInv, payments] = await Promise.all([
    query(`SELECT br.*, rt.name_th, rt.name_en FROM booking_rooms br JOIN room_types rt ON rt.code = br.room_type_code WHERE booking_code = $1 ORDER BY br.id`, [code], db),
    query(`SELECT g.* FROM booking_guests g JOIN booking_rooms br ON br.id = g.booking_room_id WHERE br.booking_code = $1 ORDER BY g.id`, [code], db),
    query('SELECT kind, label_th, label_en, amount FROM booking_price_lines WHERE booking_code = $1 ORDER BY sort', [code], db),
    query(`SELECT bp.promotion_code, bp.saved, p.name_th, p.name_en FROM booking_promotions bp LEFT JOIN promotions p ON p.code = bp.promotion_code WHERE booking_code = $1`, [code], db),
    query('SELECT id, kind, price, status, flight_no, arrive_time FROM booking_addons WHERE booking_code = $1 ORDER BY id', [code], db),
    query('SELECT company, address, tax_id, branch FROM tax_invoice_requests WHERE booking_code = $1', [code], db),
    query(`SELECT method, direction, amount, status, card_last4, created_at FROM payments WHERE booking_code = $1 ORDER BY id`, [code], db),
  ]);
  const { rows: nightRows } = await query(
    `SELECT bn.booking_room_id, br.room_type_code, bn.night, bn.season_kind, bn.base_price
     FROM booking_nights bn JOIN booking_rooms br ON br.id = bn.booking_room_id
     WHERE br.booking_code = $1 ORDER BY br.id, bn.night`, [code], db);
  const roomIds = rooms.rows.map((r) => r.id);
  const plan = b.plan as Plan;
  const planLabel = plan === 'FESTIVAL' || plan === 'HONEYMOON' || plan === 'GREEN'
    ? { th: promos.rows.find((p) => p.promotion_code === b.festival_code || ['PR-10', 'PR-11'].includes(p.promotion_code))?.name_th ?? PLAN_LABELS[plan].th, en: promos.rows.find((p) => p.promotion_code === b.festival_code || ['PR-10', 'PR-11'].includes(p.promotion_code))?.name_en ?? PLAN_LABELS[plan].en }
    : { th: PLAN_LABELS[plan].th + (b.nonref ? ' · ไม่คืนเงิน' : ''), en: PLAN_LABELS[plan].en + (b.nonref ? ' · Non-refundable' : '') };
  return {
    code: b.code as string,
    status: b.status as string,
    userId: b.user_id as number | null,
    lang: b.lang as string,
    plan,
    planLabel,
    nonref: b.nonref as boolean,
    festivalCode: b.festival_code as string | null,
    checkIn: b.check_in as string,
    checkOut: b.check_out as string,
    nights: stayNights(b.check_in, b.check_out).length,
    hasPeak: b.has_peak as boolean,
    holdExpiresAt: b.status === 'HELD' && b.hold_expires_at ? new Date(b.hold_expires_at).toISOString() : null,
    contact: { name: b.contact_name as string, email: b.contact_email as string, phone: b.contact_phone as string },
    rooms: rooms.rows.map((r) => ({
      id: r.id as number, roomType: r.room_type_code as string, nameTh: r.name_th as string, nameEn: r.name_en as string,
      adults: r.adults as number, childAges: guests.rows.filter((g) => g.booking_room_id === r.id && g.kind === 'CHILD').map((g) => g.age_at_checkin as number),
      extraBed: r.extra_bed as boolean, roomNo: r.room_no as string | null, specialRequest: r.special_request as string,
      bedPref: r.bed_pref as string | null, highFloor: r.high_floor as boolean,
    })),
    nightly: nightRows.map((n) => ({ room: roomIds.indexOf(n.booking_room_id), roomType: n.room_type_code as string, night: n.night as string, season: n.season_kind as string, price: n.base_price as number })),
    codeError: (b.code_error ?? null) as Msg | null,
    lines: lines.rows.map((l) => ({ kind: l.kind as string, labelTh: l.label_th as string, labelEn: l.label_en as string, amount: l.amount as number })),
    promotions: promos.rows.map((p) => ({ code: p.promotion_code as string, nameTh: (p.name_th ?? p.promotion_code) as string, nameEn: (p.name_en ?? p.promotion_code) as string, saved: p.saved as number })),
    total: b.total as number,
    roomTotal: b.room_total as number,
    deposit: b.deposit as number,
    paid: b.paid as number,
    refunded: b.refunded as number,
    dueAtHotel: b.due_at_hotel as number,
    saved: lines.rows.filter((l) => ['PROMO', 'NONREF', 'MEMBER', 'CODE'].includes(l.kind)).reduce((a, l) => a - l.amount, 0),
    freeCancelUntil: b.free_cancel_until ? new Date(b.free_cancel_until).toISOString() : null,
    promoCode: b.promo_code as string | null,
    pointsToEarn: b.points_to_earn as number,
    pointsRedeemed: b.points_redeemed as number,
    pointsEarned: b.points_earned as number,
    addons: addons.rows.map((a) => ({ id: a.id as number, kind: a.kind as string, labelTh: ADDON_LABEL[a.kind].th, labelEn: ADDON_LABEL[a.kind].en, price: a.price as number, status: a.status as string, flightNo: a.flight_no as string | null, arriveTime: a.arrive_time as string | null })),
    taxInvoice: taxInv.rows[0] ? { company: taxInv.rows[0].company as string, address: taxInv.rows[0].address as string, taxId: taxInv.rows[0].tax_id as string, branch: taxInv.rows[0].branch as string } : null,
    dinnerNight: b.dinner_night as string | null,
    arrivalTime: b.arrival_time as string | null,
    marketingConsent: b.marketing_consent as boolean,
    nonrefAck: b.nonref_ack as boolean,
    payments: payments.rows.map((p) => ({ method: p.method as string, direction: p.direction as string, amount: p.amount as number, status: p.status as string, last4: p.card_last4 as string | null, at: new Date(p.created_at).toISOString() })),
    createdAt: new Date(b.created_at).toISOString(),
    birthdayUsed: b.birthday_used as boolean,
  };
}

export interface Access { token?: string | null; manage?: boolean }

async function checkAccess(code: string, access: Access, actor: Actor, db?: Db) {
  const { rows } = await query('SELECT hold_token, user_id, status FROM bookings WHERE code = $1', [code], db);
  const b = rows[0];
  if (!b) throw notFound();
  const ok = (access.token && access.token === b.hold_token)
    || access.manage
    || (actor.kind === 'member' && b.user_id === actor.user.id)
    || (actor.kind === 'staff' && ['GM', 'FRONT'].includes(actor.staff.role));
  if (!ok) throw notFound();
  return b;
}

/** Re-price a HELD booking with the time it was held (keeps Flash Sale price, US-28 ข้อ 3) and the current member. */
async function reprice(c: pg.PoolClient, code: string) {
  const { rows } = await c.query('SELECT * FROM bookings WHERE code = $1', [code]);
  const b = rows[0];
  const view = await buildView(code, c);
  const actor: Actor = b.user_id ? { kind: 'member', user: (await loadMember(b.user_id, c))! } : { kind: 'guest' };
  const member = await memberCtx(actor, c);
  const data = await loadRuleData(c);
  const promoCode: string | null = b.promo_code ?? null;
  const rooms: RoomSel[] = view.rooms.map((r) => ({ roomType: r.roomType, adults: r.adults, childAges: r.childAges, extraBed: r.extraBed }));
  const addons: Addon[] = view.addons.map((a) => ({ kind: a.kind, labelTh: a.labelTh, labelEn: a.labelEn, price: a.price }));
  const q = quote({
    now: new Date(b.priced_at), checkIn: b.check_in, checkOut: b.check_out, rooms, plan: b.plan, nonref: b.nonref,
    festivalCode: b.festival_code ?? undefined, member, code: await loadCode(promoCode, c), redeemPoints: b.points_redeemed || undefined, addons, data,
  });
  await c.query(
    `UPDATE bookings SET total=$2, room_total=$3, deposit=$4, due_at_hotel=$5, free_cancel_until=$6, promo_code=$7, points_to_earn=$8 WHERE code=$1`,
    [code, q.total, q.roomTotal, q.deposit, q.dueAtHotel, q.freeCancelUntil, q.codeApplied ? promoCode?.toUpperCase() : null, member ? q.pointsToEarn : 0]);
  await c.query('DELETE FROM booking_price_lines WHERE booking_code = $1', [code]);
  await c.query('DELETE FROM booking_promotions WHERE booking_code = $1', [code]);
  let sort = 0;
  for (const l of q.lines) await c.query('INSERT INTO booking_price_lines (booking_code, sort, kind, label_th, label_en, amount) VALUES ($1,$2,$3,$4,$5,$6)', [code, ++sort, l.kind, l.labelTh, l.labelEn, l.amount]);
  for (const p of q.appliedPromos) await c.query('INSERT INTO booking_promotions (booking_code, promotion_code, saved) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [code, p.code, p.saved]);
  return q;
}

/** Attach a member who signs in mid-booking, so the price becomes the member price (US-22 ข้อ 3). */
async function attachMember(code: string, actor: Actor) {
  if (actor.kind !== 'member') return;
  await tx(async (c) => {
    const { rows } = await c.query(`SELECT user_id, status, contact_email FROM bookings WHERE code = $1 FOR UPDATE`, [code]);
    const b = rows[0];
    if (!b || b.status !== 'HELD' || b.user_id === actor.user.id) return;
    await c.query(
      `UPDATE bookings SET user_id = $2, lang = $3,
         contact_name = CASE WHEN contact_email = '' THEN $4 ELSE contact_name END,
         contact_phone = CASE WHEN contact_email = '' THEN $5 ELSE contact_phone END,
         contact_email = CASE WHEN contact_email = '' THEN $6 ELSE contact_email END
       WHERE code = $1`, [code, actor.user.id, actor.user.lang, actor.user.displayName, actor.user.phone, actor.user.email]);
    await reprice(c, code);
  });
}

export async function getBooking(code: string, access: Access, actor: Actor) {
  await checkAccess(code, access, actor);
  await attachMember(code, actor);
  return buildView(code);
}

export interface DetailsInput {
  contact?: { name: string; email: string; phone: string };
  rooms?: { specialRequest?: string; bedPref?: 'KING' | 'TWIN' | null; highFloor?: boolean }[];
  arrivalTime?: string | null;
  marketingConsent?: boolean;
  nonrefAck?: boolean;
  taxInvoice?: { company: string; address: string; taxId: string; branch: string } | null;
  dinnerNight?: string | null;
  addons?: { kind: 'TRANSFER' | 'EARLY_IN' | 'LATE_OUT'; flightNo?: string; arriveTime?: string }[];
  code?: string | null;
  redeemPoints?: number;
  lang?: 'th' | 'en';
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export async function updateDetails(code: string, token: string | null, d: DetailsInput, actor: Actor) {
  await checkAccess(code, { token }, actor);
  await attachMember(code, actor);
  await tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM bookings WHERE code = $1 FOR UPDATE', [code]);
    const b = rows[0];
    if (b.status !== 'HELD') throw err('NOT_EDITABLE', 'แก้ไขการจองนี้ไม่ได้แล้ว', 'This booking can no longer be edited');
    if (d.contact) {
      const name = d.contact.name?.trim(), email = d.contact.email?.trim(), phone = d.contact.phone?.replace(/[^\d+]/g, '');
      if (!name) throw err('CONTACT_INVALID', 'กรุณากรอกชื่อ–นามสกุล', 'Please enter your full name', { field: 'name' });
      if (!email || !EMAIL_RE.test(email)) throw err('CONTACT_INVALID', 'อีเมลไม่ถูกต้อง', 'Invalid email address', { field: 'email' });
      if (!phone || phone.replace(/\D/g, '').length < 9) throw err('CONTACT_INVALID', 'เบอร์โทรไม่ถูกต้อง', 'Invalid phone number', { field: 'phone' });
      await c.query('UPDATE bookings SET contact_name=$2, contact_email=$3, contact_phone=$4 WHERE code=$1', [code, name, email, d.contact.phone.trim()]);
    }
    if (d.lang) await c.query('UPDATE bookings SET lang=$2 WHERE code=$1', [code, d.lang]);
    if (d.rooms) {
      const { rows: brs } = await c.query('SELECT id FROM booking_rooms WHERE booking_code = $1 ORDER BY id', [code]);
      for (let i = 0; i < d.rooms.length && i < brs.length; i++) {
        const r = d.rooms[i];
        if ((r.specialRequest ?? '').length > 500) throw err('REQUEST_TOO_LONG', 'คำขอพิเศษยาวได้ไม่เกิน 500 ตัวอักษร', 'Special requests are limited to 500 characters');
        await c.query('UPDATE booking_rooms SET special_request = $2, bed_pref = $3, high_floor = $4 WHERE id = $1', [brs[i].id, r.specialRequest ?? '', r.bedPref ?? null, !!r.highFloor]);
      }
    }
    if (d.arrivalTime !== undefined) await c.query('UPDATE bookings SET arrival_time=$2 WHERE code=$1', [code, d.arrivalTime]);
    if (d.marketingConsent !== undefined) await c.query('UPDATE bookings SET marketing_consent=$2 WHERE code=$1', [code, d.marketingConsent]);
    if (d.nonrefAck !== undefined) await c.query('UPDATE bookings SET nonref_ack=$2 WHERE code=$1', [code, d.nonrefAck]);
    if (d.taxInvoice !== undefined) {
      await c.query('DELETE FROM tax_invoice_requests WHERE booking_code = $1', [code]);
      if (d.taxInvoice) {
        const t = d.taxInvoice;
        if (!/^\d{13}$/.test((t.taxId ?? '').trim())) throw err('TAX_ID_INVALID', 'เลขประจำตัวผู้เสียภาษีต้องมี 13 หลัก', 'Tax ID must be 13 digits');
        if (!t.company?.trim() || !t.address?.trim() || !t.branch?.trim()) throw err('TAX_INFO_REQUIRED', 'กรุณากรอกชื่อบริษัท ที่อยู่ และสาขา', 'Please enter company, address and branch');
        await c.query('INSERT INTO tax_invoice_requests (booking_code, company, address, tax_id, branch) VALUES ($1,$2,$3,$4,$5)', [code, t.company.trim(), t.address.trim(), t.taxId.trim(), t.branch.trim()]);
      }
    }
    if (d.dinnerNight !== undefined) {
      if (d.dinnerNight && !stayNights(b.check_in, b.check_out).includes(d.dinnerNight)) {
        throw err('DINNER_NIGHT_INVALID', 'กรุณาเลือกคืนดินเนอร์ในช่วงที่เข้าพัก', 'Please choose a dinner night within your stay');
      }
      await c.query('UPDATE bookings SET dinner_night=$2 WHERE code=$1', [code, d.dinnerNight]);
    }
    if (d.addons) {
      const { rows: g } = await c.query(`SELECT count(*)::int n FROM booking_guests g JOIN booking_rooms br ON br.id = g.booking_room_id WHERE br.booking_code = $1`, [code]);
      await c.query('DELETE FROM booking_addons WHERE booking_code = $1', [code]);
      for (const a of d.addons) {
        let kind: string = a.kind;
        if (a.kind === 'TRANSFER') {
          if (!a.flightNo?.trim()) throw err('FLIGHT_REQUIRED', 'รถรับส่งต้องกรอกเลขเที่ยวบินและเวลาถึง', 'Airport transfer needs a flight number and arrival time');
          kind = g[0].n > 3 ? 'VAN' : 'TRANSFER';
        }
        if (!(kind in ADDON_PRICES)) continue;
        await c.query(`INSERT INTO booking_addons (booking_code, kind, price, status, flight_no, arrive_time) VALUES ($1,$2,$3,'PENDING',$4,$5)`,
          [code, kind, ADDON_PRICES[kind as keyof typeof ADDON_PRICES], a.flightNo ?? null, a.arriveTime ?? null]);
      }
    }
    if (d.code !== undefined) await c.query('UPDATE bookings SET promo_code = NULL WHERE code = $1', [code]);
    if (d.redeemPoints !== undefined) {
      if (d.redeemPoints && (!b.user_id || d.redeemPoints > await pointsBalance(b.user_id, c))) throw err('POINTS_NOT_ENOUGH', 'แต้มไม่พอ', 'Not enough points');
      if (d.redeemPoints % 100) throw err('POINTS_STEP', 'แลกแต้มได้ชุดละ 100 แต้ม', 'Points can be redeemed in sets of 100');
      await c.query('UPDATE bookings SET points_redeemed=$2 WHERE code=$1', [code, d.redeemPoints]);
    }
    const q = await repriceWithCode(c, code, d.code);
    return q;
  });
  const view = await buildView(code);
  return view;
}


async function repriceWithCode(c: pg.PoolClient, code: string, attempted: string | null | undefined) {
  if (attempted !== undefined && attempted !== null && attempted.trim()) {
    await c.query('UPDATE bookings SET promo_code = NULL WHERE code = $1', [code]);
    // try the code; reprice() reads promo_code, so pass it through a temp column-less path
    const { rows } = await c.query('SELECT * FROM bookings WHERE code = $1', [code]);
    const b = rows[0];
    const view = await buildView(code, c);
    const actor: Actor = b.user_id ? { kind: 'member', user: (await loadMember(b.user_id, c))! } : { kind: 'guest' };
    const data = await loadRuleData(c);
    const q = quote({
      now: new Date(b.priced_at), checkIn: b.check_in, checkOut: b.check_out,
      rooms: view.rooms.map((r) => ({ roomType: r.roomType, adults: r.adults, childAges: r.childAges, extraBed: r.extraBed })),
      plan: b.plan, nonref: b.nonref, festivalCode: b.festival_code ?? undefined, member: await memberCtx(actor, c),
      code: await loadCode(attempted, c), redeemPoints: b.points_redeemed || undefined,
      addons: view.addons.map((a) => ({ kind: a.kind, labelTh: a.labelTh, labelEn: a.labelEn, price: a.price })), data,
    });
    await c.query('UPDATE bookings SET code_error = $2 WHERE code = $1', [code, q.codeError ? JSON.stringify(q.codeError) : null]);
    if (q.codeApplied) await c.query('UPDATE bookings SET promo_code = $2 WHERE code = $1', [code, attempted.trim().toUpperCase()]);
  } else if (attempted !== undefined) {
    await c.query('UPDATE bookings SET code_error = NULL WHERE code = $1', [code]);
  }
  return reprice(c, code);
}

export type PayInput = { method: 'CARD'; cardNumber: string } | { method: 'PROMPTPAY'; confirmed: boolean };

/** Step 4: pay the deposit (or full for Non-refundable) through the fake gateway (US-34). */
export async function pay(code: string, token: string | null, p: PayInput, actor: Actor) {
  await checkAccess(code, { token }, actor);
  const now = (await getClock()).now();
  const outcome = await tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM bookings WHERE code = $1 FOR UPDATE', [code]);
    const b = rows[0];
    if (['CONFIRMED', 'CHECKED_IN', 'CHECKED_OUT'].includes(b.status)) return 'ok' as const; // double click → same result
    if (b.status !== 'HELD') throw err('NOT_PAYABLE', 'การจองนี้จ่ายเงินไม่ได้ กรุณาเริ่มใหม่', 'This booking cannot be paid, please start again');
    const nights = stayNights(b.check_in, b.check_out);
    const { rows: brs } = await c.query('SELECT room_type_code FROM booking_rooms WHERE booking_code = $1', [code]);
    const need = needFor(brs.map((r) => ({ roomType: r.room_type_code })), nights);
    if (new Date(b.hold_expires_at) <= now) {
      await c.query(`UPDATE bookings SET status = 'EXPIRED' WHERE code = $1`, [code]);
      await adjustInventory(c, need, 'held', -1, false);
      return 'expired' as const;
    }
    if (!b.contact_name || !b.contact_email || !b.contact_phone) throw err('CONTACT_REQUIRED', 'กรุณากรอกชื่อ อีเมล และเบอร์โทรก่อนชำระเงิน', 'Please enter your name, email and phone before paying');
    if (b.nonref && !b.nonref_ack) throw err('NONREF_ACK_REQUIRED', 'กรุณาติ๊กยอมรับเงื่อนไขไม่คืนเงินก่อนชำระเงิน', 'Please accept the non-refundable terms before paying');
    if (b.plan === 'HONEYMOON' && !b.dinner_night) throw err('DINNER_NIGHT_REQUIRED', 'กรุณาเลือกคืนที่ต้องการดินเนอร์', 'Please choose your dinner night');
    if (b.promo_code) {
      const { rows: pc } = await c.query('SELECT used, max_uses FROM promo_codes WHERE code = $1 FOR UPDATE', [b.promo_code]);
      if (pc[0].max_uses !== null && pc[0].used >= pc[0].max_uses) throw err('CODE_USED_UP', `โค้ด ${b.promo_code} ถูกใช้ครบสิทธิ์แล้ว`, `Code ${b.promo_code} has been fully used`);
    }
    if (b.points_redeemed && b.points_redeemed > await pointsBalance(b.user_id, c)) throw err('POINTS_NOT_ENOUGH', 'แต้มไม่พอ', 'Not enough points');

    const amount = Number(b.deposit);
    const req: ChargeRequest = p.method === 'CARD'
      ? { key: code, amount, method: 'CARD', cardNumber: p.cardNumber ?? '' }
      : { key: code, amount, method: 'PROMPTPAY', confirmed: !!p.confirmed };
    const res = await paymentGateway().charge(req);
    if (res.status !== 'SUCCESS') {
      await c.query(`INSERT INTO payments (booking_code, method, direction, amount, status, card_last4, idempotency_key, created_at) VALUES ($1,$2,'CHARGE',$3,'FAILED',$4,$5,$6)`,
        [code, p.method, amount, res.last4 ?? null, `${code}:fail:${now.getTime()}:${Math.random().toString(36).slice(2, 8)}`, now]);
      return res.reason === 'NOT_PAID' ? 'notpaid' as const : 'declined' as const;
    }
    await adjustInventory(c, need, 'held', -1, false);
    await adjustInventory(c, need, 'sold', 1, false);
    await c.query(`UPDATE bookings SET status='CONFIRMED', paid=$2, confirmed_at=$3, hold_expires_at=NULL WHERE code=$1`, [code, amount, now]);
    await c.query(`INSERT INTO payments (booking_code, method, direction, amount, status, card_last4, idempotency_key, created_at) VALUES ($1,$2,'CHARGE',$3,'SUCCESS',$4,$1,$5)`,
      [code, p.method, amount, res.last4 ?? null, now]);
    if (b.promo_code) await c.query('UPDATE promo_codes SET used = used + 1 WHERE code = $1', [b.promo_code]);
    const { rows: applied } = await c.query(`SELECT bp.promotion_code, p.rules, p.quota FROM booking_promotions bp JOIN promotions p ON p.code = bp.promotion_code WHERE bp.booking_code = $1`, [code]);
    for (const a of applied) {
      if (a.quota !== null) {
        const n = a.rules?.roomTypes ? brs.filter((r) => a.rules.roomTypes.includes(r.room_type_code)).length : brs.length;
        await c.query('UPDATE promotions SET used = LEAST(quota, used + $2) WHERE code = $1', [a.promotion_code, n]);
      }
      if (a.rules?.birthday && b.user_id) {
        await c.query('INSERT INTO birthday_redemptions (user_id, year, booking_code) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [b.user_id, Number(String(b.check_in).slice(0, 4)), code]);
        await c.query('UPDATE bookings SET birthday_used = true WHERE code = $1', [code]);
      }
    }
    if (b.points_redeemed) await c.query(`INSERT INTO points_ledger (user_id, delta, reason, booking_code, created_at) VALUES ($1,$2,'REDEEM',$3,$4)`, [b.user_id, -b.points_redeemed, code, now]);
    const view = await buildView(code, c);
    const mail = confirmationEmail(view);
    await sendOutbox(c, { channel: 'EMAIL', recipient: view.contact.email, lang: view.lang, subject: mail.subject, body: mail.body, bookingCode: code, event: 'BOOKING_CONFIRMED' }, now);
    const line = hotelLine('BOOKING_CONFIRMED', view);
    await sendOutbox(c, { channel: 'LINE', recipient: HOTEL_LINE_GROUP, lang: 'th', subject: line.subject, body: line.body, bookingCode: code, event: 'BOOKING_CONFIRMED' }, now);
    await sendOutbox(c, { channel: 'EMAIL', recipient: 'reservation@sabaijang.test', lang: 'th', subject: line.subject, body: line.body, bookingCode: code, event: 'BOOKING_CONFIRMED' }, now);
    return 'ok' as const;
  });
  if (outcome === 'expired') throw err('HOLD_EXPIRED', 'หมดเวลา 15 นาที ห้องถูกปล่อยแล้ว กรุณาเริ่มใหม่', 'Your 15-minute hold expired and the room was released. Please start again');
  if (outcome === 'declined') throw err('PAYMENT_DECLINED', 'ชำระเงินไม่สำเร็จ บัตรถูกปฏิเสธ ไม่มีการตัดเงิน กรุณาลองบัตรอื่น', 'Payment declined. You were not charged. Please try another card');
  if (outcome === 'notpaid') throw err('PAYMENT_DECLINED', 'ยังไม่ได้รับการชำระเงินผ่าน PromptPay', 'PromptPay payment not received yet');
  return buildView(code);
}

export async function requestGroupQuote(i: { name: string; email: string; rooms: number; checkIn?: string; checkOut?: string; note?: string }) {
  if (!i.name?.trim() || !EMAIL_RE.test(i.email ?? '')) throw err('CONTACT_INVALID', 'กรุณากรอกชื่อและอีเมลให้ถูกต้อง', 'Please enter a valid name and email');
  const now = (await getClock()).now();
  return tx(async (c) => {
    const { rows } = await c.query(
      'INSERT INTO group_quote_requests (name, email, rooms, check_in, check_out, note, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7) RETURNING id',
      [i.name.trim(), i.email.trim(), i.rooms, i.checkIn || null, i.checkOut || null, i.note ?? '', now]);
    const body = `คำขอใบเสนอราคากลุ่ม #${rows[0].id}: ${i.name} (${i.email}) ${i.rooms} ห้อง ${i.checkIn ?? '-'} – ${i.checkOut ?? '-'} ${i.note ?? ''}`;
    await sendOutbox(c, { channel: 'EMAIL', recipient: SALES_EMAIL, lang: 'th', subject: `ขอใบเสนอราคากลุ่ม ${i.rooms} ห้อง`, body, event: 'GROUP_QUOTE' }, now);
    return { id: rows[0].id as number };
  });
}
