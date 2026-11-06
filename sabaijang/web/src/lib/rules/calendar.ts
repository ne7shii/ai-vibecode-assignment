import type { Season, SeasonKind, RateTable } from './types';

const DAY = 86_400_000;
const toUtc = (d: string) => Date.parse(`${d}T00:00:00Z`);

export function addDays(date: string, n: number): string {
  return new Date(toUtc(date) + n * DAY).toISOString().slice(0, 10);
}

export function daysBetween(from: string, to: string): number {
  return Math.round((toUtc(to) - toUtc(from)) / DAY);
}

/** Nights of a stay: check-in date up to the night before check-out. */
export function stayNights(checkIn: string, checkOut: string): string[] {
  const n = daysBetween(checkIn, checkOut);
  return Array.from({ length: Math.max(0, n) }, (_, i) => addDays(checkIn, i));
}

const PRIORITY: Record<SeasonKind, number> = { PEAK: 3, HIGH: 2, LOW: 1 };

/** Season of a single night. Peak beats High (US-15 ข้อ 2). */
export function seasonOf(night: string, seasons: Season[]): SeasonKind | null {
  let best: SeasonKind | null = null;
  for (const s of seasons) {
    if (night >= s.start && night <= s.end && (!best || PRIORITY[s.kind] > PRIORITY[best])) best = s.kind;
  }
  return best;
}

export function nightlyRate(roomType: string, night: string, seasons: Season[], rates: RateTable) {
  const season = seasonOf(night, seasons);
  if (!season) throw new Error(`no season for ${night}`);
  const override = rates.date[roomType]?.[night];
  return {
    night,
    season,
    price: override ?? rates.season[roomType][season],
    override: override !== undefined,
  };
}

/** Dates in [from, from+days) that belong to no season (US-15 ข้อ 3). */
export function seasonGaps(from: string, days: number, seasons: Season[]): string[] {
  const gaps: string[] = [];
  for (let i = 0; i < days; i++) {
    const d = addDays(from, i);
    if (!seasonOf(d, seasons)) gaps.push(d);
  }
  return gaps;
}
