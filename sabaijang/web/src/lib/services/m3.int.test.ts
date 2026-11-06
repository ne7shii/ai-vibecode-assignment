import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '@/lib/db/reset';
import { query } from '@/lib/db';
import { setClock } from '@/lib/clock-db';
import { loadMember } from '@/lib/auth';
import type { Actor } from '@/lib/auth';
import { paymentGateway, TEST_CARDS } from '@/lib/ports/payment';
import { createHold } from './holds';
import { getBooking, updateDetails, pay, requestGroupQuote } from './bookings';

const guest: Actor = { kind: 'guest' };
const nan = async (): Promise<Actor> => ({ kind: 'member', user: (await loadMember(1))! });
const contact = { name: 'คุณต่อ ใจดี', email: 'tor@example.test', phone: '0895550001' };

async function heldR01(extra: Record<string, unknown> = {}, actor: Actor = guest) {
  // R01 10–13 มี.ค. 2027 = High 3 × ฿2,400 = ฿7,200 · มัดจำ 30% = ฿2,160
  return createHold({ checkIn: '2027-03-10', checkOut: '2027-03-13', rooms: [{ roomType: 'R01', adults: 2, childAges: [] }], plan: 'ROOM_ONLY', actor, ...extra });
}
const inv = async (night: string, rt = 'R01') =>
  (await query('SELECT sold, held FROM inventory_nights WHERE room_type_code=$1 AND night=$2', [rt, night])).rows[0];

beforeEach(async () => {
  await resetDatabase();
  paymentGateway().reset();
});

describe('M3 · จ่ายเงินสำเร็จ (US-32, US-34, US-35, US-55)', () => {
  it('ไม่เป็นสมาชิก จองด้วยชื่อ อีเมล เบอร์โทร → จ่าย 4242 → CONFIRMED · ห้องจาก held เป็น sold', async () => {
    const h = await heldR01();
    await updateDetails(h.code, h.holdToken, { contact }, guest);
    const before = await inv('2027-03-10');
    const r = await pay(h.code, h.holdToken, { method: 'CARD', cardNumber: '4242 4242 4242 4242' }, guest);
    expect(r.status).toBe('CONFIRMED');
    expect(r.paid).toBe(2160);
    expect(r.dueAtHotel).toBe(5040);
    const after = await inv('2027-03-10');
    expect(after.sold).toBe(before.sold + 1);
    expect(after.held).toBe(before.held - 1);
    const { rows } = await query(`SELECT amount, status, card_last4 FROM payments WHERE booking_code=$1`, [h.code]);
    expect(rows).toEqual([{ amount: 2160, status: 'SUCCESS', card_last4: '4242' }]);
  });

  it('US-35 · อีเมลยืนยันใน outbox ภาษาที่จอง มีรหัส ห้อง วันที่ ยอดจ่าย ยอดที่โรงแรม เวลายกเลิกฟรี · LINE แจ้งโรงแรม', async () => {
    const h = await heldR01();
    await updateDetails(h.code, h.holdToken, { contact }, guest);
    await pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, guest);
    const { rows } = await query(`SELECT channel, recipient, lang, subject, body, event FROM outbox_messages WHERE booking_code=$1 ORDER BY id`, [h.code]);
    const mail = rows.find((r) => r.channel === 'EMAIL')!;
    expect(mail).toMatchObject({ recipient: 'tor@example.test', lang: 'th', event: 'BOOKING_CONFIRMED' });
    expect(mail.subject).toContain(h.code);
    for (const s of ['Superior', '10 มี.ค. 2027', '13 มี.ค. 2027', '฿2,160', '฿5,040', '7 มี.ค. 2027 14:00', '/manage']) expect(mail.body).toContain(s);
    expect(rows.find((r) => r.channel === 'LINE')).toMatchObject({ event: 'BOOKING_CONFIRMED' });
  });

  it('US-34 ข้อ 5 · บัตร 0002 ถูกปฏิเสธ → ไม่เกิดการจอง ไม่ตัดเงิน · ลองบัตร 4242 ใหม่ในเวลาล็อกได้', async () => {
    const h = await heldR01();
    await updateDetails(h.code, h.holdToken, { contact }, guest);
    await expect(pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.declined }, guest)).rejects.toMatchObject({ code: 'PAYMENT_DECLINED' });
    expect((await getBooking(h.code, { token: h.holdToken }, guest)).status).toBe('HELD');
    expect(paymentGateway().successfulCharges()).toHaveLength(0);
    const r = await pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, guest);
    expect(r.status).toBe('CONFIRMED');
  });

  it('PromptPay: ยังไม่กด "จ่ายแล้ว" → ไม่สำเร็จ · กดแล้ว → สำเร็จ', async () => {
    const h = await heldR01();
    await updateDetails(h.code, h.holdToken, { contact }, guest);
    await expect(pay(h.code, h.holdToken, { method: 'PROMPTPAY', confirmed: false }, guest)).rejects.toMatchObject({ code: 'PAYMENT_DECLINED' });
    expect((await pay(h.code, h.holdToken, { method: 'PROMPTPAY', confirmed: true }, guest)).status).toBe('CONFIRMED');
  });

  it('กดจ่ายซ้ำ 2 ครั้งพร้อมกัน → ตัดเงินครั้งเดียว · payment SUCCESS แถวเดียว', async () => {
    const h = await heldR01();
    await updateDetails(h.code, h.holdToken, { contact }, guest);
    paymentGateway().delayMs = 150;
    const [a, b] = await Promise.all([
      pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, guest),
      pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, guest),
    ]);
    expect(a.status).toBe('CONFIRMED');
    expect(b.status).toBe('CONFIRMED');
    expect(paymentGateway().successfulCharges()).toHaveLength(1);
    const { rows } = await query(`SELECT count(*)::int n FROM payments WHERE booking_code=$1 AND status='SUCCESS'`, [h.code]);
    expect(rows[0].n).toBe(1);
  });

  it('US-33 ข้อ 2 · ล็อกหมดอายุแล้วกดจ่าย → HOLD_EXPIRED และไม่เรียก gateway เลย', async () => {
    const h = await heldR01();
    await updateDetails(h.code, h.holdToken, { contact }, guest);
    await setClock({ advanceMinutes: 15 });
    await expect(pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, guest)).rejects.toMatchObject({ code: 'HOLD_EXPIRED' });
    expect(paymentGateway().calls).toHaveLength(0);
    expect((await inv('2027-03-10')).held).toBe(0);
  });

  it('token ผิด → 404 ไม่บอกว่ามีการจองนี้', async () => {
    const h = await heldR01();
    await expect(getBooking(h.code, { token: 'wrong' }, guest)).rejects.toMatchObject({ status: 404 });
  });
});

describe('M3 · ตรวจข้อมูลก่อนจ่าย', () => {
  it('ยังไม่กรอกชื่อ อีเมล เบอร์โทร → จ่ายไม่ได้', async () => {
    const h = await heldR01();
    await expect(pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, guest)).rejects.toMatchObject({ code: 'CONTACT_REQUIRED' });
  });
  it('US-21 ข้อ 2 · Non-ref ต้องติ๊กยอมรับก่อน · จ่ายเต็ม', async () => {
    const h = await heldR01({ nonref: true });
    await updateDetails(h.code, h.holdToken, { contact }, guest);
    await expect(pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, guest)).rejects.toMatchObject({ code: 'NONREF_ACK_REQUIRED' });
    await updateDetails(h.code, h.holdToken, { nonrefAck: true }, guest);
    const r = await pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, guest);
    expect(r.paid).toBe(6480); // 7,200 − 10%
    expect(r.dueAtHotel).toBe(0);
  });
  it('US-36 ข้อ 1 · คำขอพิเศษ 500 ตัวอักษรได้ · 501 ไม่ได้', async () => {
    const h = await heldR01();
    await updateDetails(h.code, h.holdToken, { rooms: [{ specialRequest: 'ก'.repeat(500) }] }, guest);
    await expect(updateDetails(h.code, h.holdToken, { rooms: [{ specialRequest: 'ก'.repeat(501) }] }, guest)).rejects.toMatchObject({ code: 'REQUEST_TOO_LONG' });
  });
  it('US-38 ข้อ 2 · เลขผู้เสียภาษี 12 หลักบันทึกไม่ได้ · 13 หลักได้', async () => {
    const h = await heldR01();
    const inv12 = { company: 'บริษัท ตัวอย่าง จำกัด', address: 'กรุงเทพฯ', taxId: '010555012345', branch: 'สำนักงานใหญ่' };
    await expect(updateDetails(h.code, h.holdToken, { taxInvoice: inv12 }, guest)).rejects.toMatchObject({ code: 'TAX_ID_INVALID' });
    await updateDetails(h.code, h.holdToken, { taxInvoice: { ...inv12, taxId: '0105550123456' } }, guest);
    expect((await getBooking(h.code, { token: h.holdToken }, guest)).taxInvoice?.taxId).toBe('0105550123456');
  });
  it('US-37 · รถรับส่งต้องมีเลขเที่ยวบิน · 4 คนขึ้นไปเป็นรถตู้ ฿1,200 · Late check-out รอยืนยัน', async () => {
    const h = await createHold({ checkIn: '2027-03-10', checkOut: '2027-03-12', rooms: [{ roomType: 'R04', adults: 2, childAges: [8, 5] }], plan: 'ROOM_ONLY', actor: guest });
    await expect(updateDetails(h.code, h.holdToken, { addons: [{ kind: 'TRANSFER' }] }, guest)).rejects.toMatchObject({ code: 'FLIGHT_REQUIRED' });
    const b = await updateDetails(h.code, h.holdToken, { addons: [{ kind: 'TRANSFER', flightNo: 'TG203', arriveTime: '13:30' }, { kind: 'LATE_OUT' }] }, guest);
    expect(b.addons.map((a) => [a.kind, a.price, a.status])).toEqual([['VAN', 1200, 'PENDING'], ['LATE_OUT', 1000, 'PENDING']]);
    expect(b.total).toBe(5000 * 2 + 1200 + 1000);
  });
  it('US-25 ข้อ 4 · Honeymoon ต้องเลือกคืนดินเนอร์', async () => {
    const h = await createHold({ checkIn: '2027-07-01', checkOut: '2027-07-03', rooms: [{ roomType: 'R03', adults: 2, childAges: [] }], plan: 'HONEYMOON', actor: guest });
    await updateDetails(h.code, h.holdToken, { contact }, guest);
    await expect(pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, guest)).rejects.toMatchObject({ code: 'DINNER_NIGHT_REQUIRED' });
    await expect(updateDetails(h.code, h.holdToken, { dinnerNight: '2027-07-05' }, guest)).rejects.toMatchObject({ code: 'DINNER_NIGHT_INVALID' });
    await updateDetails(h.code, h.holdToken, { dinnerNight: '2027-07-02' }, guest);
    expect((await pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, guest)).status).toBe('CONFIRMED');
  });
});

describe('M3 · โค้ด สมาชิก แต้ม หลายห้อง', () => {
  it('US-32 ข้อ 2 · ไม่เป็นสมาชิกใช้โค้ดได้ แต่ไม่ได้ราคาสมาชิกและแต้ม', async () => {
    const h = await heldR01({ code: 'WELCOME500' });
    expect(h.quote.total).toBe(6700);
    expect(h.quote.lines.map((l) => l.kind)).not.toContain('MEMBER');
    await updateDetails(h.code, h.holdToken, { contact }, guest);
    await pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, guest);
    const { rows } = await query(`SELECT used FROM promo_codes WHERE code='WELCOME500'`);
    expect(rows[0].used).toBe(1);
    expect((await query(`SELECT points_to_earn FROM bookings WHERE code=$1`, [h.code])).rows[0].points_to_earn).toBe(0);
  });

  it('US-22 ข้อ 3 · เลือกผู้ใช้สมาชิกกลางการจอง ราคาเป็นราคาสมาชิกทันที ไม่ต้องเลือกห้องใหม่', async () => {
    const h = await heldR01();
    expect((await getBooking(h.code, { token: h.holdToken }, guest)).total).toBe(7200);
    const b = await getBooking(h.code, { token: h.holdToken }, await nan());
    expect(b.total).toBe(6840); // 7,200 − 5%
    expect(b.contact.email).toBe('nan@sabaijang.test');
  });

  it('US-43 ข้อ 2 · สมาชิกจ่ายแล้วแต้มยังไม่เข้า (เข้าตอนเช็กเอาต์) · แลกแต้มถูกหักทันที', async () => {
    const actor = await nan();
    const h = await heldR01({ redeemPoints: 200 }, actor);
    await updateDetails(h.code, h.holdToken, { contact: { name: 'คุณแนน', email: 'nan@sabaijang.test', phone: '0811111111' } }, actor);
    await pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, actor);
    const { rows } = await query(`SELECT reason, delta FROM points_ledger WHERE user_id = 1 ORDER BY id`);
    expect(rows.map((r) => [r.reason, r.delta])).toEqual([['SEED', 250], ['REDEEM', -200]]);
    expect((await query(`SELECT points_to_earn FROM bookings WHERE code=$1`, [h.code])).rows[0].points_to_earn).toBe(Math.floor((7200 * 0.95 - 200) / 100));
  });

  it('US-07 · 2 ห้องผสมประเภทในการจองเดียว ได้รหัสเดียว', async () => {
    const h = await createHold({ checkIn: '2027-03-10', checkOut: '2027-03-11', rooms: [{ roomType: 'R04', adults: 2, childAges: [5] }, { roomType: 'R01', adults: 2, childAges: [] }], plan: 'ROOM_ONLY', actor: guest });
    const b = await getBooking(h.code, { token: h.holdToken }, guest);
    expect(b.rooms.map((r) => r.roomType)).toEqual(['R04', 'R01']);
    expect(b.total).toBe(5000 + 2400);
  });

  it('US-07 ข้อ 3 · 6 ห้องจองไม่ได้ ให้ขอใบเสนอราคากลุ่ม', async () => {
    const six = Array.from({ length: 6 }, () => ({ roomType: 'R01', adults: 2, childAges: [] }));
    await expect(createHold({ checkIn: '2027-03-10', checkOut: '2027-03-11', rooms: six, plan: 'ROOM_ONLY', actor: guest })).rejects.toMatchObject({ code: 'ROOM_COUNT' });
    const q = await requestGroupQuote({ name: 'บริษัท ทัวร์', email: 'tour@example.test', rooms: 8, checkIn: '2027-06-01', checkOut: '2027-06-03', note: 'สัมมนา' });
    expect(q.id).toBeGreaterThan(0);
    const { rows } = await query(`SELECT event FROM outbox_messages WHERE event='GROUP_QUOTE'`);
    expect(rows).toHaveLength(1);
  });

  it('US-15 ข้อ 4 · แก้ราคาซีซั่นหลังจ่ายแล้ว ยอดการจองไม่เปลี่ยน', async () => {
    const h = await heldR01();
    await updateDetails(h.code, h.holdToken, { contact }, guest);
    await pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, guest);
    await query(`UPDATE season_rates SET price = 9999 WHERE room_type_code='R01'`);
    expect((await getBooking(h.code, { token: h.holdToken }, guest)).total).toBe(7200);
  });
});

describe('M3 · ราคารายคืนในการจอง (US-12 ข้อ 3, US-52)', () => {
  it('BookingView.nightly แสดงทุกคืน รวมราคาเฉพาะวัน R01 14 ก.พ. ฿2,900', async () => {
    await query(`UPDATE app_settings SET frozen_now = '2027-02-10T10:00:00+07:00'`);
    const h = await createHold({ checkIn: '2027-02-13', checkOut: '2027-02-16', rooms: [{ roomType: 'R01', adults: 2, childAges: [] }], plan: 'ROOM_ONLY', actor: guest });
    const b = await getBooking(h.code, { token: h.holdToken }, guest);
    expect(b.nightly.map((n) => [n.night, n.season, n.price])).toEqual([
      ['2027-02-13', 'HIGH', 2400], ['2027-02-14', 'HIGH', 2900], ['2027-02-15', 'HIGH', 2400],
    ]);
    expect(b.total).toBe(7700);
  });
});
