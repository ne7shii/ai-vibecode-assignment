'use client';
import type { Lang } from '@/i18n';
import { api } from '@/lib/client/api';
import { fmtDate } from '@/lib/format';
import type { NightGroup } from './common';
import { nameOf, stayNights, type BookingView, type CalendarDay, type RoomTypeInfo, type Season } from './shared';

/**
 * Per-night prices for the summary bar (US-12 ข้อ 3).
 * Uses view.nightly when the API provides it; otherwise rebuilds it from /api/rooms season rates
 * and /api/calendar seasons (date-specific overrides are not visible this way — see CONTRACT-NOTES).
 */
export async function loadNightGroups(view: BookingView, lang: Lang): Promise<NightGroup[]> {
  const title = (i: number, r: BookingView['rooms'][number]) =>
    view.rooms.length > 1 ? `${lang === 'en' ? 'Room' : 'ห้องที่'} ${i + 1} · ${nameOf(r, lang)}` : nameOf(r, lang);
  if (view.nightly?.length) {
    return view.rooms.map((r, i) => ({
      title: title(i, r),
      nights: view.nightly!.filter((n) => n.room === i).map((n) => ({ label: fmtDate(n.night, lang), season: n.season, price: n.price })),
    }));
  }
  const nights = stayNights(view.checkIn, view.checkOut);
  const months = [...new Set(nights.map((n) => n.slice(0, 7)))];
  const [rooms, ...cals] = await Promise.all([
    api<{ rooms: RoomTypeInfo[] }>('/api/rooms'),
    ...months.map((m) => api<{ days: CalendarDay[] }>(`/api/calendar?month=${m}&adults=1`)),
  ]);
  const season = new Map<string, Season | null>();
  for (const c of cals as { days: CalendarDay[] }[]) for (const d of c.days) season.set(d.date, d.season);
  const rates = new Map((rooms as { rooms: RoomTypeInfo[] }).rooms.map((r) => [r.code, r.rates]));
  return view.rooms.map((r, i) => ({
    title: title(i, r),
    nights: nights.map((n) => {
      const se = season.get(n) ?? null;
      const price = se ? rates.get(r.roomType)?.[se] ?? 0 : 0;
      return { label: fmtDate(n, lang), season: se, price };
    }),
  }));
}
