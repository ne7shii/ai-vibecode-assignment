import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '@/lib/db/reset';
import { query } from '@/lib/db';
import { setClock } from '@/lib/clock-db';
import { loadMember, type Actor } from '@/lib/auth';
import { paymentGateway, TEST_CARDS } from '@/lib/ports/payment';
import { createHold } from './holds';
import { updateDetails, pay } from './bookings';
import { lookupBooking, cancelPreview, cancelBooking, changeDates } from './manage';

const guest: Actor = { kind: 'guest' };
const contact = { name: 'คุณต่อ', email: 'Tor@Example.test', phone: '0895550001' };

async function booked(extra: Record<string, unknown> = {}, actor: Actor = guest, checkIn = '2027-03-10', checkOut = '2027-03-13', roomType = 'R01') {
  const h = await createHold({ checkIn, checkOut, rooms: [{ roomType, adults: 2, childAges: [] }], plan: 'ROOM_ONLY', actor, ...extra });
  await updateDetails(h.code, h.holdToken, { contact, nonrefAck: true }, actor);
  await pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, actor);
  return h;
}
const sold = async (night: string, rt = 'R01') => (await query('SELECT sold FROM inventory_nights WHERE room_type_code=$1 AND night=$2', [rt, night])).rows[0].sold;

beforeEach(async () => { await resetDatabase(); paymentGateway().reset(); });

describe('M4 · เข้าการจองด้วยรหัส + อีเมล (US-41)', () => {
  it('รหัสและอีเมลตรงกัน (ไม่สนตัวพิมพ์เล็กใหญ่) → เห็นการจอง', async () => {
    const h = await booked();
    const r = await lookupBooking({ code: h.code.toLowerCase(), email: 'tor@example.test', client: 'a' });
    expect(r.booking.code).toBe(h.code);
    expect(r.token).toBeTruthy();
  });
  it('ผิดรหัสหรือผิดอีเมล → "ไม่พบการจอง" ข้อความเดียวกัน ไม่บอกว่าช่องไหนผิด', async () => {
    const h = await booked();
    const e1 = await lookupBooking({ code: h.code, email: 'x@example.test', client: 'a' }).catch((e) => e);
    const e2 = await lookupBooking({ code: 'SJ-2027-000000', email: 'tor@example.test', client: 'b' }).catch((e) => e);
    expect(e1.status).toBe(404);
    expect(e1.msg).toEqual(e2.msg);
    expect(e1.msg.th).toBe('ไม่พบการจอง');
  });
  it('ผิด 5 ครั้งติดกัน → ต้องรอ 15 นาที แม้ครั้งที่ 6 จะถูก · ครบ 15 นาทีลองได้', async () => {
    const h = await booked();
    for (let i = 0; i < 5; i++) await lookupBooking({ code: h.code, email: 'wrong@example.test', client: 'c' }).catch(() => undefined);
    await expect(lookupBooking({ code: h.code, email: 'tor@example.test', client: 'c' })).rejects.toMatchObject({ status: 429 });
    await setClock({ advanceMinutes: 15 });
    expect((await lookupBooking({ code: h.code, email: 'tor@example.test', client: 'c' })).booking.code).toBe(h.code);
  });
});

describe('M4 · ยกเลิก (US-39)', () => {
  it('ทันเวลา (เช็กอิน 10 มี.ค. → ฟรีถึง 7 มี.ค. 14:00) คืนมัดจำเต็ม ห้องว่างทันที อีเมล + LINE', async () => {
    const h = await booked({ code: 'WELCOME500' });
    const before = await sold('2027-03-10');
    const p = await cancelPreview(h.code, { token: h.holdToken }, guest);
    expect(p).toMatchObject({ refundAmount: 2010, inTime: true, nonref: false });
    expect(p.freeCancelUntil).toBe('2027-03-07T07:00:00.000Z');
    const r = await cancelBooking(h.code, { token: h.holdToken }, guest, {});
    expect(r.status).toBe('CANCELLED');
    expect(r.refunded).toBe(2010);
    expect(await sold('2027-03-10')).toBe(before - 1);
    const { rows } = await query(`SELECT channel FROM outbox_messages WHERE booking_code=$1 AND event='BOOKING_CANCELLED' ORDER BY id`, [h.code]);
    expect(rows.map((x) => x.channel)).toEqual(['EMAIL', 'LINE']);
    expect((await query(`SELECT used FROM promo_codes WHERE code='WELCOME500'`)).rows[0].used).toBe(0); // US-39 ข้อ 6
  });
  it('ขอบเวลา: 14:00 พอดียังทัน · 14:01 ไม่คืนมัดจำ', async () => {
    const h = await booked();
    await setClock({ now: '2027-03-07T14:00:00+07:00' });
    expect((await cancelPreview(h.code, { token: h.holdToken }, guest)).inTime).toBe(true);
    await setClock({ now: '2027-03-07T14:01:00+07:00' });
    const p = await cancelPreview(h.code, { token: h.holdToken }, guest);
    expect(p).toMatchObject({ inTime: false, refundAmount: 0 });
    expect((await cancelBooking(h.code, { token: h.holdToken }, guest, {})).refunded).toBe(0);
  });
  it('ช่วง Peak ฟรีถึง 14 วันก่อน · การจองของ Mr. Daniel เช็กอิน 23 ธ.ค. → 9 ธ.ค. 14:00', async () => {
    const p = await cancelPreview('SJ-2027-300001', { manage: true }, guest);
    expect(p.freeCancelUntil).toBe('2027-12-09T07:00:00.000Z');
  });
  it('US-39 ข้อ 4 · Non-ref ต้องยืนยันอีกครั้ง และคืน ฿0', async () => {
    const h = await booked({ nonref: true });
    await expect(cancelBooking(h.code, { token: h.holdToken }, guest, {})).rejects.toMatchObject({ code: 'CONFIRM_NONREF' });
    const r = await cancelBooking(h.code, { token: h.holdToken }, guest, { confirmNonref: true });
    expect(r).toMatchObject({ status: 'CANCELLED', refunded: 0 });
  });
  it('US-39 ข้อ 6 · ยกเลิกทันเวลาคืนแต้มที่แลก และสิทธิ์เดือนเกิด', async () => {
    // วันนี้ 15 ก.ค. → ล่วงหน้า 26 วัน ไม่ได้ Early Bird จึงได้ส่วนลดเดือนเกิด (คุณแนนเกิด ส.ค.)
    await setClock({ now: '2027-07-15T10:00:00+07:00' });
    const nan: Actor = { kind: 'member', user: (await loadMember(1))! };
    const h = await booked({ redeemPoints: 100 }, nan, '2027-08-10', '2027-08-12', 'R01');
    expect((await query(`SELECT count(*)::int n FROM birthday_redemptions WHERE user_id=1 AND year=2027`)).rows[0].n).toBe(1);
    await cancelBooking(h.code, { token: h.holdToken }, nan, {});
    const pts = await query(`SELECT COALESCE(SUM(delta),0)::int n FROM points_ledger WHERE user_id=1`);
    expect(pts.rows[0].n).toBe(250);
    expect((await query(`SELECT count(*)::int n FROM birthday_redemptions WHERE user_id=1 AND year=2027`)).rows[0].n).toBe(0);
  });
});

describe('M4 · เปลี่ยนวัน (US-40)', () => {
  it('Non-ref เปลี่ยนวันไม่ได้', async () => {
    const h = await booked({ nonref: true });
    await expect(changeDates(h.code, { token: h.holdToken }, guest, { checkIn: '2027-06-01', checkOut: '2027-06-04' })).rejects.toMatchObject({ code: 'NO_CHANGE_NONREF' });
  });
  it('เลยเวลายกเลิกฟรีแล้วเปลี่ยนไม่ได้', async () => {
    const h = await booked();
    await setClock({ now: '2027-03-08T09:00:00+07:00' });
    await expect(changeDates(h.code, { token: h.holdToken }, guest, { checkIn: '2027-06-01', checkOut: '2027-06-04' })).rejects.toMatchObject({ code: 'CHANGE_TOO_LATE' });
  });
  it('ห้องเดิมไม่ว่างในวันใหม่ → เปลี่ยนไม่ได้ และแนะนำห้องอื่นที่ว่าง', async () => {
    const h = await booked({}, guest, '2027-03-10', '2027-03-12', 'R06');
    const e = await changeDates(h.code, { token: h.holdToken }, guest, { checkIn: '2027-12-23', checkOut: '2027-12-25' }).catch((x) => x);
    expect(e.code).toBe('ROOM_NOT_AVAILABLE');
    expect(e.extra.alternatives).toContain('R05');
  });
  it('ราคาต่ำลง: R01 10–13 มี.ค. ฿7,200 (จ่าย ฿2,160) → 1–4 มิ.ย. Low ฿5,400 − Early Bird 15% = ฿4,590 · ลดยอดที่โรงแรมเหลือ ฿2,430 ไม่ต้องคืนเงิน', async () => {
    const h = await booked();
    const r = await changeDates(h.code, { token: h.holdToken }, guest, { checkIn: '2027-06-01', checkOut: '2027-06-04' });
    expect(r).toMatchObject({ checkIn: '2027-06-01', total: 4590, paid: 2160, dueAtHotel: 2430 });
    expect(await sold('2027-03-10')).toBe(0);
    expect(await sold('2027-06-01')).toBe(1);
    expect((await query(`SELECT event FROM outbox_messages WHERE booking_code=$1 AND event='BOOKING_CHANGED'`, [h.code])).rows.length).toBeGreaterThan(0);
  });
  it('ราคาสูงขึ้น: → 26–29 ธ.ค. Peak ฿9,600 − Early Bird = ฿8,160 · มัดจำใหม่ ฿2,448 จ่ายเพิ่ม ฿288 · ฟรียกเลิกถึง 12 ธ.ค. 14:00', async () => {
    const h = await booked();
    const r = await changeDates(h.code, { token: h.holdToken }, guest, { checkIn: '2027-12-26', checkOut: '2027-12-29' });
    expect(r).toMatchObject({ total: 8160, paid: 2448, dueAtHotel: 5712 });
    expect(r.freeCancelUntil).toBe('2027-12-12T07:00:00.000Z');
    expect(paymentGateway().calls.at(-1)).toMatchObject({ amount: 288 });
  });
  it('ราคาต่ำลงแต่ยังมากกว่ายอดที่จ่าย → ลดยอดที่ต้องจ่ายที่โรงแรม (สมมติฐาน Q-D6)', async () => {
    const h = await booked({}, guest, '2027-03-10', '2027-03-12', 'R06');  // R06 High 2 × 10,500 = 21,000 · มัดจำ 6,300
    const r = await changeDates(h.code, { token: h.holdToken }, guest, { checkIn: '2027-03-20', checkOut: '2027-03-21' }); // 1 คืน ฿10,500
    expect(r).toMatchObject({ total: 10500, paid: 6300, dueAtHotel: 4200 });
  });
});
