import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '@/lib/db/reset';
import { query } from '@/lib/db';
import { loadMember, actorFromCookieValue, type Actor } from '@/lib/auth';
import { paymentGateway, TEST_CARDS } from '@/lib/ports/payment';
import { createHold } from './holds';
import { updateDetails, pay } from './bookings';
import { searchRooms } from './search';
import { registerMember, verifyEmail, updateProfile, deleteAccount, myBookings, myPoints } from './members';
import { POST as registerRoute } from '@/app/api/members/register/route';
import { POST as verifyRoute } from '@/app/api/members/verify/route';
import { DELETE as deleteMeRoute, PATCH as patchMeRoute } from '@/app/api/me/route';
import { GET as myBookingsRoute } from '@/app/api/me/bookings/route';
import { GET as myPointsRoute } from '@/app/api/me/points/route';
import { GET as demoUsersRoute } from '@/app/api/demo/users/route';

const member = async (id: number): Promise<Actor> => ({ kind: 'member', user: (await loadMember(id))! });
const req = (path: string, init: { method?: string; body?: unknown; cookie?: string } = {}) =>
  new Request(`http://localhost${path}`, {
    method: init.method ?? 'GET',
    headers: { 'content-type': 'application/json', ...(init.cookie ? { cookie: init.cookie } : {}) },
    body: init.body === undefined ? undefined : JSON.stringify(init.body),
  });
const ctx = { params: Promise.resolve({}) };
const demoUsers = async () => (await (await demoUsersRoute(req('/api/demo/users'), ctx)).json()).users as { id: string; role: string; name: string }[];
const verifyTokenFromOutbox = async (email: string) => {
  const { rows } = await query(`SELECT body FROM outbox_messages WHERE recipient = $1 AND event = 'MEMBER_VERIFY' ORDER BY id DESC LIMIT 1`, [email]);
  return rows[0].body.match(/verify\?token=([A-Za-z0-9]+)/)![1] as string;
};

beforeEach(async () => {
  await resetDatabase();
  paymentGateway().reset();
});

describe('US-42 · สมัครสมาชิก', () => {
  it('สมัครแล้วได้ cookie ของผู้ใช้ใหม่ ชื่อขึ้นใน dropdown เป็น MEMBER_UNVERIFIED และมีอีเมลยืนยันใน outbox', async () => {
    const res = await registerRoute(req('/api/members/register', { method: 'POST', body: { name: 'คุณเจ', email: 'jay@example.test', phone: '0812345678', birthDate: '1995-11-20', lang: 'th' } }), ctx);
    expect(res.status).toBe(201);
    const { userId } = await res.json();
    expect(userId).toBe('m:6'); // seed มีสมาชิก 5 คน (§10)
    expect(res.headers.get('set-cookie')).toContain('sj_user=m%3A6');
    expect(await demoUsers()).toContainEqual(expect.objectContaining({ id: 'm:6', name: 'คุณเจ', role: 'MEMBER_UNVERIFIED' }));
    const { rows } = await query(`SELECT channel, lang, body FROM outbox_messages WHERE recipient = 'jay@example.test' AND event = 'MEMBER_VERIFY'`);
    expect(rows).toHaveLength(1);
    expect(rows[0].channel).toBe('EMAIL');
    expect(rows[0].body).toMatch(/\/th\/account\/verify\?token=[A-Za-z0-9]+/);
  });

  it('ความยินยอมการตลาดไม่ติ๊กไว้ก่อน (US-56 ข้อ 2) · ติ๊กเองได้', async () => {
    const a = await registerMember({ name: 'A', email: 'a@example.test' });
    const b = await registerMember({ name: 'B', email: 'b@example.test', marketingConsent: true, lang: 'en' });
    expect((await loadMember(a.userId))!.marketingConsent).toBe(false);
    expect((await loadMember(b.userId))!).toMatchObject({ marketingConsent: true, lang: 'en', verified: false });
  });

  it('อีเมลซ้ำ (ไม่สนตัวพิมพ์) → 422 EMAIL_TAKEN · อีเมลผิดรูปแบบ / ไม่มีชื่อ → 422', async () => {
    await expect(registerMember({ name: 'แนนอีกคน', email: 'NAN@sabaijang.test' })).rejects.toMatchObject({ code: 'EMAIL_TAKEN' });
    const res = await registerRoute(req('/api/members/register', { method: 'POST', body: { name: 'x', email: 'nan@sabaijang.test' } }), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('EMAIL_TAKEN');
    await expect(registerMember({ name: 'x', email: 'not-an-email' })).rejects.toMatchObject({ code: 'INVALID_EMAIL' });
    await expect(registerMember({ name: '  ', email: 'ok@example.test' })).rejects.toMatchObject({ code: 'NAME_REQUIRED' });
  });

  it('ข้อ 1 · ยังไม่ยืนยันอีเมลไม่ได้ราคาสมาชิก · กดลิงก์ยืนยันแล้วได้ Member −5% (R01 12–14 ส.ค. Early Bird ฿3,060 → ฿2,907)', async () => {
    const { userId } = await registerMember({ name: 'คุณเจ', email: 'jay@example.test' });
    const r01 = async () => {
      const r = await searchRooms({ checkIn: '2027-08-12', checkOut: '2027-08-14', adults: 2, childAges: [], actor: await member(userId) });
      return r.results.find((x) => x.roomType.code === 'R01')!.plans.find((p) => p.plan === 'ROOM_ONLY' && !p.nonref)!;
    };
    expect((await r01()).total).toBe(3060);
    const res = await verifyRoute(req('/api/members/verify', { method: 'POST', body: { token: await verifyTokenFromOutbox('jay@example.test') } }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect((await r01()).total).toBe(2907);
    expect(await demoUsers()).toContainEqual(expect.objectContaining({ id: `m:${userId}`, role: 'MEMBER' }));
  });

  it('ลิงก์ยืนยันผิด หรือใช้ซ้ำ → 422 VERIFY_TOKEN_INVALID', async () => {
    await registerMember({ name: 'คุณเจ', email: 'jay@example.test' });
    const token = await verifyTokenFromOutbox('jay@example.test');
    await expect(verifyEmail('nope')).rejects.toMatchObject({ code: 'VERIFY_TOKEN_INVALID' });
    await verifyEmail(token);
    await expect(verifyEmail(token)).rejects.toMatchObject({ code: 'VERIFY_TOKEN_INVALID' });
  });

  it('ข้อ 3 · เข้าสู่ระบบแล้วข้อมูลผู้เข้าพักกรอกให้อัตโนมัติตอนจอง', async () => {
    const { userId } = await registerMember({ name: 'คุณเจ', email: 'jay@example.test', phone: '0812345678' });
    const h = await createHold({ checkIn: '2027-03-10', checkOut: '2027-03-12', rooms: [{ roomType: 'R01', adults: 2, childAges: [] }], plan: 'ROOM_ONLY', actor: await member(userId) });
    const { rows } = await query('SELECT contact_name, contact_email, contact_phone, user_id FROM bookings WHERE code = $1', [h.code]);
    expect(rows[0]).toEqual({ contact_name: 'คุณเจ', contact_email: 'jay@example.test', contact_phone: '0812345678', user_id: userId });
  });

  it('PATCH /api/me แก้ชื่อ เบอร์ ภาษา ความยินยอม · ไม่เข้าสู่ระบบ → 401', async () => {
    const res = await patchMeRoute(req('/api/me', { method: 'PATCH', cookie: 'sj_user=m:1', body: { name: 'แนน สบายดี', phone: '081-999-9999', lang: 'en', marketingConsent: true } }), ctx);
    expect(res.status).toBe(200);
    expect((await res.json()).user).toMatchObject({ id: 1, displayName: 'แนน สบายดี', phone: '081-999-9999', lang: 'en', marketingConsent: true, email: 'nan@sabaijang.test' });
    expect((await patchMeRoute(req('/api/me', { method: 'PATCH', body: { name: 'x' } }), ctx)).status).toBe(401);
    await expect(updateProfile(1, { lang: 'zh' })).rejects.toMatchObject({ code: 'INVALID_LANG' });
    await expect(updateProfile(1, { name: '' })).rejects.toMatchObject({ code: 'NAME_REQUIRED' });
  });
});

describe('US-43 · แต้ม', () => {
  it('คุณแนนมี 250 แต้ม (§10) · GET /api/me/points', async () => {
    const res = await myPointsRoute(req('/api/me/points', { cookie: 'sj_user=m:1' }), ctx);
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.balance).toBe(250);
    expect(body.ledger).toEqual([{ delta: 250, reason: 'SEED', bookingCode: null, createdAt: '2026-12-31T03:00:00.000Z' }]);
    expect((await myPointsRoute(req('/api/me/points'), ctx)).status).toBe(401);
  });

  it('ข้อ 2 · แต้มไม่เข้าตอนจอง: คุณอ้อมมีการจองยืนยันแล้ว (จะได้ 150 แต้ม) แต่ยอดยังเป็น 99', async () => {
    expect((await myPoints(2)).balance).toBe(99);
  });

  it('ข้อ 1–2 · หลังเช็กเอาต์ (จ่าย ฿5,900 ได้ 59 แต้ม) ยอดเพิ่ม และรายการใหม่อยู่บนสุด', async () => {
    await query(`INSERT INTO points_ledger (user_id, delta, reason, booking_code, created_at) VALUES (1, 59, 'EARN', 'SJ-2027-200003', '2027-03-01T11:00:00+07:00')`);
    const p = await myPoints(1);
    expect(p.balance).toBe(309);
    expect(p.ledger.map((l) => [l.delta, l.reason, l.bookingCode])).toEqual([[59, 'EARN', 'SJ-2027-200003'], [250, 'SEED', null]]);
  });

  it('ข้อ 3 · แลก 2 ชุด (200 แต้ม) ตอนจ่ายเงิน → ลด ฿200 และสมุดแต้มมี REDEEM −200 เหลือ 50', async () => {
    const nan = await member(1);
    const h = await createHold({ checkIn: '2027-03-10', checkOut: '2027-03-12', rooms: [{ roomType: 'R01', adults: 2, childAges: [] }], plan: 'ROOM_ONLY', actor: nan, redeemPoints: 200 });
    await updateDetails(h.code, h.holdToken, { nonrefAck: true }, nan);
    await pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, nan);
    const p = await myPoints(1);
    expect(p.balance).toBe(50);
    expect(p.ledger[0]).toMatchObject({ delta: -200, reason: 'REDEEM', bookingCode: h.code });
  });
});

describe('US-44 · ประวัติการเข้าพัก', () => {
  it('ข้อ 1 · แยก ที่จะมาถึง / ที่ผ่านมา / ที่ยกเลิก · คุณแนนพักแล้ว 3 ครั้ง (R03, R02, R02 ล่าสุดก่อน)', async () => {
    const res = await myBookingsRoute(req('/api/me/bookings', { cookie: 'sj_user=m:1' }), ctx);
    expect(res.status).toBe(200);
    const b = await res.json();
    expect(b.upcoming.map((x: { code: string }) => x.code)).toEqual(['SJ-2027-200003']); // อยู่ในห้อง เช็กเอาต์วันนี้
    expect(b.past.map((x: { code: string; rooms: { roomType: string }[] }) => [x.code, x.rooms[0].roomType]))
      .toEqual([['SJ-2027-100003', 'R03'], ['SJ-2026-100002', 'R02'], ['SJ-2026-100001', 'R02']]);
    expect(b.cancelled).toEqual([]);
    expect((await myBookingsRoute(req('/api/me/bookings'), ctx)).status).toBe(401);
  });

  it('การจองที่ยกเลิกไปอยู่แท็บยกเลิก · การจองที่ยังไม่จ่าย (HELD) ไม่แสดง · เห็นเฉพาะของตัวเอง', async () => {
    await query(`UPDATE bookings SET status = 'CANCELLED', cancelled_at = '2027-02-25T10:00:00+07:00' WHERE code = 'SJ-2027-300002'`);
    await createHold({ checkIn: '2027-03-10', checkOut: '2027-03-12', rooms: [{ roomType: 'R01', adults: 1, childAges: [] }], plan: 'ROOM_ONLY', actor: await member(4) });
    const b = await myBookings(4);
    expect(b.cancelled.map((x) => x.code)).toEqual(['SJ-2027-300002']);
    expect(b.upcoming).toEqual([]);
    expect(b.past.map((x) => x.code)).toEqual(['SJ-2027-100004']);
  });

  it('ข้อ 2 · ข้อมูลพอสำหรับ "จองอีกครั้ง": ประเภทห้อง จำนวนผู้ใหญ่ อายุเด็ก (คุณอ้อม R04 2 ผู้ใหญ่ + เด็ก 8, 3 ปี)', async () => {
    const b = await myBookings(2);
    expect(b.upcoming[0]).toMatchObject({
      code: 'SJ-2027-200002', status: 'CONFIRMED', checkIn: '2027-03-01', checkOut: '2027-03-04', plan: 'BREAKFAST', total: 19200, canReview: false,
      rooms: [{ roomType: 'R04', nameTh: 'แฟมิลี่รูม', nameEn: 'Family Room', adults: 2, childAges: [8, 3] }],
    });
  });

  it('canReview: เช็กเอาต์แล้ว ภายใน 30 วัน และยังไม่รีวิว เท่านั้น', async () => {
    await query(`UPDATE bookings SET status = 'CHECKED_OUT' WHERE code = 'SJ-2027-200003'`);
    const past = (await myBookings(1)).past;
    const can = Object.fromEntries(past.map((x) => [x.code, x.canReview]));
    expect(can).toEqual({ 'SJ-2027-200003': true, 'SJ-2027-100003': false, 'SJ-2026-100002': false, 'SJ-2026-100001': false });
  });
});

describe('US-56 ข้อ 4 · ลบบัญชีเอง', () => {
  it('ต้องยืนยัน {confirm:true} ไม่งั้น 422', async () => {
    await expect(deleteAccount(1, {})).rejects.toMatchObject({ code: 'CONFIRM_REQUIRED' });
    expect(await loadMember(1)).not.toBeNull();
  });

  it('ลบแล้ว: cookie ถูกล้าง ชื่อหายจาก dropdown cookie เดิมใช้ไม่ได้ ข้อมูลส่วนตัวถูกลบ · การจองและใบกำกับภาษีเก็บไว้แต่ตัดการเชื่อม (D-07)', async () => {
    await query(`INSERT INTO tax_invoice_requests (booking_code, company, address, tax_id, branch) VALUES ('SJ-2027-100003', 'บริษัท แนน จำกัด', 'ภูเก็ต', '0105555000000', 'สำนักงานใหญ่')`);
    const res = await deleteMeRoute(req('/api/me', { method: 'DELETE', cookie: 'sj_user=m:1', body: { confirm: true } }), ctx);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true });
    expect(res.headers.get('set-cookie')).toMatch(/sj_user=;.*Max-Age=0/);
    expect((await demoUsers()).map((u) => u.id)).not.toContain('m:1');
    expect(await actorFromCookieValue('m:1')).toEqual({ kind: 'guest' });

    const u = (await query('SELECT email, display_name, phone, birth_date, photo, deleted_at, marketing_consent FROM users WHERE id = 1')).rows[0];
    expect(u.deleted_at).not.toBeNull();
    expect(JSON.stringify(u)).not.toMatch(/nan@sabaijang|คุณแนน|081-111-1111|1995-08-14|guest-nan/);
    expect(u.marketing_consent).toBe(false);

    const bookings = (await query(`SELECT code, user_id FROM bookings WHERE code LIKE 'SJ-202%-1000%' AND code <> 'SJ-2027-100004' ORDER BY code`)).rows;
    expect(bookings).toEqual([
      { code: 'SJ-2026-100001', user_id: null }, { code: 'SJ-2026-100002', user_id: null }, { code: 'SJ-2027-100003', user_id: null },
    ]);
    expect((await query(`SELECT tax_id FROM tax_invoice_requests WHERE booking_code = 'SJ-2027-100003'`)).rows).toEqual([{ tax_id: '0105555000000' }]);
    // รีวิวยังอยู่ แต่ไม่แสดงชื่อและรูปของคนที่ลบบัญชี
    const reviews = (await query(`SELECT author_name, author_photo FROM reviews WHERE booking_code IN ('SJ-2026-100001','SJ-2027-100003')`)).rows;
    expect(reviews).toHaveLength(2);
    for (const r of reviews) { expect(r.author_name).not.toBe('คุณแนน'); expect(r.author_photo).toBeNull(); }
  });

  it('ลบแล้วสมัครใหม่ด้วยอีเมลเดิมได้', async () => {
    await deleteAccount(1, { confirm: true });
    const r = await registerMember({ name: 'คุณแนน', email: 'nan@sabaijang.test' });
    expect(r.userId).toBe(6);
  });
});
