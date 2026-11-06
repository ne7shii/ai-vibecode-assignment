import { describe, it, expect } from 'vitest';
import { FixedClock, bkk, bkkInstant } from './clock';

describe('Clock', () => {
  it('ล็อกเวลาแล้ว now() คงที่', () => {
    const c = new FixedClock(bkkInstant('2027-03-01', '10:00'));
    expect(c.now().toISOString()).toBe('2027-03-01T03:00:00.000Z');
    expect(c.now().getTime()).toBe(c.now().getTime());
  });

  it('advance(15) เลื่อน 15 นาทีพอดี', () => {
    const c = new FixedClock(bkkInstant('2027-03-01', '10:00'));
    c.advance(15);
    expect(bkk(c.now())).toEqual({ date: '2027-03-01', time: '10:15', minutes: 615 });
  });

  it('แปลงเวลาเป็นเวลาไทย (UTC+7) ข้ามวันได้', () => {
    expect(bkk(new Date('2027-02-28T17:30:00Z'))).toEqual({ date: '2027-03-01', time: '00:30', minutes: 30 });
  });
});
