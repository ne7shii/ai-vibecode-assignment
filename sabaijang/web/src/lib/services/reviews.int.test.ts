import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '@/lib/db/reset';
import { query } from '@/lib/db';
import { setClock } from '@/lib/clock-db';
import { loadMember, type Actor } from '@/lib/auth';
import { listReviews, createReview } from './reviews';
import { GET as reviewsGet, POST as reviewsPost } from '@/app/api/reviews/route';

const guest: Actor = { kind: 'guest' };
const member = async (id: number): Promise<Actor> => ({ kind: 'member', user: (await loadMember(id))! });
const scores = { room: 5, service: 4, clean: 5, location: 3 };
const ctx = { params: Promise.resolve({}) };
// คุณแนนอยู่ในห้อง 214 เช็กเอาต์วันนี้ 1 มี.ค. 2027 → พนักงานกดเช็กเอาต์ (งานของหลังบ้าน จำลองด้วย SQL)
const checkOutNan = () => query(`UPDATE bookings SET status = 'CHECKED_OUT' WHERE code = 'SJ-2027-200003'`);

beforeEach(async () => { await resetDatabase(); });

describe('US-47 ข้อ 3 · แสดงรีวิว คะแนนเฉลี่ย กรองตามห้อง และคำตอบของโรงแรม', () => {
  it('รีวิวเก่า 3 รายการ ล่าสุดก่อน พร้อมคำตอบจากคุณวิภาและน้องมุก', async () => {
    const res = await reviewsGet(new Request('http://localhost/api/reviews'), ctx);
    expect(res.status).toBe(200);
    const r = await res.json();
    expect(r.reviews.map((x: { roomType: string; authorName: string }) => [x.roomType, x.authorName]))
      .toEqual([['R03', 'คุณแนน'], ['R01', 'Ms. Chen Yu'], ['R02', 'คุณแนน']]);
    expect(r.reviews[0]).toMatchObject({ scores: { room: 5, service: 4, clean: 5, location: 5 }, avg: 4.8, lang: 'th', reply: null, authorPhoto: '/brand/people/guest-nan.jpg' });
    expect(r.reviews[1].reply).toEqual({ body: 'Thank you Ms. Chen! Happy birthday again from all of us.', staffName: 'น้องมุก', createdAt: '2027-02-09T03:00:00.000Z' });
    expect(r.reviews[2].reply).toMatchObject({ staffName: 'คุณวิภา', body: 'ขอบคุณคุณแนนมากค่ะ ยินดีต้อนรับกลับมาเสมอ' });
    // ห้อง (5+5+4)/3 · บริการ (5+4+5)/3 · สะอาด (5+5+4)/3 · ทำเล (4+5+5)/3 · รวม 56/12
    expect(r.summary).toEqual({ count: 3, avg: 4.7, room: 4.7, service: 4.7, clean: 4.7, location: 4.7 });
  });

  it('กรองตามประเภทห้อง R02 → 1 รีวิว คะแนนตามรีวิวนั้น · ห้องที่ยังไม่มีรีวิว → 0', async () => {
    const r = await listReviews({ roomType: 'R02' });
    expect(r.reviews).toHaveLength(1);
    expect(r.summary).toEqual({ count: 1, avg: 4.8, room: 5, service: 5, clean: 5, location: 4 });
    expect((await listReviews({ roomType: 'R06' })).summary).toEqual({ count: 0, avg: 0, room: 0, service: 0, clean: 0, location: 0 });
  });
});

describe('US-47 ข้อ 1–2 · เขียนรีวิว', () => {
  it('สมาชิกเจ้าของการจองที่เช็กเอาต์แล้ว รีวิวได้ → 201 และขึ้นเป็นรีวิวล่าสุด', async () => {
    await checkOutNan();
    const req = new Request('http://localhost/api/reviews', {
      method: 'POST', headers: { cookie: 'sj_user=m:1', 'content-type': 'application/json' },
      body: JSON.stringify({ bookingCode: 'SJ-2027-200003', ...scores, body: 'ระเบียงมองสวนสวยเหมือนเดิม' }),
    });
    const res = await reviewsPost(req, ctx);
    expect(res.status).toBe(201);
    const top = (await listReviews({})).reviews[0];
    expect(top).toMatchObject({ roomType: 'R02', authorName: 'คุณแนน', scores, avg: 4.3, body: 'ระเบียงมองสวนสวยเหมือนเดิม', reply: null, createdAt: '2027-03-01T03:00:00.000Z' });
    expect((await listReviews({})).summary.count).toBe(4);
  });

  it('ผู้เข้าพักไม่เป็นสมาชิกรีวิวได้ด้วย token ของการจอง · token ผิด หรือสมาชิกคนอื่น → 404', async () => {
    await query(`UPDATE bookings SET status = 'CHECKED_OUT', check_out = '2027-03-01', check_in = '2027-02-27' WHERE code = 'SJ-2027-200001'`);
    await expect(createReview({ bookingCode: 'SJ-2027-200001', ...scores, body: 'ดี' }, guest, 'wrong')).rejects.toMatchObject({ status: 404 });
    await expect(createReview({ bookingCode: 'SJ-2027-200001', ...scores, body: 'ดี' }, await member(4), null)).rejects.toMatchObject({ status: 404 });
    await expect(createReview({ bookingCode: 'SJ-2027-200001', ...scores, body: 'ดี' }, guest, 'seed')).rejects.toMatchObject({ status: 404 }); // no shared seed token
    const { rows } = await query(`SELECT hold_token FROM bookings WHERE code = 'SJ-2027-200001'`);
    const r = await createReview({ bookingCode: 'SJ-2027-200001', ...scores, body: 'ห้องสะอาด ใกล้หาด' }, guest, rows[0].hold_token);
    expect(r).toMatchObject({ authorName: 'คุณต่อ', roomType: 'R01', authorPhoto: null });
  });

  it('ยังไม่เช็กเอาต์ (อยู่ในห้อง / ยืนยันแล้ว) → 422 NOT_CHECKED_OUT', async () => {
    await expect(createReview({ bookingCode: 'SJ-2027-200003', ...scores, body: 'x' }, await member(1), null)).rejects.toMatchObject({ code: 'NOT_CHECKED_OUT' });
    const res = await reviewsPost(new Request('http://localhost/api/reviews', {
      method: 'POST', headers: { cookie: 'sj_user=m:2' }, body: JSON.stringify({ bookingCode: 'SJ-2027-200002', ...scores, body: 'x' }),
    }), ctx);
    expect(res.status).toBe(422);
    expect((await res.json()).error).toBe('NOT_CHECKED_OUT');
  });

  it('1 รีวิวต่อการจอง → ครั้งที่ 2 422 ALREADY_REVIEWED (การจอง SJ-2027-100003 มีรีวิวแล้ว)', async () => {
    await expect(createReview({ bookingCode: 'SJ-2027-100003', ...scores, body: 'อีกรอบ' }, await member(1), null)).rejects.toMatchObject({ code: 'ALREADY_REVIEWED' });
    await checkOutNan();
    await createReview({ bookingCode: 'SJ-2027-200003', ...scores, body: 'ครั้งแรก' }, await member(1), null);
    await expect(createReview({ bookingCode: 'SJ-2027-200003', ...scores, body: 'ครั้งสอง' }, await member(1), null)).rejects.toMatchObject({ code: 'ALREADY_REVIEWED' });
  });

  it('ภายใน 30 วันหลังเช็กเอาต์: วันที่ 30 (31 มี.ค.) ยังได้ · วันที่ 31 (1 เม.ย.) → REVIEW_WINDOW_CLOSED', async () => {
    await checkOutNan();
    await setClock({ now: '2027-04-01T00:00:00+07:00' });
    await expect(createReview({ bookingCode: 'SJ-2027-200003', ...scores, body: 'ช้าไป' }, await member(1), null)).rejects.toMatchObject({ code: 'REVIEW_WINDOW_CLOSED' });
    await setClock({ now: '2027-03-31T23:59:00+07:00' });
    await expect(createReview({ bookingCode: 'SJ-2027-200003', ...scores, body: 'ทัน' }, await member(1), null)).resolves.toMatchObject({ body: 'ทัน' });
  });

  it('การจองที่เช็กเอาต์ 22 พ.ย. 2026 (เกิน 30 วันแล้ว) → REVIEW_WINDOW_CLOSED', async () => {
    await expect(createReview({ bookingCode: 'SJ-2026-100002', ...scores, body: 'x' }, await member(1), null)).rejects.toMatchObject({ code: 'REVIEW_WINDOW_CLOSED' });
  });

  it('ข้อ 2 · คะแนนต้องเป็นจำนวนเต็ม 1–5 ครบทั้ง 4 ด้าน · ต้องมีข้อความ', async () => {
    await checkOutNan();
    const nan = await member(1);
    for (const bad of [{ ...scores, room: 0 }, { ...scores, clean: 6 }, { ...scores, service: 4.5 }, { room: 5, service: 5, clean: 5 }]) {
      await expect(createReview({ bookingCode: 'SJ-2027-200003', body: 'x', ...bad } as never, nan, null)).rejects.toMatchObject({ code: 'INVALID_SCORE' });
    }
    await expect(createReview({ bookingCode: 'SJ-2027-200003', ...scores, body: '   ' }, nan, null)).rejects.toMatchObject({ code: 'REVIEW_BODY_REQUIRED' });
  });
});
