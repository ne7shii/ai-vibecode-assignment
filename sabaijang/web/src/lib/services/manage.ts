import type pg from 'pg';
import { query, tx } from '@/lib/db';
import { getClock } from '@/lib/clock-db';
import { AppError } from '@/lib/http';
import { stayNights } from '@/lib/rules/calendar';
import { fitsRoom, validateStay } from '@/lib/rules/stay';
import { quote } from '@/lib/rules/pricing';
import { RuleError } from '@/lib/rules/types';
import { loadMember, type Actor } from '@/lib/auth';
import { paymentGateway } from '@/lib/ports/payment';
import { sendOutbox, HOTEL_LINE_GROUP } from '@/lib/ports/notifier';
import { baht, fmtDate } from '@/lib/format';
import { buildView, getBooking, type Access } from './bookings';
import { adjustInventory, needFor } from './holds';
import { availability, withRetry } from './inventory';
import { loadCode, loadRuleData, memberCtx } from './data';
import { hotelLine } from './emails';

const MAX_FAILS = 5;
const LOCK_MINUTES = 15;
const notFound = () => new AppError(404, 'NOT_FOUND', { th: 'ไม่พบการจอง', en: 'Booking not found' });
const err = (code: string, th: string, en: string, extra = {}) => new RuleError(code, { th, en }, extra);

/** US-41: code + email, generic error, 5 wrong tries → wait 15 minutes. */
export async function lookupBooking(i: { code: string; email: string; client: string }) {
  const now = (await getClock()).now();
  const key = `client:${i.client}`;
  const { rows: att } = await query('SELECT fails, locked_until FROM manage_attempts WHERE key = $1', [key]);
  if (att[0]?.locked_until && new Date(att[0].locked_until) > now) {
    throw new AppError(429, 'TOO_MANY_ATTEMPTS', { th: 'ลองผิดเกิน 5 ครั้ง กรุณารอ 15 นาทีแล้วลองใหม่', en: 'Too many attempts. Please wait 15 minutes and try again' });
  }
  const { rows } = await query('SELECT code, contact_email, hold_token, status FROM bookings WHERE code = upper($1)', [i.code.trim()]);
  const b = rows[0];
  const ok = b && b.status !== 'HELD' && b.status !== 'EXPIRED' && b.contact_email.toLowerCase() === i.email.trim().toLowerCase();
  if (!ok) {
    const fails = (att[0]?.fails ?? 0) + 1;
    const lockedUntil = fails >= MAX_FAILS ? new Date(now.getTime() + LOCK_MINUTES * 60_000) : null;
    await query(
      `INSERT INTO manage_attempts (key, fails, locked_until) VALUES ($1,$2,$3)
       ON CONFLICT (key) DO UPDATE SET fails = $2, locked_until = $3`, [key, lockedUntil ? 0 : fails, lockedUntil]);
    throw notFound();
  }
  await query('DELETE FROM manage_attempts WHERE key = $1', [key]);
  return { booking: await buildView(b.code), token: b.hold_token as string };
}

export async function cancelPreview(code: string, access: Access, actor: Actor) {
  const view = await getBooking(code, access, actor);
  const now = (await getClock()).now();
  if (view.status !== 'CONFIRMED') throw err('NOT_CANCELLABLE', 'การจองนี้ยกเลิกไม่ได้', 'This booking cannot be cancelled');
  const inTime = !view.nonref && !!view.freeCancelUntil && now <= new Date(view.freeCancelUntil);
  return {
    code, nonref: view.nonref, inTime, freeCancelUntil: view.freeCancelUntil,
    refundAmount: inTime ? view.paid : 0, paid: view.paid,
    canChange: !view.nonref && inTime,
  };
}

async function releaseSold(c: pg.PoolClient, code: string, checkIn: string, checkOut: string) {
  const { rows } = await c.query('SELECT room_type_code FROM booking_rooms WHERE booking_code = $1', [code]);
  await adjustInventory(c, needFor(rows.map((r) => ({ roomType: r.room_type_code })), stayNights(checkIn, checkOut)), 'sold', -1, false);
  return rows.map((r) => r.room_type_code as string);
}

/** US-39: cancel per policy; refund the deposit when in time and give back code, points and birthday right. */
export async function cancelBooking(code: string, access: Access, actor: Actor, o: { confirmNonref?: boolean }) {
  const preview = await cancelPreview(code, access, actor);
  if (preview.nonref && !o.confirmNonref) {
    throw err('CONFIRM_NONREF', 'การจองนี้ไม่คืนเงิน กรุณายืนยันอีกครั้งว่าต้องการยกเลิก', 'This booking is non-refundable. Please confirm again to cancel');
  }
  const now = (await getClock()).now();
  await withRetry(() => tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM bookings WHERE code = $1 FOR UPDATE', [code]);
    const b = rows[0];
    if (b.status !== 'CONFIRMED') throw err('NOT_CANCELLABLE', 'การจองนี้ยกเลิกไม่ได้', 'This booking cannot be cancelled');
    const inTime = !b.nonref && b.free_cancel_until && now <= new Date(b.free_cancel_until);
    const refund = inTime ? Number(b.paid) : 0;
    await releaseSold(c, code, b.check_in, b.check_out);
    if (refund > 0) {
      await paymentGateway().refund({ key: `${code}:refund`, amount: refund });
      const { rows: last } = await c.query(`SELECT method, card_last4 FROM payments WHERE booking_code=$1 AND status='SUCCESS' ORDER BY id DESC LIMIT 1`, [code]);
      await c.query(`INSERT INTO payments (booking_code, method, direction, amount, status, card_last4, idempotency_key, created_at) VALUES ($1,$2,'REFUND',$3,'SUCCESS',$4,$5,$6)`,
        [code, last[0]?.method ?? 'CARD', refund, last[0]?.card_last4 ?? null, `${code}:refund`, now]);
    }
    await c.query(`UPDATE bookings SET status='CANCELLED', refunded=$2, due_at_hotel=0, cancelled_at=$3 WHERE code=$1`, [code, refund, now]);
    if (inTime) {
      if (b.promo_code) await c.query('UPDATE promo_codes SET used = GREATEST(0, used - 1) WHERE code = $1', [b.promo_code]);
      if (b.points_redeemed && b.user_id) await c.query(`INSERT INTO points_ledger (user_id, delta, reason, booking_code, created_at) VALUES ($1,$2,'REFUND',$3,$4)`, [b.user_id, b.points_redeemed, code, now]);
      await c.query('DELETE FROM birthday_redemptions WHERE booking_code = $1', [code]);
    }
    const view = await buildView(code, c);
    const lang = view.lang === 'en' ? 'en' : 'th';
    await sendOutbox(c, {
      channel: 'EMAIL', recipient: view.contact.email, lang, bookingCode: code, event: 'BOOKING_CANCELLED',
      subject: lang === 'th' ? `ยกเลิกการจอง ${code} แล้ว` : `Booking ${code} cancelled`,
      body: lang === 'th'
        ? `เรียน ${view.contact.name}\nยกเลิกการจอง ${code} (${fmtDate(view.checkIn)} – ${fmtDate(view.checkOut)}) เรียบร้อยแล้ว\nยอดคืนเงิน: ${baht(refund)}`
        : `Dear ${view.contact.name}\nBooking ${code} (${fmtDate(view.checkIn, 'en')} – ${fmtDate(view.checkOut, 'en')}) has been cancelled.\nRefund: ${baht(refund)}`,
    }, now);
    const line = hotelLine('BOOKING_CANCELLED', view, `คืนเงิน ${baht(refund)}`);
    await sendOutbox(c, { channel: 'LINE', recipient: HOTEL_LINE_GROUP, lang: 'th', subject: line.subject, body: line.body, bookingCode: code, event: 'BOOKING_CANCELLED' }, now);
  }));
  return buildView(code);
}

/** US-40: change dates on refundable bookings before the free-cancel deadline. */
export async function changeDates(code: string, access: Access, actor: Actor, d: { checkIn: string; checkOut: string }) {
  const view = await getBooking(code, access, actor);
  const now = (await getClock()).now();
  if (view.status !== 'CONFIRMED') throw err('NOT_CHANGEABLE', 'การจองนี้เปลี่ยนวันไม่ได้', 'This booking cannot be changed');
  if (view.nonref) throw err('NO_CHANGE_NONREF', 'ราคาไม่คืนเงินเปลี่ยนวันไม่ได้', 'Non-refundable bookings cannot be changed');
  if (!view.freeCancelUntil || now > new Date(view.freeCancelUntil)) throw err('CHANGE_TOO_LATE', 'เลยเวลายกเลิกฟรีแล้ว เปลี่ยนวันเองไม่ได้ กรุณาติดต่อโรงแรม', 'The free-change deadline has passed. Please contact the hotel');
  const data = await loadRuleData();
  const stayErr = validateStay({ checkIn: d.checkIn, checkOut: d.checkOut, now, seasons: data.seasons })[0];
  if (stayErr) throw new RuleError(stayErr.code, stayErr.msg);

  const owner: Actor = view.userId ? { kind: 'member', user: (await loadMember(view.userId))! } : { kind: 'guest' };
  const q = quote({
    now, checkIn: d.checkIn, checkOut: d.checkOut,
    rooms: view.rooms.map((r) => ({ roomType: r.roomType, adults: r.adults, childAges: r.childAges, extraBed: r.extraBed })),
    plan: view.plan, nonref: false, festivalCode: view.festivalCode ?? undefined, member: await memberCtx(owner),
    code: await loadCode(view.promoCode), redeemPoints: view.pointsRedeemed || undefined,
    addons: view.addons.map((a) => ({ kind: a.kind, labelTh: a.labelTh, labelEn: a.labelEn, price: a.price })), data,
  });

  await withRetry(() => tx(async (c) => {
    const { rows } = await c.query('SELECT * FROM bookings WHERE code = $1 FOR UPDATE', [code]);
    const b = rows[0];
    const types = await releaseSold(c, code, b.check_in, b.check_out);
    try {
      await adjustInventory(c, needFor(types.map((t) => ({ roomType: t })), stayNights(d.checkIn, d.checkOut)), 'sold', 1);
    } catch (e) {
      if (e instanceof RuleError && e.code === 'ROOM_GONE') {
        const left = await availability(stayNights(d.checkIn, d.checkOut));
        const alternatives = Object.values(data.roomTypes)
          .filter((rt) => view.rooms.every((r) => fitsRoom(rt, r.adults, r.childAges.length).fits) && (left[rt.code] ?? 0) >= view.rooms.length)
          .map((rt) => rt.code);
        throw err('ROOM_NOT_AVAILABLE', 'ห้องเดิมไม่ว่างในวันใหม่ ลองห้องอื่นที่ว่างแทน', 'Your room type is not available on the new dates. Try another room', { alternatives });
      }
      throw e;
    }
    const paid = Number(b.paid);
    const newDeposit = Math.floor(q.total * 0.3);
    let newPaid = paid;
    let refund = 0;
    if (newDeposit > paid) {
      const extra = newDeposit - paid;
      await paymentGateway().charge({ key: `${code}:change:${now.getTime()}`, amount: extra, method: 'CARD', cardNumber: '4242424242424242' });
      await c.query(`INSERT INTO payments (booking_code, method, direction, amount, status, card_last4, idempotency_key, created_at) VALUES ($1,'CARD','CHARGE',$2,'SUCCESS','4242',$3,$4)`,
        [code, extra, `${code}:change:${now.getTime()}`, now]);
      newPaid = newDeposit;
    } else if (q.total < paid) {
      refund = paid - q.total;
      await paymentGateway().refund({ key: `${code}:change-refund:${now.getTime()}`, amount: refund });
      await c.query(`INSERT INTO payments (booking_code, method, direction, amount, status, card_last4, idempotency_key, created_at) VALUES ($1,'CARD','REFUND',$2,'SUCCESS',NULL,$3,$4)`,
        [code, refund, `${code}:change-refund:${now.getTime()}`, now]);
    }
    const due = Math.max(0, q.total - newPaid + refund);
    await c.query(
      `UPDATE bookings SET check_in=$2, check_out=$3, has_peak=$4, total=$5, room_total=$6, deposit=$7, paid=$8, refunded=refunded+$9,
         due_at_hotel=$10, free_cancel_until=$11, points_to_earn=$12, priced_at=$13 WHERE code=$1`,
      [code, d.checkIn, d.checkOut, q.hasPeak, q.total, q.roomTotal, Math.max(newDeposit, newPaid), newPaid, refund, due, q.freeCancelUntil, b.user_id ? q.pointsToEarn : 0, now]);
    const { rows: brs } = await c.query('SELECT id FROM booking_rooms WHERE booking_code = $1 ORDER BY id', [code]);
    for (let i = 0; i < brs.length; i++) {
      await c.query('DELETE FROM booking_nights WHERE booking_room_id = $1', [brs[i].id]);
      for (const n of q.nights.filter((x) => x.room === i)) {
        await c.query('INSERT INTO booking_nights (booking_room_id, night, season_kind, base_price) VALUES ($1,$2,$3,$4)', [brs[i].id, n.night, n.season, n.price]);
      }
    }
    await c.query('DELETE FROM booking_price_lines WHERE booking_code = $1', [code]);
    await c.query('DELETE FROM booking_promotions WHERE booking_code = $1', [code]);
    let sort = 0;
    for (const l of q.lines) await c.query('INSERT INTO booking_price_lines (booking_code, sort, kind, label_th, label_en, amount) VALUES ($1,$2,$3,$4,$5,$6)', [code, ++sort, l.kind, l.labelTh, l.labelEn, l.amount]);
    for (const p of q.appliedPromos) await c.query('INSERT INTO booking_promotions (booking_code, promotion_code, saved) VALUES ($1,$2,$3) ON CONFLICT DO NOTHING', [code, p.code, p.saved]);
    const after = await buildView(code, c);
    const lang = after.lang === 'en' ? 'en' : 'th';
    await sendOutbox(c, {
      channel: 'EMAIL', recipient: after.contact.email, lang, bookingCode: code, event: 'BOOKING_CHANGED',
      subject: lang === 'th' ? `เปลี่ยนวันเข้าพัก ${code} แล้ว` : `Booking ${code} dates changed`,
      body: lang === 'th'
        ? `การจอง ${code} เปลี่ยนเป็น ${fmtDate(d.checkIn)} – ${fmtDate(d.checkOut)}\nยอดรวมใหม่ ${baht(q.total)} · ชำระแล้ว ${baht(newPaid)} · ชำระที่โรงแรม ${baht(due)}`
        : `Booking ${code} is now ${fmtDate(d.checkIn, 'en')} – ${fmtDate(d.checkOut, 'en')}\nNew total ${baht(q.total)} · Paid ${baht(newPaid)} · Pay at hotel ${baht(due)}`,
    }, now);
    const line = hotelLine('BOOKING_CHANGED', after, `เดิม ${fmtDate(b.check_in)} – ${fmtDate(b.check_out)}`);
    await sendOutbox(c, { channel: 'LINE', recipient: HOTEL_LINE_GROUP, lang: 'th', subject: line.subject, body: line.body, bookingCode: code, event: 'BOOKING_CHANGED' }, now);
  }));
  return buildView(code);
}
