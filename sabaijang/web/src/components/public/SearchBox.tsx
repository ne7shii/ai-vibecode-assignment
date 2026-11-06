'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import type { Lang } from '@/i18n';
import { tp } from '@/i18n/public';
import s from './public.module.css';

const addDays = (d: string, n: number) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

/** Home search: dates, adults, children with one required age per child → /{lang}/book?… */
export default function SearchBox({ lang, today, compact = false }: { lang: Lang; today: string; compact?: boolean }) {
  const t = tp(lang);
  const router = useRouter();
  const [checkIn, setCheckIn] = useState(addDays(today, 7));
  const [checkOut, setCheckOut] = useState(addDays(today, 9));
  const [adults, setAdults] = useState(2);
  const [ages, setAges] = useState<string[]>([]);
  const [error, setError] = useState('');

  function setChildren(n: number) {
    setAges((a) => Array.from({ length: n }, (_, i) => a[i] ?? ''));
  }

  function onCheckIn(v: string) {
    setCheckIn(v);
    if (v && (!checkOut || checkOut <= v)) setCheckOut(addDays(v, 1));
  }

  function submit(e: FormEvent) {
    e.preventDefault();
    if (!checkIn || !checkOut) return setError(t.errDates);
    if (checkIn < today) return setError(t.errPast);
    if (checkOut <= checkIn) return setError(t.errOrder);
    if (ages.some((a) => a === '')) return setError(t.errAges);
    setError('');
    const q = new URLSearchParams({ checkIn, checkOut, adults: String(adults) });
    if (ages.length) q.set('children', ages.join(','));
    router.push(`/${lang}/book?${q.toString().replace(/%2C/g, ',')}`);
  }

  return (
    <form className={s.search} onSubmit={submit} noValidate data-testid="search-form" aria-label={t.searchTitle}>
      <div className={s.searchRow}>
        <div className={s.searchField}>
          <label htmlFor="sb-in">{t.checkIn}</label>
          <input id="sb-in" className="input" type="date" min={today} value={checkIn} onChange={(e) => onCheckIn(e.target.value)} data-testid="search-checkin" required />
        </div>
        <div className={s.searchField}>
          <label htmlFor="sb-out">{t.checkOut}</label>
          <input id="sb-out" className="input" type="date" min={checkIn ? addDays(checkIn, 1) : today} value={checkOut} onChange={(e) => setCheckOut(e.target.value)} data-testid="search-checkout" required />
        </div>
        <div className={s.searchField}>
          <label htmlFor="sb-ad">{t.adults}</label>
          <select id="sb-ad" className="input" value={adults} onChange={(e) => setAdults(Number(e.target.value))} data-testid="search-adults">
            {Array.from({ length: 10 }, (_, i) => i + 1).map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <div className={s.searchField}>
          <label htmlFor="sb-ch">{t.children}</label>
          <select id="sb-ch" className="input" value={ages.length} onChange={(e) => setChildren(Number(e.target.value))} data-testid="search-children">
            {[0, 1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <button className={`btn btn-gold ${s.searchBtn}`} type="submit" data-testid="search-submit">{t.search}</button>
      </div>
      {ages.length > 0 && (
        <div className={s.ages} data-testid="search-ages">
          {ages.map((a, i) => (
            <div className={s.searchField} key={i}>
              <label htmlFor={`sb-age-${i}`}>{t.childAge} {i + 1}</label>
              <select
                id={`sb-age-${i}`} className="input" value={a} required aria-invalid={!!error && a === ''}
                onChange={(e) => setAges((arr) => arr.map((x, j) => (j === i ? e.target.value : x)))}
                data-testid={`search-child-age-${i}`}
                style={error && a === '' ? { borderColor: 'var(--bad)' } : undefined}
              >
                <option value="">{t.childAgePick}</option>
                {Array.from({ length: 12 }, (_, n) => n).map((n) => <option key={n} value={n}>{n === 0 ? t.ageUnder1 : `${n} ${t.years}`}</option>)}
              </select>
            </div>
          ))}
        </div>
      )}
      {error && <div className={s.searchErr} role="alert" data-testid="search-error">{error}</div>}
      {!compact && (
        <div className={s.searchFoot}>
          <span>{t.childHint}</span>
          <Link href={`/${lang}/book?view=calendar&adults=${adults}`} data-testid="search-calendar-link">{t.priceCalendar} →</Link>
        </div>
      )}
    </form>
  );
}
