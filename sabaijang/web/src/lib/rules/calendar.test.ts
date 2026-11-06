import { describe, it, expect } from 'vitest';
import { seasonOf, nightlyRate, stayNights, seasonGaps, addDays, daysBetween } from './calendar';
import { SEASONS, RATES } from './fixtures';

describe('dates', () => {
  it('stayNights 29 เม.ย. – 2 พ.ค. = 3 คืน', () => {
    expect(stayNights('2027-04-29', '2027-05-02')).toEqual(['2027-04-29', '2027-04-30', '2027-05-01']);
  });
  it('addDays / daysBetween ข้ามเดือน', () => {
    expect(addDays('2027-03-01', 60)).toBe('2027-04-30');
    expect(daysBetween('2027-03-01', '2027-04-30')).toBe(60);
  });
});

describe('seasonOf · คิดรายคืน (US-11, US-12, US-15)', () => {
  it('US-12 · คืน 30 เม.ย. = HIGH · คืน 1 พ.ค. = LOW', () => {
    expect(seasonOf('2027-04-30', SEASONS)).toBe('HIGH');
    expect(seasonOf('2027-05-01', SEASONS)).toBe('LOW');
  });
  it('US-11 · 31 ธ.ค. = PEAK', () => expect(seasonOf('2027-12-31', SEASONS)).toBe('PEAK'));
  it('§3 · 6 ก.พ. 2027 = PEAK ตรุษจีน · 9 ก.พ. = HIGH', () => {
    expect(seasonOf('2027-02-06', SEASONS)).toBe('PEAK');
    expect(seasonOf('2027-02-09', SEASONS)).toBe('HIGH');
  });
  it('US-15 ข้อ 2 · Peak ทับ High แล้ว Peak ชนะ', () => {
    expect(seasonOf('2027-12-24', SEASONS)).toBe('PEAK');
    expect(seasonOf('2027-12-19', SEASONS)).toBe('HIGH');
  });
  it('วันที่ไม่อยู่ในซีซั่นใด → null', () => expect(seasonOf('2030-01-01', SEASONS)).toBeNull());
});

describe('nightlyRate', () => {
  it('US-11 ข้อ 1 · R01 15 มิ.ย. ฿1,800 · 15 ม.ค. ฿2,400 · 31 ธ.ค. ฿3,200', () => {
    expect(nightlyRate('R01', '2027-06-15', SEASONS, RATES).price).toBe(1800);
    expect(nightlyRate('R01', '2028-01-15', SEASONS, RATES).price).toBe(2400);
    expect(nightlyRate('R01', '2027-12-31', SEASONS, RATES).price).toBe(3200);
  });
  it('US-52 · R01 คืน 14 ก.พ. ใช้ราคาเฉพาะวัน ฿2,900 แทน High · คืน 15 ก.พ. กลับเป็น ฿2,400', () => {
    expect(nightlyRate('R01', '2027-02-14', SEASONS, RATES)).toMatchObject({ price: 2900, season: 'HIGH', override: true });
    expect(nightlyRate('R01', '2027-02-15', SEASONS, RATES)).toMatchObject({ price: 2400, override: false });
  });
});

describe('seasonGaps · US-15 ข้อ 3', () => {
  it('ครอบคลุม 365 วันครบ → ไม่มีวันขาด', () => {
    expect(seasonGaps('2027-03-01', 365, SEASONS)).toEqual([]);
  });
  it('ลบช่วง LOW 2027 แล้วบอกวันที่ขาด', () => {
    const gaps = seasonGaps('2027-03-01', 365, SEASONS.filter((s) => !(s.kind === 'LOW' && s.start === '2027-05-01')));
    expect(gaps[0]).toBe('2027-05-01');
    expect(gaps.at(-1)).toBe('2027-10-31');
    expect(gaps).toHaveLength(184);
  });
});
