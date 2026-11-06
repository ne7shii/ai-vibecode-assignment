import { describe, it, expect } from 'vitest';
import { validateStay, fitsRoom, ageAtCheckIn, freeCancelUntil } from './stay';
import { SEASONS, ROOM_TYPES } from './fixtures';
import { bkkInstant } from '../clock';

const now = (date = '2027-03-01', time = '10:00') => bkkInstant(date, time);
const codes = (r: ReturnType<typeof validateStay>) => r.map((e) => e.code);

describe('validateStay · US-01, US-02, US-13', () => {
  it('US-01 ข้อ 4 · เช็กเอาต์วันเดียวกับเช็กอิน → ข้อความตาม story', () => {
    const r = validateStay({ checkIn: '2027-03-10', checkOut: '2027-03-10', now: now(), seasons: SEASONS });
    expect(codes(r)).toEqual(['CHECKOUT_NOT_AFTER']);
    expect(r[0].msg.th).toBe('กรุณาเลือกวันเช็กเอาต์หลังวันเช็กอิน');
  });
  it('เช็กอินย้อนหลัง → จองไม่ได้', () => {
    expect(codes(validateStay({ checkIn: '2027-02-28', checkOut: '2027-03-02', now: now(), seasons: SEASONS }))).toEqual(['PAST_DATE']);
  });
  it('§5 · เช็กอินวันนี้ 19:59 และ 20:00 จองได้ · 20:01 ไม่ได้', () => {
    const v = (t: string) => codes(validateStay({ checkIn: '2027-03-01', checkOut: '2027-03-02', now: now('2027-03-01', t), seasons: SEASONS }));
    expect(v('19:59')).toEqual([]);
    expect(v('20:00')).toEqual([]);
    expect(v('20:01')).toEqual(['SAME_DAY_CLOSED']);
  });
  it('US-02 ข้อ 2 · ล่วงหน้า 365 วันได้ · 366 วันไม่ได้', () => {
    expect(codes(validateStay({ checkIn: '2028-02-29', checkOut: '2028-03-01', now: now(), seasons: SEASONS }))).toEqual([]);
    expect(codes(validateStay({ checkIn: '2028-03-01', checkOut: '2028-03-02', now: now(), seasons: SEASONS }))).toEqual(['TOO_FAR']);
  });
  it('US-02 ข้อ 3 · 30 คืนได้ · 31 คืนไม่ได้ ให้ติดต่อฝ่ายขาย', () => {
    expect(codes(validateStay({ checkIn: '2027-06-01', checkOut: '2027-07-01', now: now(), seasons: SEASONS }))).toEqual([]);
    const r = validateStay({ checkIn: '2027-06-01', checkOut: '2027-07-02', now: now(), seasons: SEASONS });
    expect(codes(r)).toEqual(['TOO_LONG']);
    expect(r[0].msg.th).toContain('ฝ่ายขาย');
  });
  it('US-13 ข้อ 2 · 31 ธ.ค.–1 ม.ค. (1 คืน Peak) → "ช่วงวันที่นี้ต้องพักอย่างน้อย 2 คืน"', () => {
    const r = validateStay({ checkIn: '2027-12-31', checkOut: '2028-01-01', now: now(), seasons: SEASONS });
    expect(codes(r)).toEqual(['PEAK_MIN_2']);
    expect(r[0].msg.th).toBe('ช่วงวันที่นี้ต้องพักอย่างน้อย 2 คืน');
  });
  it('US-13 ข้อ 3 · 19–21 ธ.ค. (High + Peak 2 คืน) จองได้', () => {
    expect(codes(validateStay({ checkIn: '2027-12-19', checkOut: '2027-12-21', now: now(), seasons: SEASONS }))).toEqual([]);
  });
});

describe('fitsRoom · US-01 ข้อ 2, US-06 ข้อ 3', () => {
  const fits = (adults: number, kids: number) =>
    Object.values(ROOM_TYPES).filter((rt) => fitsRoom(rt, adults, kids).fits).map((rt) => rt.code);
  it('2 ผู้ใหญ่ + เด็ก 2 → R02 (เตียงเสริม) R04 R05 R06 · ไม่แสดง R01 R03', () => {
    expect(fits(2, 2)).toEqual(['R02', 'R04', 'R05', 'R06']);
    expect(fitsRoom(ROOM_TYPES.R02, 2, 2)).toEqual({ fits: true, needsExtraBed: true });
  });
  it('3 ผู้ใหญ่ → R02 (เตียงเสริม) R04 R05 R06', () => {
    expect(fits(3, 0)).toEqual(['R02', 'R04', 'R05', 'R06']);
    expect(fitsRoom(ROOM_TYPES.R02, 3, 0).needsExtraBed).toBe(true);
    expect(fitsRoom(ROOM_TYPES.R05, 3, 0).needsExtraBed).toBe(false);
  });
  it('2 ผู้ใหญ่ → ครบ R01–R06 ไม่ต้องใช้เตียงเสริม', () => {
    expect(fits(2, 0)).toEqual(['R01', 'R02', 'R03', 'R04', 'R05', 'R06']);
  });
  it('R05 เพิ่มเตียงเสริมเป็น 4 ผู้ใหญ่ / รวม 5 ได้ · 6 คนไม่ได้', () => {
    expect(fitsRoom(ROOM_TYPES.R05, 4, 1)).toEqual({ fits: true, needsExtraBed: true });
    expect(fitsRoom(ROOM_TYPES.R05, 4, 2).fits).toBe(false);
  });
});

describe('ageAtCheckIn · §4', () => {
  it('ลูกคุณอ้อมเกิด 15 ม.ค. 2024: เช็กอิน 14 ม.ค. 2028 = 3 ปี · 15 ม.ค. 2028 = 4 ปี', () => {
    expect(ageAtCheckIn('2024-01-15', '2028-01-14')).toBe(3);
    expect(ageAtCheckIn('2024-01-15', '2028-01-15')).toBe(4);
  });
});

describe('freeCancelUntil · US-39', () => {
  it('Low/High · เช็กอิน 20 ก.ค. → 17 ก.ค. 14:00', () => {
    expect(freeCancelUntil('2027-07-20', false).toISOString()).toBe(bkkInstant('2027-07-17', '14:00').toISOString());
  });
  it('มีคืน Peak · เช็กอิน 28 ธ.ค. → 14 ธ.ค. 14:00', () => {
    expect(freeCancelUntil('2027-12-28', true).toISOString()).toBe(bkkInstant('2027-12-14', '14:00').toISOString());
  });
});
