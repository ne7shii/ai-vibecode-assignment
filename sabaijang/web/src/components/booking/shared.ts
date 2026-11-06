'use client';
// Client-side shapes (mirroring API-CONTRACT.md) and small helpers for the booking UI.
import type { Lang } from '@/i18n';

export type Season = 'LOW' | 'HIGH' | 'PEAK';
export type Plan = 'ROOM_ONLY' | 'BREAKFAST' | 'GREEN' | 'HONEYMOON' | 'FESTIVAL';

export interface RoomTypeInfo {
  code: string; nameTh: string; nameEn: string; descTh: string; descEn: string; sizeSqm: number;
  bedTh: string; bedEn: string; viewTh: string; viewEn: string; maxAdults: number; maxTotal: number;
  extraBedAllowed: boolean; totalRooms: number; amenities: string[];
  photos: { file: string; captionTh: string; captionEn: string }[];
  rates?: Record<Season, number>;
}

export interface PlanOption {
  plan: Plan; nonref: boolean; festivalCode?: string; labelTh: string; labelEn: string; refundable: boolean;
  total: number; perNight: number; memberPrice: number | null;
  pricePromo: { code: string; nameTh: string; nameEn: string; saved: number } | null; saved: number; freeCancelUntil: string | null;
}

export interface SearchResultItem {
  roomType: RoomTypeInfo; left: number; lowStock: boolean; needsExtraBed: boolean;
  nights: { night: string; season: Season; price: number }[]; plans: PlanOption[];
}

export interface SearchResponse {
  checkIn: string; checkOut: string; nights: number; results: SearchResultItem[];
  suggestions: { checkIn: string; checkOut: string }[]; message: { th: string; en: string } | null;
}

export interface CalendarDay { date: string; season: Season | null; from: number | null; full: boolean; bookable: boolean }

export interface PriceLine { kind: string; labelTh: string; labelEn: string; amount: number }

export interface BookingView {
  code: string; status: string; userId: number | null; lang: string; plan: Plan; planLabel: { th: string; en: string };
  nonref: boolean; festivalCode: string | null; checkIn: string; checkOut: string; nights: number; hasPeak: boolean;
  holdExpiresAt: string | null; contact: { name: string; email: string; phone: string };
  rooms: { id: number; roomType: string; nameTh: string; nameEn: string; adults: number; childAges: number[]; extraBed: boolean; roomNo: string | null; specialRequest: string; bedPref: string | null; highFloor: boolean }[];
  lines: PriceLine[]; promotions: { code: string; nameTh: string; nameEn: string; saved: number }[];
  total: number; roomTotal: number; deposit: number; paid: number; refunded: number; dueAtHotel: number; saved: number;
  freeCancelUntil: string | null; promoCode: string | null; pointsToEarn: number; pointsRedeemed: number; pointsEarned: number;
  addons: { id: number; kind: string; labelTh: string; labelEn: string; price: number; status: string; flightNo: string | null; arriveTime: string | null }[];
  taxInvoice: { company: string; address: string; taxId: string; branch: string } | null;
  dinnerNight: string | null; arrivalTime: string | null; marketingConsent: boolean; nonrefAck: boolean;
  payments: { method: string; direction: string; amount: number; status: string; last4: string | null; at: string }[];
  createdAt: string; birthdayUsed: boolean;
  /** Optional per-night breakdown (requested in CONTRACT-NOTES/booking-ui.md). */
  nightly?: { room: number; roomType: string; night: string; season: Season; price: number }[];
  codeError?: { th: string; en: string } | null;
}

export interface MeMember {
  kind: 'member';
  user: { id: number; email: string; displayName: string; phone: string; verified: boolean; birthDate: string | null; lang: string; photo: string | null; marketingConsent: boolean };
  points: number;
}
export type Me = MeMember | { kind: 'staff' } | null;

export interface RoomReq { adults: number; childAges: (number | '')[] }

/** Nightly line used by the summary bar. */
export interface NightLine { label: string; season: Season | null; price: number }

export const tokenKey = (code: string) => `sj-hold-${code}`;
export function getToken(code: string): string | null {
  try { return sessionStorage.getItem(tokenKey(code)); } catch { return null; }
}
export function setToken(code: string, token: string) {
  try { sessionStorage.setItem(tokenKey(code), token); } catch { /* storage blocked */ }
}

/** YYYY-MM-DD arithmetic in UTC (dates only, no time zone drift). */
export function addDays(date: string, n: number): string {
  const d = new Date(`${date}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
export function daysBetween(a: string, b: string): number {
  return Math.round((Date.parse(`${b}T00:00:00Z`) - Date.parse(`${a}T00:00:00Z`)) / 86_400_000);
}
export function stayNights(checkIn: string, checkOut: string): string[] {
  const out: string[] = [];
  for (let d = checkIn; d < checkOut && out.length < 400; d = addDays(d, 1)) out.push(d);
  return out;
}

export const nameOf = (o: { nameTh: string; nameEn: string }, lang: Lang) => (lang === 'en' ? o.nameEn : o.nameTh);
export const labelOf = (o: { labelTh: string; labelEn: string }, lang: Lang) => (lang === 'en' ? o.labelEn : o.labelTh);
export const msgText = (m: { th: string; en: string } | null | undefined, lang: Lang) => (m ? (lang === 'en' ? m.en : m.th) : '');

/** US-14 ข้อ 2: total already includes service 10% and VAT 7% (on room + service). */
export function taxBreakdown(total: number) {
  const base = Math.round((total / 1.177) * 100) / 100;
  const service = Math.round(base * 0.1 * 100) / 100;
  const vat = Math.round((total - base - service) * 100) / 100;
  return { base, service, vat };
}

export const seasonBadge = (s: Season | null | undefined) => (s === 'PEAK' ? 'badge badge-peak' : s === 'HIGH' ? 'badge badge-high' : 'badge badge-low');

export function guestsQuery(rooms: RoomReq[]) {
  return rooms.map((r) => ({ adults: r.adults, childAges: r.childAges.map((a) => (a === '' ? -1 : a)) }));
}
