// Server-only data helpers for the public pages (read DB directly through the lead's services).
import { loadRuleData, type RoomTypeInfo } from '@/lib/services/data';
import { getClock } from '@/lib/clock-db';
import { bkk } from '@/lib/clock';
import { addDays, nightlyRate, seasonOf } from '@/lib/rules/calendar';
import type { Season, SeasonKind } from '@/lib/rules/types';

export type Rates = Record<SeasonKind, number>;
export interface PublicRoom extends RoomTypeInfo { rates: Rates; from: number }

export async function loadPublicRooms() {
  const [data, clock] = await Promise.all([loadRuleData(), getClock()]);
  const now = clock.now();
  const today = bkk(now).date;
  const rooms: PublicRoom[] = Object.values(data.roomTypes)
    .sort((a, b) => a.sort - b.sort)
    .map((rt) => {
      const rates = data.rates.season[rt.code];
      return { ...rt, rates, from: Math.min(rates.LOW, rates.HIGH, rates.PEAK) };
    });
  return { rooms, seasons: data.seasons, rates: data.rates, today, nowIso: now.toISOString(), todaySeason: seasonOf(today, data.seasons) };
}

/** Season ranges that touch the next 365 days, grouped by kind, for the rate table. */
export function upcomingRanges(seasons: Season[], today: string) {
  const until = addDays(today, 365);
  const out: Record<SeasonKind, { start: string; end: string }[]> = { LOW: [], HIGH: [], PEAK: [] };
  for (const s of [...seasons].sort((a, b) => a.start.localeCompare(b.start))) {
    if (s.end < today || s.start > until) continue;
    out[s.kind].push({ start: s.start, end: s.end });
  }
  return out;
}

export function priceNights(code: string, checkIn: string, checkOut: string, data: { seasons: Season[]; rates: Parameters<typeof nightlyRate>[3] }) {
  const nights: { night: string; season: SeasonKind; price: number }[] = [];
  for (let d = checkIn; d < checkOut && nights.length < 30; d = addDays(d, 1)) {
    try {
      const r = nightlyRate(code, d, data.seasons, data.rates);
      nights.push({ night: d, season: r.season, price: r.price });
    } catch {
      return null;
    }
  }
  return nights;
}

export const isIsoDate = (v: unknown): v is string => typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v);
