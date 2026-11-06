'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import { pick, type Lang } from '@/i18n';
import { booking, fill } from '@/i18n/booking';
import { api, msgOf } from '@/lib/client/api';
import { Alert, PriceSummaryBar, Steps } from './common';
import BookingDetails from './BookingDetails';
import { loadNightGroups } from './nightly';
import { getToken, type BookingView } from './shared';
import type { NightGroup } from './common';
import s from './booking.module.css';

export default function BookingDone({ lang, code }: { lang: Lang; code: string }) {
  const t = pick(booking, lang);
  const [view, setView] = useState<BookingView | null>(null);
  const [err, setErr] = useState('');
  const [groups, setGroups] = useState<NightGroup[]>([]);

  useEffect(() => {
    api<BookingView>(`/api/bookings/${encodeURIComponent(code)}`, { token: getToken(code) })
      .then((v) => { setView(v); loadNightGroups(v, lang).then(setGroups).catch(() => undefined); })
      .catch((e) => setErr(msgOf(e, lang)));
  }, [code, lang]);

  if (err) return <div className={`container ${s.page} ${s.narrow}`}><Alert testId="msg-load-error">{err}</Alert></div>;
  if (!view) return <div className={`container ${s.page} ${s.narrow}`}><p className="muted">…</p></div>;

  return (
    <div className={`container ${s.page} ${s.narrow}`} data-testid="booking-done">
      <Steps lang={lang} current={4} />
      <div className="card card-body stack">
        <h1 style={{ margin: 0 }} data-testid="done-title">✓ {t.doneTitle}</h1>
        <p className="muted" style={{ margin: 0 }} data-testid="done-email">{fill(t.doneLead, { e: view.contact.email })}</p>
        <div className={s.codeBox}>
          <span className="small muted">{t.bookingCode}</span>
          <strong data-testid="done-code">{view.code}</strong>
        </div>
        <BookingDetails lang={lang} view={view} />
        <div className="row">
          <Link href={`/${lang}/manage?code=${encodeURIComponent(view.code)}`} className="btn btn-primary" data-testid="link-manage">{t.manageLink}</Link>
          <a href="https://maps.google.com/?q=Kata+Beach+Phuket" target="_blank" rel="noreferrer" className="btn btn-ghost" data-testid="link-map">📍 {t.mapLink}</a>
          <Link href={`/${lang}/book`} className="btn btn-ghost" data-testid="link-book-another">{t.bookAnother}</Link>
        </div>
      </div>
      <PriceSummaryBar lang={lang} total={view.total} caption={t.total} lines={view.lines} nightGroups={groups}
        deposit={view.paid} depositLabel={t.paid} dueAtHotel={view.dueAtHotel} pointsToEarn={view.pointsToEarn} />
    </div>
  );
}
