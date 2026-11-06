import { describe, it, expect } from 'vitest';
import { quote, taxBreakdown, type QuoteInput } from './pricing';
import { SEASONS, RATES, ROOM_TYPES, PROMOS, CODES } from './fixtures';
import { bkkInstant } from '../clock';

const data = { seasons: SEASONS, rates: RATES, roomTypes: ROOM_TYPES, promotions: PROMOS };
// Only the promotions named in `only` are active, so each rule is tested in isolation.
const q = (i: Partial<QuoteInput> & { checkIn: string; checkOut: string }, only?: string[]) =>
  quote({
    now: bkkInstant('2027-03-01', '10:00'),
    rooms: [{ roomType: 'R01', adults: 2, childAges: [] }],
    plan: 'ROOM_ONLY',
    ...i,
    data: only ? { ...data, promotions: PROMOS.filter((p) => only.includes(p.code)) } : { ...data, promotions: [] },
  });

describe('ราคารายคืนและคร่อมซีซั่น · US-12', () => {
  it('R01 29 เม.ย.–2 พ.ค.: ฿2,400 + ฿2,400 + ฿1,800 = ฿6,600', () => {
    const r = q({ checkIn: '2027-04-29', checkOut: '2027-05-02' });
    expect(r.nights.map((n) => n.price)).toEqual([2400, 2400, 1800]);
    expect(r.total).toBe(6600);
  });
  it('R01 18–22 ธ.ค.: High ฿2,400 × 2 + Peak ฿3,200 × 2 = ฿11,200', () => {
    expect(q({ checkIn: '2027-12-18', checkOut: '2027-12-22' }).total).toBe(11200);
  });
});

describe('แผนราคา · US-05 ข้อ 2', () => {
  it('R01 15 มิ.ย. 2 ผู้ใหญ่: ห้องอย่างเดียว ฿1,800 · รวมอาหารเช้า ฿2,600 · Non-ref ฿1,620', () => {
    const base = { checkIn: '2027-06-15', checkOut: '2027-06-16' };
    expect(q(base).total).toBe(1800);
    expect(q({ ...base, plan: 'BREAKFAST' }).total).toBe(2600);
    expect(q({ ...base, nonref: true }, ['PR-07']).total).toBe(1620);
  });
});

describe('เด็กและเตียงเสริม · US-06, US-26', () => {
  it('US-06 ข้อ 2 · R04 Low 2 คืน 2 ผู้ใหญ่ + เด็ก 8 + เด็ก 3 รวมอาหารเช้า = ฿9,600', () => {
    const r = q({ checkIn: '2027-06-01', checkOut: '2027-06-03', plan: 'BREAKFAST', rooms: [{ roomType: 'R04', adults: 2, childAges: [8, 3] }] });
    expect(r.lines.find((l) => l.kind === 'BREAKFAST')?.amount).toBe(2000); // 1,600 + 400 + 0
    expect(r.total).toBe(9600);
  });
  it('US-26 ข้อ 2 · ตัวอย่างเดียวกันเข้าพัก 1–3 พ.ค. (Family Summer) = ฿9,200', () => {
    const r = q({ checkIn: '2027-05-01', checkOut: '2027-05-03', plan: 'BREAKFAST', rooms: [{ roomType: 'R04', adults: 2, childAges: [8, 3] }] }, ['PR-12']);
    expect(r.total).toBe(9200);
  });
  it('อายุ 12 ปีขึ้นไปคิดอาหารเช้าแบบผู้ใหญ่ · 4 ปีคิด ฿200', () => {
    const r = q({ checkIn: '2027-06-01', checkOut: '2027-06-02', plan: 'BREAKFAST', rooms: [{ roomType: 'R04', adults: 2, childAges: [12, 4] }] });
    expect(r.lines.find((l) => l.kind === 'BREAKFAST')?.amount).toBe(400 * 3 + 200);
  });
  it('US-06 ข้อ 3 · R02 เตียงเสริม ฿800/คืน', () => {
    const r = q({ checkIn: '2027-06-01', checkOut: '2027-06-03', rooms: [{ roomType: 'R02', adults: 3, childAges: [] }] });
    expect(r.lines.find((l) => l.kind === 'EXTRA_BED')?.amount).toBe(1600);
    expect(r.total).toBe(2400 * 2 + 1600);
  });
  it('ห้องรับคนไม่พอ → error', () => {
    expect(() => q({ checkIn: '2027-06-01', checkOut: '2027-06-02', rooms: [{ roomType: 'R01', adults: 3, childAges: [] }] })).toThrow(/OVER_CAPACITY/);
  });
});

describe('โปรราคา · เลือก 1 อันที่ถูกที่สุด (US-16 – US-20, US-28, US-29)', () => {
  it('US-17 · วันนี้ 1 มี.ค. เช็กอิน 30 เม.ย. (60 วัน) ได้ Early Bird ฿2,400 → ฿2,040', () => {
    const r = q({ checkIn: '2027-04-30', checkOut: '2027-05-01' }, ['PR-01']);
    expect(r.pricePromo?.code).toBe('PR-01');
    expect(r.total).toBe(2040);
  });
  it('US-17 · เช็กอิน 29 เม.ย. (59 วัน) ไม่ได้', () => {
    expect(q({ checkIn: '2027-04-29', checkOut: '2027-04-30' }, ['PR-01']).pricePromo).toBeNull();
  });
  it('§7 · Early Bird ใช้ช่วง Peak ได้', () => {
    expect(q({ checkIn: '2027-12-24', checkOut: '2027-12-26' }, ['PR-01']).pricePromo?.code).toBe('PR-01');
  });
  it('US-18 · วันนี้ 10 ก.ค. เช็กอิน 13 ก.ค. ได้ · 14 ก.ค. ไม่ได้ · R02 คืน 12 ก.ค. ฿2,400 → ฿2,160', () => {
    const now = bkkInstant('2027-07-10', '09:00');
    const r02 = [{ roomType: 'R02', adults: 2, childAges: [] }];
    expect(q({ now, checkIn: '2027-07-13', checkOut: '2027-07-14' }, ['PR-02']).pricePromo?.code).toBe('PR-02');
    expect(q({ now, checkIn: '2027-07-14', checkOut: '2027-07-15' }, ['PR-02']).pricePromo).toBeNull();
    expect(q({ now, checkIn: '2027-07-12', checkOut: '2027-07-13', rooms: r02 }, ['PR-02']).total).toBe(2160);
  });
  it('US-18 ข้อ 2 · เช็กอิน 30 ต.ค. เช็กเอาต์ 2 พ.ย. มีคืน High → ไม่ได้', () => {
    const now = bkkInstant('2027-10-28', '09:00');
    expect(q({ now, checkIn: '2027-10-30', checkOut: '2027-11-02' }, ['PR-02']).pricePromo).toBeNull();
  });
  it('US-19 ข้อ 2 · R02 1–5 ก.ค. (4 คืน Low) ฿9,600 → ฿7,200', () => {
    expect(q({ checkIn: '2027-07-01', checkOut: '2027-07-05', rooms: [{ roomType: 'R02', adults: 2, childAges: [] }] }, ['PR-03']).total).toBe(7200);
  });
  it('US-19 ข้อ 3 · R02 29 เม.ย.–3 พ.ค. ฿11,200 ฟรีคืนถูกสุด ฿2,400 → ฿8,800', () => {
    expect(q({ checkIn: '2027-04-29', checkOut: '2027-05-03', rooms: [{ roomType: 'R02', adults: 2, childAges: [] }] }, ['PR-03']).total).toBe(8800);
  });
  it('US-19 ข้อ 1 · 7 คืนฟรี 1 · 8 คืนฟรี 2', () => {
    expect(q({ checkIn: '2027-06-01', checkOut: '2027-06-08' }, ['PR-03']).total).toBe(1800 * 6);
    expect(q({ checkIn: '2027-06-01', checkOut: '2027-06-09' }, ['PR-03']).total).toBe(1800 * 6);
  });
  it('US-19 ข้อ 4 · มีคืน Peak ใช้ไม่ได้', () => {
    expect(q({ checkIn: '2027-12-16', checkOut: '2027-12-21' }, ['PR-03']).pricePromo).toBeNull();
  });
  it('US-20 · 6 คืนไม่ได้ · 7 คืนได้ 20%', () => {
    expect(q({ checkIn: '2027-06-01', checkOut: '2027-06-07' }, ['PR-04']).pricePromo).toBeNull();
    expect(q({ checkIn: '2027-06-01', checkOut: '2027-06-08' }, ['PR-04']).total).toBe(10080);
  });
  it('§7 แทน US-20 ข้อ 3 · Long Stay ใช้ไม่ได้ถ้ามีคืน Peak', () => {
    expect(q({ checkIn: '2027-12-15', checkOut: '2027-12-23' }, ['PR-04']).pricePromo).toBeNull();
  });
  it('US-16 · R01 1–8 มิ.ย. ฿12,600: S4P3 ฿10,800 vs Long Stay ฿10,080 → ใช้ Long Stay ประหยัด ฿2,520', () => {
    const r = q({ checkIn: '2027-06-01', checkOut: '2027-06-08' }, ['PR-03', 'PR-04']);
    expect(r.pricePromo).toMatchObject({ code: 'PR-04', saved: 2520 });
    expect(r.total).toBe(10080);
    expect(r.saved).toBe(2520);
  });
  it('US-16 · มี Early Bird ด้วยก็ยังเลือก Long Stay เพราะถูกกว่า', () => {
    expect(q({ checkIn: '2027-06-01', checkOut: '2027-06-08' }, ['PR-01', 'PR-03', 'PR-04']).pricePromo?.code).toBe('PR-04');
  });
  it('US-28 · Flash Sale R02 ลด 30% ในเวลาขาย · หมดเวลาแล้วไม่ได้ · ห้องอื่นไม่ได้', () => {
    const r02 = [{ roomType: 'R02', adults: 2, childAges: [] }];
    expect(q({ checkIn: '2027-06-01', checkOut: '2027-06-02', rooms: r02 }, ['PR-06']).total).toBe(1680);
    expect(q({ now: bkkInstant('2027-03-02', '12:01'), checkIn: '2027-06-01', checkOut: '2027-06-02', rooms: r02 }, ['PR-06']).pricePromo).toBeNull();
    expect(q({ checkIn: '2027-06-01', checkOut: '2027-06-02' }, ['PR-06']).pricePromo).toBeNull();
  });
  it('US-28 · ขายครบโควตาแล้วไม่ได้', () => {
    const full = { ...data, promotions: [{ ...PROMOS.find((p) => p.code === 'PR-06')!, used: 10 }] };
    const r = quote({ now: bkkInstant('2027-03-01', '10:00'), checkIn: '2027-06-01', checkOut: '2027-06-02', rooms: [{ roomType: 'R02', adults: 2, childAges: [] }], plan: 'ROOM_ONLY', data: full });
    expect(r.pricePromo).toBeNull();
  });
  it('US-29 · เกิด ส.ค. มีคืนใน ส.ค. ได้ 15% · ใช้สิทธิ์ปีนี้แล้วไม่ได้ · ไม่ใช่สมาชิกไม่ได้', () => {
    const nan = { verified: true, birthDate: '1995-08-14', birthdayUsedYears: [] as number[] };
    const stay = { checkIn: '2027-07-30', checkOut: '2027-08-02' };
    expect(q({ ...stay, member: nan }, ['PR-05']).pricePromo?.code).toBe('PR-05');
    expect(q({ ...stay, member: { ...nan, birthdayUsedYears: [2027] } }, ['PR-05']).pricePromo).toBeNull();
    expect(q({ ...stay, member: null }, ['PR-05']).pricePromo).toBeNull();
    expect(q({ checkIn: '2027-07-01', checkOut: '2027-07-03', member: nan }, ['PR-05']).pricePromo).toBeNull();
  });
});

describe('ซ้อนส่วนลดตามลำดับ §7 · US-21, US-22, US-23', () => {
  it('Early Bird ฿2,040 → Non-ref ฿1,836 → สมาชิก ฿1,744.20 → ปัดลง ฿1,744', () => {
    const base = { checkIn: '2027-04-30', checkOut: '2027-05-01' };
    expect(q({ ...base, nonref: true }, ['PR-01', 'PR-07']).total).toBe(1836);
    const r = q({ ...base, nonref: true, member: { verified: true } }, ['PR-01', 'PR-07', 'PR-08']);
    expect(r.total).toBe(1744);
    expect(r.lines.find((l) => l.kind === 'ROUNDING')?.amount).toBeCloseTo(-0.2, 2);
  });
  it('§8 · สมาชิกยังไม่ยืนยันอีเมลไม่ได้ 5%', () => {
    expect(q({ checkIn: '2027-06-01', checkOut: '2027-06-02', member: { verified: false } }, ['PR-08']).total).toBe(1800);
  });
  it('US-22 ข้อ 2 · คนที่ไม่ login ได้ตัวเลข "สมาชิกจ่ายเพียง"', () => {
    const r = q({ checkIn: '2027-04-30', checkOut: '2027-05-01', nonref: true }, ['PR-01', 'PR-07', 'PR-08']);
    expect(r.total).toBe(1836);
    expect(r.memberPrice).toBe(1744);
  });
  it('US-23 ข้อ 1 · WELCOME500 R02 High 2 คืน ฿6,400 → ฿5,900', () => {
    const r = q({ checkIn: '2027-03-10', checkOut: '2027-03-12', rooms: [{ roomType: 'R02', adults: 2, childAges: [] }], code: CODES.WELCOME500 });
    expect(r.total).toBe(5900);
    expect(r.codeError).toBeUndefined();
  });
  it('US-23 ข้อ 2 · ยอด ฿2,800 → "ยอดขั้นต่ำ ฿3,000 (ขาดอีก ฿200)"', () => {
    const data2 = { ...data, rates: { ...RATES, date: { R01: { '2027-06-01': 2800 } } } };
    const r = quote({ now: bkkInstant('2027-03-01', '10:00'), checkIn: '2027-06-01', checkOut: '2027-06-02', rooms: [{ roomType: 'R01', adults: 2, childAges: [] }], plan: 'ROOM_ONLY', code: CODES.WELCOME500, data: { ...data2, promotions: [] } });
    expect(r.total).toBe(2800);
    expect(r.codeError?.th).toBe('ยอดขั้นต่ำ ฿3,000 (ขาดอีก ฿200)');
  });
  it('US-23 ข้อ 3 · โค้ดใช้ครบสิทธิ์ / หมดอายุ บอกเหตุผล', () => {
    expect(q({ checkIn: '2027-06-01', checkOut: '2027-06-06', code: CODES.KATA1000 }).codeError?.en).toMatch(/fully used/);
    expect(q({ checkIn: '2027-06-01', checkOut: '2027-06-03', code: CODES.RAINY300 }).codeError?.en).toMatch(/expired/);
  });
  it('US-23 ข้อ 4 · โค้ดลดไม่เกินค่าห้อง', () => {
    const big = { ...CODES.WELCOME500, discount: 5000, minRoomTotal: 0 };
    expect(q({ checkIn: '2027-06-01', checkOut: '2027-06-02', code: big }).total).toBe(0);
  });
  it('ส่วนลดไม่คิดกับอาหารเช้า: Non-ref 10% ลดเฉพาะค่าห้อง', () => {
    const r = q({ checkIn: '2027-06-15', checkOut: '2027-06-16', plan: 'BREAKFAST', nonref: true }, ['PR-07']);
    expect(r.total).toBe(1620 + 800);
  });
});

describe('แพ็กเกจ · US-24, US-25, US-27', () => {
  it('US-24 · R02 Low 2 คืน Green Season ฿4,800 รวมอาหารเช้า 2 ท่าน', () => {
    const r = q({ checkIn: '2027-07-01', checkOut: '2027-07-03', plan: 'GREEN', rooms: [{ roomType: 'R02', adults: 2, childAges: [] }] }, ['PR-10']);
    expect(r.total).toBe(4800);
  });
  it('US-24 ข้อ 1 · 1 คืนหรือมีคืน High ใช้ไม่ได้', () => {
    expect(() => q({ checkIn: '2027-07-01', checkOut: '2027-07-02', plan: 'GREEN' }, ['PR-10'])).toThrow(/PLAN_NOT_ELIGIBLE/);
    expect(() => q({ checkIn: '2027-10-31', checkOut: '2027-11-02', plan: 'GREEN' }, ['PR-10'])).toThrow(/PLAN_NOT_ELIGIBLE/);
  });
  it('US-25 ข้อ 3 · R03 Low 2 คืน ห้อง ฿7,000 + แพ็กเกจ ฿2,500 = ฿9,500', () => {
    const r = q({ checkIn: '2027-07-01', checkOut: '2027-07-03', plan: 'HONEYMOON', rooms: [{ roomType: 'R03', adults: 2, childAges: [] }] }, ['PR-11']);
    expect(r.total).toBe(9500);
  });
  it('US-25 · ส่วนลดโปรคิดเฉพาะค่าห้อง ไม่คิดกับค่าแพ็กเกจ', () => {
    const r = q({ checkIn: '2027-07-01', checkOut: '2027-07-03', plan: 'HONEYMOON', nonref: true, rooms: [{ roomType: 'R03', adults: 2, childAges: [] }] }, ['PR-11', 'PR-07']);
    expect(r.total).toBe(6300 + 2500);
  });
  it('US-05 ข้อ 3 / US-25 ข้อ 1 · R01 ใช้ Honeymoon ไม่ได้ · จองล่วงหน้า 2 วันไม่ได้', () => {
    expect(() => q({ checkIn: '2027-07-01', checkOut: '2027-07-03', plan: 'HONEYMOON' }, ['PR-11'])).toThrow(/PLAN_NOT_ELIGIBLE/);
    const now = bkkInstant('2027-06-29', '09:00');
    expect(() => q({ now, checkIn: '2027-07-01', checkOut: '2027-07-03', plan: 'HONEYMOON', rooms: [{ roomType: 'R03', adults: 2, childAges: [] }] }, ['PR-11'])).toThrow(/PLAN_NOT_ELIGIBLE/);
  });
  it('US-27 · แพ็กเกจเทศกาลบวกราคาต่อการจอง', () => {
    const r = q({ checkIn: '2027-12-30', checkOut: '2028-01-01', plan: 'FESTIVAL', festivalCode: 'PR-13C' }, ['PR-13C']);
    expect(r.total).toBe(3200 * 2 + 4000);
  });
});

describe('ภาษี มัดจำ แต้ม และเวลายกเลิก', () => {
  it('US-14 ข้อ 2 · ฿1,800 = ห้อง ฿1,529.31 + ค่าบริการ ฿152.93 + VAT ฿117.76', () => {
    expect(taxBreakdown(1800)).toEqual({ base: 1529.31, service: 152.93, vat: 117.76 });
  });
  it('US-34 ข้อ 3 · R02 Low 3 คืน ฿7,200 แผนยกเลิกได้ มัดจำ ฿2,160 · ที่โรงแรม ฿5,040', () => {
    const r = q({ checkIn: '2027-07-01', checkOut: '2027-07-04', rooms: [{ roomType: 'R02', adults: 2, childAges: [] }] });
    expect(r).toMatchObject({ total: 7200, deposit: 2160, dueAtHotel: 5040 });
  });
  it('US-21 ข้อ 3 · Non-ref จ่ายเต็ม', () => {
    const r = q({ checkIn: '2027-07-01', checkOut: '2027-07-04', nonref: true }, ['PR-07']);
    expect(r.deposit).toBe(r.total);
    expect(r.dueAtHotel).toBe(0);
    expect(r.freeCancelUntil).toBeNull();
  });
  it('US-43 · ค่าห้องหลังส่วนลด ฿5,900 → 59 แต้ม · ไม่นับอาหารเช้า', () => {
    const r = q({ checkIn: '2027-03-10', checkOut: '2027-03-12', plan: 'BREAKFAST', rooms: [{ roomType: 'R02', adults: 2, childAges: [] }], code: CODES.WELCOME500, member: { verified: false } });
    expect(r.roomTotal).toBe(5900);
    expect(r.pointsToEarn).toBe(59);
  });
  it('US-43 ข้อ 3 · แลก 200 แต้ม = ลด ฿200 · ต้องเป็นชุดละ 100', () => {
    const r = q({ checkIn: '2027-06-01', checkOut: '2027-06-03', member: { verified: false }, redeemPoints: 200 });
    expect(r.total).toBe(3600 - 200);
    expect(() => q({ checkIn: '2027-06-01', checkOut: '2027-06-03', member: { verified: false }, redeemPoints: 150 })).toThrow(/POINTS_STEP/);
  });
  it('quote ให้เวลายกเลิกฟรีตามซีซั่น', () => {
    expect(q({ checkIn: '2027-07-20', checkOut: '2027-07-21' }).freeCancelUntil?.toISOString()).toBe(bkkInstant('2027-07-17', '14:00').toISOString());
  });
  it('US-07 · หลายห้องในการจองเดียว: R04 1 ห้อง + R01 2 ห้อง', () => {
    const r = q({ checkIn: '2027-06-01', checkOut: '2027-06-02', rooms: [
      { roomType: 'R04', adults: 2, childAges: [5] }, { roomType: 'R01', adults: 2, childAges: [] }, { roomType: 'R01', adults: 1, childAges: [] },
    ] });
    expect(r.total).toBe(3800 + 1800 + 1800);
  });
});
