import { getClock } from '@/lib/clock-db';
import { bkk } from '@/lib/clock';
import { addDays, daysBetween, nightlyRate, seasonOf, stayNights } from '@/lib/rules/calendar';
import { fitsRoom, validateStay, RULES } from '@/lib/rules/stay';
import { quote, type Plan, type Quote, type MemberCtx } from '@/lib/rules/pricing';
import { RuleError, type Msg, type SeasonKind } from '@/lib/rules/types';
import type { Actor } from '@/lib/auth';
import { loadRuleData, memberCtx, type RoomTypeInfo, type RuleData } from './data';
import { availability, sweepExpired } from './inventory';

export interface SearchInput { checkIn: string; checkOut: string; adults: number; childAges: number[]; actor?: Actor }

export interface PlanOption {
  plan: Plan;
  nonref: boolean;
  festivalCode?: string;
  labelTh: string;
  labelEn: string;
  refundable: boolean;
  total: number;
  perNight: number;
  memberPrice: number | null;
  pricePromo: Quote['pricePromo'];
  saved: number;
  freeCancelUntil: string | null;
}

export interface SearchResult {
  roomType: Omit<RoomTypeInfo, 'maxAdults'> & { maxAdults: number };
  left: number;
  lowStock: boolean;
  needsExtraBed: boolean;
  nights: { night: string; season: SeasonKind; price: number }[];
  plans: PlanOption[];
}

function checkGuests(adults: number, childAges: number[]) {
  if (!Number.isInteger(adults) || adults < 1) {
    throw new RuleError('ADULTS_REQUIRED', { th: 'ต้องมีผู้ใหญ่อย่างน้อย 1 ท่าน', en: 'At least 1 adult is required' });
  }
  if (childAges.some((a) => a === null || !Number.isInteger(a) || a < 0 || a > 17)) {
    throw new RuleError('CHILD_AGE_REQUIRED', { th: 'กรุณากรอกอายุเด็กทุกคน', en: 'Please enter the age of every child' });
  }
}

const PLAN_LABEL: Record<string, Msg> = {
  ROOM_ONLY: { th: 'ห้องอย่างเดียว', en: 'Room only' },
  BREAKFAST: { th: 'รวมอาหารเช้า', en: 'Breakfast included' },
};

export function planOptions(data: RuleData, base: Omit<Parameters<typeof quote>[0], 'plan' | 'data'>, roomType: string): PlanOption[] {
  const candidates: { plan: Plan; nonref: boolean; festivalCode?: string; label: Msg }[] = [
    { plan: 'ROOM_ONLY', nonref: false, label: PLAN_LABEL.ROOM_ONLY },
    { plan: 'BREAKFAST', nonref: false, label: PLAN_LABEL.BREAKFAST },
    { plan: 'ROOM_ONLY', nonref: true, label: { th: 'ห้องอย่างเดียว · ไม่คืนเงิน', en: 'Room only · Non-refundable' } },
    { plan: 'BREAKFAST', nonref: true, label: { th: 'รวมอาหารเช้า · ไม่คืนเงิน', en: 'Breakfast · Non-refundable' } },
  ];
  for (const p of data.promotions.filter((x) => x.active && x.grp === 'PLAN')) {
    if (p.kind === 'GREEN' || p.kind === 'HONEYMOON') candidates.push({ plan: p.kind, nonref: false, label: { th: p.nameTh, en: p.nameEn } });
    if (p.kind === 'FESTIVAL') candidates.push({ plan: 'FESTIVAL', nonref: false, festivalCode: p.code, label: { th: p.nameTh, en: p.nameEn } });
  }
  const out: PlanOption[] = [];
  const nights = daysBetween(base.checkIn, base.checkOut);
  for (const c of candidates) {
    try {
      const q = quote({ ...base, plan: c.plan, nonref: c.nonref, festivalCode: c.festivalCode, data: { ...data, roomTypes: data.roomTypes } });
      out.push({
        plan: c.plan, nonref: c.nonref, festivalCode: c.festivalCode, labelTh: c.label.th, labelEn: c.label.en,
        refundable: !c.nonref, total: q.total, perNight: Math.round(q.total / nights), memberPrice: q.memberPrice,
        pricePromo: q.pricePromo, saved: q.saved, freeCancelUntil: q.freeCancelUntil?.toISOString() ?? null,
      });
    } catch (e) {
      if (e instanceof RuleError && e.code === 'PLAN_NOT_ELIGIBLE') continue;
      throw e;
    }
  }
  void roomType;
  return out.sort((a, b) => a.total - b.total);
}

function firstStayError(checkIn: string, checkOut: string, now: Date, data: RuleData) {
  const errs = validateStay({ checkIn, checkOut, now, seasons: data.seasons });
  return errs[0] ?? null;
}

export async function searchRooms(i: SearchInput) {
  checkGuests(i.adults, i.childAges);
  const now = (await getClock()).now();
  await sweepExpired(now);
  const data = await loadRuleData();
  const err = firstStayError(i.checkIn, i.checkOut, now, data);
  if (err) throw new RuleError(err.code, err.msg);
  const nights = stayNights(i.checkIn, i.checkOut);
  const left = await availability(nights);
  const member: MemberCtx | null = i.actor ? await memberCtx(i.actor) : null;
  const adults = i.adults + i.childAges.filter((a) => a > RULES.childMaxAge).length;
  const kids = i.childAges.filter((a) => a <= RULES.childMaxAge).length;

  const results: SearchResult[] = [];
  for (const rt of Object.values(data.roomTypes).sort((a, b) => a.sort - b.sort)) {
    const fit = fitsRoom(rt, adults, kids);
    if (!fit.fits || (left[rt.code] ?? 0) < 1) continue;
    const base = { now, checkIn: i.checkIn, checkOut: i.checkOut, rooms: [{ roomType: rt.code, adults: i.adults, childAges: i.childAges }], member };
    results.push({
      roomType: rt,
      left: left[rt.code],
      lowStock: left[rt.code] <= 3,
      needsExtraBed: fit.needsExtraBed,
      nights: nights.map((n) => { const r = nightlyRate(rt.code, n, data.seasons, data.rates); return { night: n, season: r.season, price: r.price }; }),
      plans: planOptions(data, base, rt.code),
    });
  }

  const suggestions: { checkIn: string; checkOut: string }[] = [];
  if (!results.length) {
    for (const k of [-1, 1, -2, 2, -3, 3]) {
      const ci = addDays(i.checkIn, k);
      const co = addDays(i.checkOut, k);
      if (firstStayError(ci, co, now, data)) continue;
      const l = await availability(stayNights(ci, co));
      const any = Object.values(data.roomTypes).some((rt) => fitsRoom(rt, adults, kids).fits && (l[rt.code] ?? 0) >= 1);
      if (any) suggestions.push({ checkIn: ci, checkOut: co });
      if (suggestions.length === 3) break;
    }
  }
  return {
    checkIn: i.checkIn, checkOut: i.checkOut, nights: nights.length, results, suggestions,
    message: results.length ? null : { th: 'ไม่มีห้องว่างในวันที่เลือก', en: 'No rooms available for the selected dates' },
  };
}

/** Month calendar: cheapest available 1-night room-only price per day (US-09). */
export async function priceCalendar(i: { month: string; adults: number; childAges: number[] }) {
  checkGuests(i.adults, i.childAges);
  const now = (await getClock()).now();
  await sweepExpired(now);
  const data = await loadRuleData();
  const first = `${i.month}-01`;
  const days: string[] = [];
  for (let d = first; d.slice(0, 7) === i.month; d = addDays(d, 1)) days.push(d);
  const { query } = await import('@/lib/db');
  const { rows } = await query<{ room_type_code: string; night: string; left: number }>(
    `SELECT room_type_code, night, (total - sold - held - closed)::int AS left FROM inventory_nights WHERE night = ANY($1::date[])`, [days]);
  const leftBy = new Map(rows.map((r) => [`${r.room_type_code}|${r.night}`, r.left]));
  const adults = i.adults + i.childAges.filter((a) => a > RULES.childMaxAge).length;
  const kids = i.childAges.filter((a) => a <= RULES.childMaxAge).length;
  const today = bkk(now).date;
  return {
    month: i.month,
    days: days.map((date) => {
      const season = seasonOf(date, data.seasons);
      const bookable = !!season && date >= today && daysBetween(today, date) <= RULES.maxLeadDays;
      let from: number | null = null;
      if (bookable) {
        for (const rt of Object.values(data.roomTypes)) {
          if (!fitsRoom(rt, adults, kids).fits || (leftBy.get(`${rt.code}|${date}`) ?? 0) < 1) continue;
          const p = nightlyRate(rt.code, date, data.seasons, data.rates).price;
          if (from === null || p < from) from = p;
        }
      }
      return { date, season, from, full: bookable && from === null, bookable: bookable && from !== null };
    }),
  };
}
