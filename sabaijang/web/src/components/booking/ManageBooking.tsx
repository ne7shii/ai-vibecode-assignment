'use client';
import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { pick, type Lang } from '@/i18n';
import { booking } from '@/i18n/booking';
import { api, ApiError, msgOf } from '@/lib/client/api';
import { baht, fmtDateTime } from '@/lib/format';
import { Alert, PriceSummaryBar, type NightGroup } from './common';
import BookingDetails from './BookingDetails';
import { loadNightGroups } from './nightly';
import { getToken, nameOf, setToken, type BookingView, type RoomTypeInfo } from './shared';
import s from './booking.module.css';

interface Preview { nonref: boolean; inTime: boolean; freeCancelUntil: string | null; refundAmount: number; paid: number; canChange: boolean }

export default function ManageBooking({ lang, initialCode }: { lang: Lang; initialCode: string }) {
  const t = pick(booking, lang);
  const [code, setCode] = useState(initialCode);
  const [email, setEmail] = useState('');
  const [token, setTok] = useState<string | null>(null);
  const [view, setView] = useState<BookingView | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [groups, setGroups] = useState<NightGroup[]>([]);
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const [mode, setMode] = useState<'' | 'cancel' | 'cancel2' | 'change'>('');
  const [okMsg, setOkMsg] = useState('');
  const [dates, setDates] = useState({ checkIn: '', checkOut: '' });
  const [alts, setAlts] = useState<string[] | null>(null);
  const [roomNames, setRoomNames] = useState<Record<string, RoomTypeInfo>>({});

  const show = useCallback(async (v: BookingView, tok: string | null) => {
    setView(v);
    setDates({ checkIn: v.checkIn, checkOut: v.checkOut });
    loadNightGroups(v, lang).then(setGroups).catch(() => undefined);
    setPreview(null);
    if (v.status === 'CONFIRMED') {
      api<Preview>(`/api/bookings/${encodeURIComponent(v.code)}/cancel-preview`, { token: tok }).then(setPreview).catch(() => setPreview(null));
    }
  }, [lang]);

  // ?code= : members (cookie) and guests who just booked in this browser (token) skip the lookup.
  useEffect(() => {
    if (!initialCode) return;
    const tok = getToken(initialCode);
    api<BookingView>(`/api/bookings/${encodeURIComponent(initialCode)}`, { token: tok })
      .then((v) => { setTok(tok); show(v, tok); })
      .catch(() => undefined);
  }, [initialCode, show]);

  async function lookup(e: React.FormEvent) {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      const r = await api<{ booking: BookingView; token: string }>('/api/manage/lookup', { body: { code: code.trim(), email: email.trim() } });
      setTok(r.token);
      setToken(r.booking.code, r.token);
      show(r.booking, r.token);
    } catch (x) {
      setErr(x instanceof ApiError && x.status === 429 ? t.tooMany : x instanceof ApiError && x.status === 404 ? t.notFound : msgOf(x, lang));
    } finally {
      setBusy(false);
    }
  }

  async function cancel(confirmNonref: boolean) {
    if (!view) return;
    setBusy(true);
    setErr('');
    try {
      const v = await api<BookingView>(`/api/bookings/${encodeURIComponent(view.code)}/cancel`, { body: confirmNonref ? { confirmNonref: true } : {}, token });
      setMode('');
      setOkMsg(t.cancelled);
      show(v, token);
    } catch (x) {
      if (x instanceof ApiError && x.code === 'CONFIRM_NONREF') setMode('cancel2');
      else setErr(msgOf(x, lang));
    } finally {
      setBusy(false);
    }
  }

  async function changeDates(e: React.FormEvent) {
    e.preventDefault();
    if (!view) return;
    setErr('');
    setAlts(null);
    if (dates.checkOut <= dates.checkIn) { setErr(t.sameDay); return; }
    setBusy(true);
    try {
      const v = await api<BookingView>(`/api/bookings/${encodeURIComponent(view.code)}/change-dates`, { body: dates, token });
      setMode('');
      setOkMsg(t.changed);
      show(v, token);
    } catch (x) {
      setErr(msgOf(x, lang));
      if (x instanceof ApiError && Array.isArray(x.data.alternatives)) {
        setAlts(x.data.alternatives as string[]);
        if (!Object.keys(roomNames).length) {
          api<{ rooms: RoomTypeInfo[] }>('/api/rooms').then((r) => setRoomNames(Object.fromEntries(r.rooms.map((x) => [x.code, x])))).catch(() => undefined);
        }
      }
    } finally {
      setBusy(false);
    }
  }

  if (!view) {
    return (
      <div className={`container ${s.page} ${s.narrow}`} data-testid="manage-page">
        <h1>{t.manageTitle}</h1>
        <p className={s.lead}>{t.manageLead}</p>
        <form className={`card ${s.section}`} onSubmit={lookup} noValidate data-testid="lookup-form" style={{ maxWidth: 560 }}>
          <div className="field"><label htmlFor="m-code">{t.bookingCode}</label>
            <input id="m-code" className="input" placeholder={t.codePh} value={code} onChange={(e) => setCode(e.target.value.toUpperCase())} autoCapitalize="characters" required data-testid="input-lookup-code" /></div>
          <div className="field"><label htmlFor="m-email">{t.email}</label>
            <input id="m-email" className="input" type="email" inputMode="email" value={email} onChange={(e) => setEmail(e.target.value)} required data-testid="input-lookup-email" /></div>
          {err && <Alert testId="msg-lookup-error">{err}</Alert>}
          <button type="submit" className="btn btn-primary" disabled={busy || !code.trim() || !email.trim()} data-testid="lookup-submit">{t.find}</button>
        </form>
      </div>
    );
  }

  const age = alts ?? [];
  return (
    <div className={`container ${s.page} ${s.narrow}`} data-testid="manage-page">
      <h1>{t.manageTitle}</h1>
      <div className="card card-body stack">
        <div className={s.codeBox}><span className="small muted">{t.bookingCode}</span><strong data-testid="manage-code">{view.code}</strong></div>
        {okMsg && <Alert kind="ok" testId="msg-manage-ok">{okMsg}</Alert>}
        <BookingDetails lang={lang} view={view} />

        {view.status === 'CONFIRMED' && (
          <div className="stack" data-testid="manage-actions">
            <div className="row">
              <button type="button" className="btn btn-danger" onClick={() => { setMode('cancel'); setErr(''); setOkMsg(''); }} data-testid="cancel-open">{t.cancelBtn}</button>
              {preview?.canChange && (
                <button type="button" className="btn btn-ghost" onClick={() => { setMode('change'); setErr(''); setOkMsg(''); setAlts(null); }} data-testid="change-open">{t.changeBtn}</button>
              )}
            </div>
            {preview && !preview.canChange && (
              <p className="small muted" style={{ margin: 0 }} data-testid="change-hidden-reason">{preview.nonref ? t.changeHiddenNonref : t.changeHiddenLate}</p>
            )}

            {(mode === 'cancel' || mode === 'cancel2') && preview && (
              <section className={`card ${s.section} ${s.danger}`} data-testid="cancel-preview">
                <h2>{t.cancelPreviewTitle}</h2>
                <div className={s.amounts}>
                  <div><span>{t.paid}</span><strong data-testid="cancel-paid">{baht(preview.paid)}</strong></div>
                  <div className={s.big}><span>{t.refundAmount}</span><strong data-testid="cancel-refund">{baht(preview.refundAmount)}</strong></div>
                </div>
                <p style={{ margin: 0 }} data-testid="cancel-policy">
                  {preview.nonref ? <strong>{t.refundNonref}</strong> : preview.inTime ? t.refundInTime : <strong>{t.refundLate}</strong>}
                  {preview.freeCancelUntil && !preview.nonref && <> · {t.freeCancel} {fmtDateTime(preview.freeCancelUntil, lang)}</>}
                </p>
                {err && <Alert testId="msg-cancel-error">{err}</Alert>}
                {mode === 'cancel2' && <div className={s.warnBox} data-testid="nonref-second-confirm"><strong>⚠ {t.nonrefWarn}</strong></div>}
                <div className="row">
                  {mode === 'cancel'
                    ? <button type="button" className="btn btn-danger" disabled={busy} onClick={() => (preview.nonref ? setMode('cancel2') : cancel(false))} data-testid="cancel-confirm">{t.confirmCancel}</button>
                    : <button type="button" className="btn btn-danger" disabled={busy} onClick={() => cancel(true)} data-testid="cancel-confirm-nonref">{t.confirmNonref}</button>}
                  <button type="button" className="btn btn-ghost" onClick={() => setMode('')} data-testid="cancel-keep">{t.keepBooking}</button>
                </div>
              </section>
            )}

            {mode === 'change' && (
              <form className={`card ${s.section}`} onSubmit={changeDates} noValidate data-testid="change-form">
                <h2>{t.changeTitle}</h2>
                <p className="small muted" style={{ margin: 0 }}>{t.changeLead}</p>
                <div className={s.dates}>
                  <div className="field"><label htmlFor="cd-in">{t.checkIn}</label>
                    <input id="cd-in" type="date" className="input" value={dates.checkIn} onChange={(e) => setDates({ ...dates, checkIn: e.target.value })} data-testid="change-checkin" /></div>
                  <div className="field"><label htmlFor="cd-out">{t.checkOut}</label>
                    <input id="cd-out" type="date" className="input" value={dates.checkOut} min={dates.checkIn} onChange={(e) => setDates({ ...dates, checkOut: e.target.value })} data-testid="change-checkout" /></div>
                </div>
                {err && <Alert testId="msg-change-error">{err}</Alert>}
                {alts && (
                  <div data-testid="change-alternatives">
                    {age.length ? (
                      <>
                        <p className="small" style={{ margin: 0 }}>{t.alternatives}</p>
                        <div className={s.chips}>
                          {age.map((c) => (
                            <Link key={c} className={s.chip} href={`/${lang}/book?checkIn=${dates.checkIn}&checkOut=${dates.checkOut}&adults=${view.rooms[0].adults}${view.rooms[0].childAges.length ? `&children=${view.rooms[0].childAges.join(',')}` : ''}&room=${c}`} data-testid={`alt-${c}`}>
                              {roomNames[c] ? nameOf(roomNames[c], lang) : c}
                            </Link>
                          ))}
                        </div>
                      </>
                    ) : <p className="small muted" style={{ margin: 0 }}>{t.noAlternatives}</p>}
                  </div>
                )}
                <div className="row">
                  <button type="submit" className="btn btn-primary" disabled={busy} data-testid="change-submit">{t.changeSubmit}</button>
                  <button type="button" className="btn btn-ghost" onClick={() => setMode('')} data-testid="change-cancel">{t.keepBooking}</button>
                </div>
              </form>
            )}
          </div>
        )}
        {mode === '' && err && <Alert testId="msg-manage-error">{err}</Alert>}
        <p style={{ margin: 0 }}>
          <button type="button" className="btn btn-ghost btn-sm" onClick={() => { setView(null); setErr(''); setOkMsg(''); setMode(''); }} data-testid="lookup-another">{t.lookupAnother}</button>
        </p>
      </div>
      <PriceSummaryBar lang={lang} total={view.total} lines={view.lines} nightGroups={groups}
        deposit={view.paid} depositLabel={t.paid} dueAtHotel={view.status === 'CANCELLED' ? null : view.dueAtHotel} />
    </div>
  );
}
