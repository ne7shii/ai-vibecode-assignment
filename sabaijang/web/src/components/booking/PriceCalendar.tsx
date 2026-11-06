'use client';
import { useEffect, useState } from 'react';
import { pick, type Lang } from '@/i18n';
import { booking } from '@/i18n/booking';
import { api, msgOf } from '@/lib/client/api';
import { fmtMonth } from '@/lib/format';
import type { CalendarDay } from './shared';
import s from './booking.module.css';

function shiftMonth(month: string, n: number) {
  const [y, m] = month.split('-').map(Number);
  const d = new Date(Date.UTC(y, m - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

/** US-09: month view with the cheapest price per night, season colours and "เต็ม" days. */
export default function PriceCalendar(p: {
  lang: Lang; today: string; startMonth: string; adults: number; childAges: number[];
  checkIn: string; checkOut: string; onPick: (date: string) => void;
}) {
  const t = pick(booking, p.lang);
  const [month, setMonth] = useState(p.startMonth);
  const [days, setDays] = useState<CalendarDay[] | null>(null);
  const [err, setErr] = useState('');
  const minMonth = p.today.slice(0, 7);
  const maxMonth = shiftMonth(minMonth, 12);
  const agesKey = p.childAges.join(',');

  useEffect(() => { setMonth(p.startMonth); }, [p.startMonth]);
  useEffect(() => {
    let live = true;
    setDays(null);
    setErr('');
    api<{ days: CalendarDay[] }>(`/api/calendar?month=${month}&adults=${p.adults}&children=${agesKey}`)
      .then((r) => { if (live) setDays(r.days); })
      .catch((e) => { if (live) setErr(msgOf(e, p.lang)); });
    return () => { live = false; };
  }, [month, p.adults, agesKey, p.lang]);

  const first = new Date(`${month}-01T00:00:00Z`).getUTCDay();
  const dows = t.weekdays.split(',');
  const pickingOut = !!p.checkIn && !p.checkOut;

  return (
    <div className={`card ${s.cal}`} data-testid="price-calendar">
      <div className={s.calHead}>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMonth(shiftMonth(month, -1))} disabled={month <= minMonth} aria-label={t.calPrev} data-testid="cal-prev">‹</button>
        <strong data-testid="cal-month">{fmtMonth(month, p.lang)}</strong>
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setMonth(shiftMonth(month, 1))} disabled={month >= maxMonth} aria-label={t.calNext} data-testid="cal-next">›</button>
      </div>
      <p className="small muted" style={{ margin: '0 0 6px' }} data-testid="cal-hint">{pickingOut ? t.calPickOut : t.calHint}</p>
      {err && <div className="alert alert-bad small" data-testid="cal-error">{err}</div>}
      <div className={s.calGrid} role="grid" aria-label={t.calTitle}>
        {dows.map((d) => <div key={d} className={s.calDow} role="columnheader">{d}</div>)}
        {Array.from({ length: first }, (_, i) => <div key={`e${i}`} />)}
        {(days ?? []).map((d) => {
          const asCheckOut = pickingOut && d.date > p.checkIn && !!d.season && d.date >= p.today;
          const disabled = !(d.bookable || asCheckOut);
          const sel = d.date === p.checkIn || d.date === p.checkOut;
          const inRange = p.checkIn && p.checkOut && d.date > p.checkIn && d.date < p.checkOut;
          const cls = [s.day, d.season ? s[d.season] : '', d.full ? s.full : '', sel ? s.sel : '', inRange ? s.inRange : ''].join(' ');
          return (
            <button key={d.date} type="button" className={cls} disabled={disabled} onClick={() => p.onPick(d.date)}
              aria-pressed={sel} aria-label={`${d.date}${d.full ? ` ${t.calFull}` : d.from ? ` ฿${d.from}` : ''}`}
              data-testid={`cal-day-${d.date}`} data-season={d.season ?? ''} data-full={d.full ? '1' : '0'}>
              <span>{Number(d.date.slice(8))}</span>
              <small>{d.full ? t.calFull : d.from ? d.from.toLocaleString('en-US') : ' '}</small>
            </button>
          );
        })}
      </div>
      {!days && !err && <p className="small muted">…</p>}
      <div className={s.legend} data-testid="cal-legend">
        <span><i className={s.sw} style={{ background: '#fdf1ec' }} />{t.seasonLOW}</span>
        <span><i className={s.sw} style={{ background: '#edf2fa' }} />{t.seasonHIGH}</span>
        <span><i className={s.sw} style={{ background: '#fbe4e4' }} />{t.seasonPEAK}</span>
        <span><i className={s.sw} style={{ background: '#f3f1ec' }} />{t.calFull}</span>
      </div>
    </div>
  );
}
