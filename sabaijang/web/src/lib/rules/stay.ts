import { bkk, bkkInstant } from '../clock';
import { addDays, daysBetween, seasonOf, stayNights } from './calendar';
import type { Msg, RoomTypeSpec, Season } from './types';

export const RULES = {
  sameDayCutoffMinutes: 20 * 60, // §5 เช็กอินวันนี้จองได้ถึง 20:00
  maxLeadDays: 365,              // US-02
  maxNights: 30,                 // US-02
  peakMinNights: 2,              // US-13
  freeCancelDays: 3,             // §6
  freeCancelDaysPeak: 14,        // §6
  freeCancelTime: '14:00',
  holdMinutes: 15,               // US-33
  depositRate: 0.3,              // §5
  maxRoomsPerBooking: 5,         // US-07
  childMaxAge: 11,               // §4 เด็ก = ต่ำกว่า 12 ปี
};

export interface StayError { code: string; msg: Msg }

export function validateStay(i: { checkIn: string; checkOut: string; now: Date; seasons: Season[] }): StayError[] {
  const today = bkk(i.now);
  if (i.checkOut <= i.checkIn) {
    return [{ code: 'CHECKOUT_NOT_AFTER', msg: { th: 'กรุณาเลือกวันเช็กเอาต์หลังวันเช็กอิน', en: 'Please choose a check-out date after check-in' } }];
  }
  if (i.checkIn < today.date) {
    return [{ code: 'PAST_DATE', msg: { th: 'ไม่สามารถจองวันที่ผ่านมาแล้ว', en: 'You cannot book a past date' } }];
  }
  if (i.checkIn === today.date && today.minutes > RULES.sameDayCutoffMinutes) {
    return [{ code: 'SAME_DAY_CLOSED', msg: { th: 'วันนี้ปิดรับจองแล้ว (จองเข้าพักวันนี้ได้ถึง 20:00)', en: 'Same-day booking closes at 20:00' } }];
  }
  if (daysBetween(today.date, i.checkIn) > RULES.maxLeadDays) {
    return [{ code: 'TOO_FAR', msg: { th: 'จองล่วงหน้าได้สูงสุด 365 วัน', en: 'Bookings open up to 365 days ahead' } }];
  }
  const nights = stayNights(i.checkIn, i.checkOut);
  if (nights.length > RULES.maxNights) {
    return [{ code: 'TOO_LONG', msg: { th: 'พักได้สูงสุด 30 คืนต่อการจอง กรุณาติดต่อฝ่ายขาย sales@sabaijang.test', en: 'Maximum 30 nights per booking. Please contact our sales team at sales@sabaijang.test' } }];
  }
  if (nights.some((n) => !seasonOf(n, i.seasons))) {
    return [{ code: 'NOT_OPEN', msg: { th: 'ยังไม่เปิดขายช่วงวันที่นี้', en: 'These dates are not open for sale yet' } }];
  }
  if (nights.length < RULES.peakMinNights && nights.some((n) => seasonOf(n, i.seasons) === 'PEAK')) {
    return [{ code: 'PEAK_MIN_2', msg: { th: 'ช่วงวันที่นี้ต้องพักอย่างน้อย 2 คืน', en: 'A minimum stay of 2 nights applies to these dates' } }];
  }
  return [];
}

/** Capacity check including the optional extra bed (US-01 ข้อ 2). Children ≥ 12 must be passed as adults. */
export function fitsRoom(rt: RoomTypeSpec, adults: number, children: number) {
  const total = adults + children;
  if (adults <= rt.maxAdults && total <= rt.maxTotal) return { fits: true, needsExtraBed: false };
  if (rt.extraBedAllowed && adults <= rt.maxAdults + 1 && total <= rt.maxTotal + 1) return { fits: true, needsExtraBed: true };
  return { fits: false, needsExtraBed: false };
}

/** Age in whole years on the check-in date (§4). */
export function ageAtCheckIn(birthDate: string, checkIn: string): number {
  const [by, bm, bd] = birthDate.split('-').map(Number);
  const [cy, cm, cd] = checkIn.split('-').map(Number);
  return cy - by - (cm < bm || (cm === bm && cd < bd) ? 1 : 0);
}

/** Last moment for free cancellation (US-39 · §6). */
export function freeCancelUntil(checkIn: string, hasPeak: boolean): Date {
  const days = hasPeak ? RULES.freeCancelDaysPeak : RULES.freeCancelDays;
  return bkkInstant(addDays(checkIn, -days), RULES.freeCancelTime);
}
