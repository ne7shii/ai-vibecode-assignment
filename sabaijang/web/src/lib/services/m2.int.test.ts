import { describe, it, expect, beforeEach } from 'vitest';
import { resetDatabase } from '@/lib/db/reset';
import { query } from '@/lib/db';
import { setClock } from '@/lib/clock-db';
import { searchRooms, priceCalendar } from './search';
import { createHold } from './holds';
import { closeRoom } from './rooms-admin';
import { RuleError } from '@/lib/rules/types';

const hold = (roomType: string, checkIn: string, checkOut: string, extra: Record<string, unknown> = {}) =>
  createHold({ checkIn, checkOut, rooms: [{ roomType, adults: 2, childAges: [] }], plan: 'ROOM_ONLY', actor: { kind: 'guest' }, ...extra });

const inv = async (rt: string, night: string) =>
  (await query('SELECT total, sold, held, closed FROM inventory_nights WHERE room_type_code=$1 AND night=$2', [rt, night])).rows[0];

beforeEach(async () => { await resetDatabase(); });

describe('M2 · ค้นหาห้องว่าง', () => {
  it('US-03 ข้อ 1 · R06 คืน 24 ธ.ค. ขายครบ 2 หลัง → ค้นหา 23–25 ธ.ค. ไม่เห็น R06', async () => {
    const r = await searchRooms({ checkIn: '2027-12-23', checkOut: '2027-12-25', adults: 2, childAges: [] });
    const codes = r.results.map((x) => x.roomType.code);
    expect(codes).not.toContain('R06');
    expect(codes).toContain('R01');
  });

  it('US-01 ข้อ 2 · 2 ผู้ใหญ่ + เด็ก 2 → R02 (เตียงเสริม +฿800/คืน) R04 R05 R06', async () => {
    const r = await searchRooms({ checkIn: '2027-06-01', checkOut: '2027-06-03', adults: 2, childAges: [8, 3] });
    expect(r.results.map((x) => x.roomType.code)).toEqual(['R02', 'R04', 'R05', 'R06']);
    expect(r.results[0].needsExtraBed).toBe(true);
  });

  it('US-01 ข้อ 3 · เด็กไม่กรอกอายุค้นหาไม่ได้', async () => {
    await expect(searchRooms({ checkIn: '2027-06-01', checkOut: '2027-06-03', adults: 2, childAges: [Number.NaN] })).rejects.toThrow(/CHILD_AGE_REQUIRED/);
  });

  it('US-01 ข้อ 1 · ว่างแค่บางคืนไม่แสดง', async () => {
    await query(`UPDATE inventory_nights SET sold = total WHERE room_type_code = 'R04' AND night = '2027-06-02'`);
    const r = await searchRooms({ checkIn: '2027-06-01', checkOut: '2027-06-04', adults: 2, childAges: [] });
    expect(r.results.map((x) => x.roomType.code)).not.toContain('R04');
  });

  it('US-03 ข้อ 3 · เหลือ ≤ 3 ห้องมีป้าย · R05 คืน 15–16 ส.ค. เหลือ 1 · R01 ไม่มีป้าย', async () => {
    const r = await searchRooms({ checkIn: '2027-08-15', checkOut: '2027-08-17', adults: 2, childAges: [] });
    const by = Object.fromEntries(r.results.map((x) => [x.roomType.code, x]));
    expect(by.R05.left).toBe(1);
    expect(by.R05.lowStock).toBe(true);
    expect(by.R06.lowStock).toBe(true);
    expect(by.R01.lowStock).toBe(false);
  });

  it('US-05 · แผนราคาเรียงจากถูกไปแพง และ Honeymoon ไม่แสดงใน R01', async () => {
    const r = await searchRooms({ checkIn: '2027-07-01', checkOut: '2027-07-03', adults: 2, childAges: [] });
    const r01 = r.results.find((x) => x.roomType.code === 'R01')!;
    const totals = r01.plans.map((p) => p.total);
    expect(totals).toEqual([...totals].sort((a, b) => a - b));
    expect(r01.plans.map((p) => p.plan)).not.toContain('HONEYMOON');
    expect(r.results.find((x) => x.roomType.code === 'R03')!.plans.map((p) => p.plan)).toContain('HONEYMOON');
  });

  it('US-01 ข้อ 5 · ไม่มีห้องว่างเลย → ข้อความ + แนะนำช่วงใกล้สุด ±3 วัน', async () => {
    await query(`UPDATE inventory_nights SET sold = total WHERE night BETWEEN '2027-09-10' AND '2027-09-11'`);
    const r = await searchRooms({ checkIn: '2027-09-10', checkOut: '2027-09-12', adults: 2, childAges: [] });
    expect(r.results).toEqual([]);
    expect(r.message?.th).toBe('ไม่มีห้องว่างในวันที่เลือก');
    expect(r.suggestions[0]).toEqual({ checkIn: '2027-09-08', checkOut: '2027-09-10' });
  });

  it('วันที่ผิดกฎ → error เดียวกับ lib/rules', async () => {
    await expect(searchRooms({ checkIn: '2027-12-31', checkOut: '2028-01-01', adults: 2, childAges: [] })).rejects.toThrow(/PEAK_MIN_2/);
  });
});

describe('M2 · ล็อกห้อง 15 นาที (US-33)', () => {
  it('ล็อกแล้วคนอื่นเห็นห้องว่างลด 1 · 14 นาทียังลด · 15 นาทีกลับมา', async () => {
    const before = await searchRooms({ checkIn: '2027-08-15', checkOut: '2027-08-17', adults: 2, childAges: [] });
    const r06 = () => before.results.find((x) => x.roomType.code === 'R06')!.left;
    expect(r06()).toBe(2);
    const h = await hold('R06', '2027-08-15', '2027-08-17');
    expect(h.status).toBe('HELD');
    const left = async () => (await searchRooms({ checkIn: '2027-08-15', checkOut: '2027-08-17', adults: 2, childAges: [] })).results.find((x) => x.roomType.code === 'R06')!.left;
    expect(await left()).toBe(1);
    await setClock({ advanceMinutes: 14 });
    expect(await left()).toBe(1);
    await setClock({ advanceMinutes: 1 });
    expect(await left()).toBe(2);
    const { rows } = await query('SELECT status FROM bookings WHERE code = $1', [h.code]);
    expect(rows[0].status).toBe('EXPIRED');
  });

  it('hold คิดราคาที่เซิร์ฟเวอร์และคืน hold_expires_at = ตอนนี้ + 15 นาที', async () => {
    // R01 10–13 มี.ค. = High 3 คืน × ฿2,400 · lead 9 วัน จึงไม่มีโปรใดเข้าเงื่อนไข
    const h = await hold('R01', '2027-03-10', '2027-03-13');
    expect(h.quote.pricePromo).toBeNull();
    expect(h.quote.total).toBe(7200);
    expect(h.quote.deposit).toBe(2160);
    expect(new Date(h.holdExpiresAt).toISOString()).toBe('2027-03-01T03:15:00.000Z');
  });

  it('US-03 ข้อ 2 · 2 คนล็อกห้องสุดท้ายพร้อมกัน สำเร็จ 1 ล้ม 1 · ทำซ้ำ 50 รอบ', async () => {
    for (let i = 0; i < 50; i++) {
      const results = await Promise.allSettled([hold('R03', '2027-08-10', '2027-08-11'), hold('R03', '2027-08-10', '2027-08-11')]);
      const ok = results.filter((r) => r.status === 'fulfilled');
      const bad = results.filter((r) => r.status === 'rejected') as PromiseRejectedResult[];
      expect(ok).toHaveLength(1);
      expect(bad).toHaveLength(1);
      expect((bad[0].reason as RuleError).code).toBe('ROOM_GONE');
      expect((bad[0].reason as RuleError).msg.th).toBe('ห้องนี้เพิ่งถูกจองไป');
      const row = await inv('R03', '2027-08-10');
      expect(row.sold + row.held + row.closed).toBe(row.total);
      // release for the next round
      await query(`UPDATE bookings SET status='EXPIRED' WHERE status='HELD'`);
      await query(`UPDATE inventory_nights SET held = 0 WHERE room_type_code='R03' AND night='2027-08-10'`);
    }
  });
});

describe('M2 · ปิดห้องซ่อม (US-51)', () => {
  it('ปิดห้อง 304 วันที่ 4–5 ส.ค. → R03 ว่างสูงสุด 5 ห้อง แทน 6', async () => {
    await closeRoom({ roomNo: '304', from: '2027-08-04', to: '2027-08-05', reason: 'แอร์เสีย' });
    const r = await searchRooms({ checkIn: '2027-08-04', checkOut: '2027-08-06', adults: 2, childAges: [] });
    expect(r.results.find((x) => x.roomType.code === 'R03')!.left).toBe(5);
  });
  it('ห้อง 305 มีการจองอยู่ (1–3 ส.ค.) ปิดไม่ได้ และบอกรหัสการจอง', async () => {
    await expect(closeRoom({ roomNo: '305', from: '2027-08-01', to: '2027-08-05', reason: 'แอร์เสีย' }))
      .rejects.toMatchObject({ code: 'ROOM_HAS_BOOKING', extra: { bookings: ['SJ-2027-300003'] } });
  });
});

describe('M2 · ปฏิทินราคา (US-09)', () => {
  it('ราคาเริ่มต้นต่อคืน · ซีซั่น · วันเต็มทุกประเภทขึ้น "เต็ม"', async () => {
    await query(`UPDATE inventory_nights SET sold = total WHERE night = '2027-06-10'`);
    const cal = await priceCalendar({ month: '2027-06', adults: 2, childAges: [] });
    const d1 = cal.days.find((d) => d.date === '2027-06-01')!;
    expect(d1).toMatchObject({ season: 'LOW', from: 1800, full: false });
    expect(cal.days.find((d) => d.date === '2027-06-10')).toMatchObject({ full: true, from: null });
    const dec = await priceCalendar({ month: '2027-12', adults: 2, childAges: [] });
    expect(dec.days.find((d) => d.date === '2027-12-24')).toMatchObject({ season: 'PEAK', from: 3200 });
  });
});
