// Clock port. Every business rule asks a Clock for "now"; never call new Date() directly.
export interface Clock {
  now(): Date;
}

const BKK_OFFSET_MS = 7 * 60 * 60 * 1000; // Thailand has no DST

export class FixedClock implements Clock {
  private t: number;
  constructor(at: Date) { this.t = at.getTime(); }
  now() { return new Date(this.t); }
  advance(minutes: number) { this.t += minutes * 60_000; }
  set(at: Date) { this.t = at.getTime(); }
}

export class SystemClock implements Clock {
  constructor(private offsetMs = 0) {}
  now() { return new Date(Date.now() + this.offsetMs); }
}

/** Bangkok wall-clock parts of an instant. */
export function bkk(d: Date): { date: string; time: string; minutes: number } {
  const local = new Date(d.getTime() + BKK_OFFSET_MS);
  const iso = local.toISOString();
  const minutes = local.getUTCHours() * 60 + local.getUTCMinutes();
  return { date: iso.slice(0, 10), time: iso.slice(11, 16), minutes };
}

/** Instant for a Bangkok wall-clock date ('YYYY-MM-DD') and time ('HH:MM'). */
export function bkkInstant(date: string, time = '00:00'): Date {
  return new Date(`${date}T${time}:00+07:00`);
}
