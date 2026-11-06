import { describe, it, expect } from 'vitest';
import { parseAvailability } from './chat';

// US-50 ข้อ 2 · อ่านคำถามห้องว่าง "2 คน 12–14 ส.ค." · ปีเดาจากวันนี้ของเว็บ (ครั้งถัดไปที่จะถึง)
describe('US-50 · parseAvailability', () => {
  const today = '2027-03-01';
  it.each([
    ['2 คน 12–14 ส.ค.', { checkIn: '2027-08-12', checkOut: '2027-08-14', adults: 2 }],
    ['ว่างไหม 2 คน 12-14 ส.ค.', { checkIn: '2027-08-12', checkOut: '2027-08-14', adults: 2 }],
    ['2 adults 12-14 Aug', { checkIn: '2027-08-12', checkOut: '2027-08-14', adults: 2 }],
    ['Aug 12 - 14 for 3 people', { checkIn: '2027-08-12', checkOut: '2027-08-14', adults: 3 }],
    ['12 Aug to 14 Aug, 1 adult', { checkIn: '2027-08-12', checkOut: '2027-08-14', adults: 1 }],
    ['30 ส.ค. – 2 ก.ย. 4 ท่าน', { checkIn: '2027-08-30', checkOut: '2027-09-02', adults: 4 }],
    ['28 ธ.ค. - 2 ม.ค. 2 คน', { checkIn: '2027-12-28', checkOut: '2028-01-02', adults: 2 }],
    ['1 คน 5-6 มีนาคม', { checkIn: '2027-03-05', checkOut: '2027-03-06', adults: 1 }],
    ['2 คน 12–14 ส.ค. 2570', { checkIn: '2027-08-12', checkOut: '2027-08-14', adults: 2 }],
    ['12-14 ส.ค.', { checkIn: '2027-08-12', checkOut: '2027-08-14', adults: 2 }],
  ])('%s', (msg, expected) => {
    expect(parseAvailability(msg, today)).toEqual(expected);
  });

  it('วันที่ผ่านไปแล้วในปีนี้ → ปีหน้า (วันนี้ 1 ก.ย. 2027 ถาม 12–14 ส.ค. → 2028)', () => {
    expect(parseAvailability('2 คน 12–14 ส.ค.', '2027-09-01')).toEqual({ checkIn: '2028-08-12', checkOut: '2028-08-14', adults: 2 });
  });

  it('ไม่ใช่คำถามห้องว่าง → null', () => {
    for (const m of ['เช็กอินกี่โมง', 'อาหารเช้าเท่าไร', 'hello', 'เด็ก 5 ขวบพักฟรีไหม', '']) expect(parseAvailability(m, today)).toBeNull();
  });
});
