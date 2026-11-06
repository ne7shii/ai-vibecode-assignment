'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useRef, useState } from 'react';
import { pick, type Lang } from '@/i18n';
import { booking, fill } from '@/i18n/booking';
import { api, ApiError, msgOf } from '@/lib/client/api';
import { baht, fmtDate, fmtDateTime } from '@/lib/format';
import { Alert, PriceSummaryBar, Steps, useMe, type NightGroup } from './common';
import { loadNightGroups } from './nightly';
import PaymentForm from './PaymentForm';
import { getToken, msgText, nameOf, stayNights, type BookingView, type MeMember } from './shared';
import s from './booking.module.css';

type AddonKind = 'TRANSFER' | 'EARLY_IN' | 'LATE_OUT';
interface Form {
  name: string; email: string; phone: string;
  rooms: { specialRequest: string; bedPref: '' | 'KING' | 'TWIN'; highFloor: boolean }[];
  arrivalTime: string;
  transfer: boolean; flightNo: string; flightTime: string; early: boolean; late: boolean;
  taxOn: boolean; company: string; address: string; taxId: string; branch: string;
  dinnerNight: string; code: string; redeemPoints: number; marketingConsent: boolean; nonrefAck: boolean;
}

function formFrom(v: BookingView, me: MeMember | null): Form {
  const tr = v.addons.find((a) => a.kind === 'TRANSFER' || a.kind === 'VAN');
  return {
    name: v.contact.name || me?.user.displayName || '',
    email: v.contact.email || me?.user.email || '',
    phone: v.contact.phone || me?.user.phone || '',
    rooms: v.rooms.map((r) => ({ specialRequest: r.specialRequest ?? '', bedPref: (r.bedPref ?? '') as Form['rooms'][number]['bedPref'], highFloor: !!r.highFloor })),
    arrivalTime: v.arrivalTime ?? '',
    transfer: !!tr, flightNo: tr?.flightNo ?? '', flightTime: tr?.arriveTime ?? '',
    early: v.addons.some((a) => a.kind === 'EARLY_IN'), late: v.addons.some((a) => a.kind === 'LATE_OUT'),
    taxOn: !!v.taxInvoice, company: v.taxInvoice?.company ?? '', address: v.taxInvoice?.address ?? '', taxId: v.taxInvoice?.taxId ?? '', branch: v.taxInvoice?.branch ?? '',
    dinnerNight: v.dinnerNight ?? '', code: v.promoCode ?? '', redeemPoints: v.pointsRedeemed ?? 0,
    marketingConsent: !!v.marketingConsent, nonrefAck: !!v.nonrefAck,
  };
}

const ARRIVALS = ['12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00', '22:00', '23:00', '00:00'];

export default function BookingFlow({ lang, code }: { lang: Lang; code: string }) {
  const t = pick(booking, lang);
  const router = useRouter();
  const { me } = useMe();
  const member = me?.kind === 'member' ? (me as MeMember) : null;
  const [token, setTok] = useState<string | null>(null);
  const [view, setView] = useState<BookingView | null>(null);
  const [loadErr, setLoadErr] = useState('');
  const [form, setForm] = useState<Form | null>(null);
  const [step, setStep] = useState<3 | 4>(3);
  const [busy, setBusy] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [err, setErr] = useState('');
  const [codeErr, setCodeErr] = useState('');
  const [expired, setExpired] = useState(false);
  const [left, setLeft] = useState<number | null>(null);
  const [groups, setGroups] = useState<NightGroup[]>([]);
  const offset = useRef(0);
  const topRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async (tok: string | null) => {
    try {
      const [v, clock] = await Promise.all([
        api<BookingView>(`/api/bookings/${encodeURIComponent(code)}`, { token: tok }),
        api<{ now: string }>('/api/clock'),
      ]);
      offset.current = Date.parse(clock.now) - Date.now();
      if (v.status === 'CONFIRMED') { router.replace(`/${lang}/book/${code}/done`); return; }
      if (v.status !== 'HELD') setExpired(true);
      setView(v);
      setForm((f) => f ?? formFrom(v, null));
      loadNightGroups(v, lang).then(setGroups).catch(() => setGroups([]));
    } catch (e) {
      setLoadErr(e instanceof ApiError && e.status === 404 ? t.noToken : msgOf(e, lang));
    }
  }, [code, lang, router, t.noToken]);

  useEffect(() => {
    const tok = getToken(code);
    setTok(tok);
    load(tok);
  }, [code, load]);

  // Member chosen in the header mid-booking → server re-prices (US-22 ข้อ 3); prefill contact.
  useEffect(() => {
    const again = () => load(token);
    window.addEventListener('sj-user-changed', again);
    return () => window.removeEventListener('sj-user-changed', again);
  }, [load, token]);
  useEffect(() => {
    if (member && form && !form.email) setForm({ ...form, name: form.name || member.user.displayName, email: member.user.email, phone: form.phone || member.user.phone });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.user.id]);

  // 15-minute countdown from holdExpiresAt using the server (demo) clock.
  useEffect(() => {
    if (!view?.holdExpiresAt || expired) return;
    const end = Date.parse(view.holdExpiresAt);
    const tick = () => {
      const ms = end - (Date.now() + offset.current);
      setLeft(Math.max(0, ms));
      if (ms <= 0) setExpired(true);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, [view?.holdExpiresAt, expired]);

  async function patch(body: Record<string, unknown>, quiet = false): Promise<BookingView | null> {
    setBusy(true);
    if (!quiet) setSaveMsg(t.saving);
    try {
      const v = await api<BookingView>(`/api/bookings/${encodeURIComponent(code)}`, { method: 'PATCH', body: { ...body, lang }, token });
      setView(v);
      setErr('');
      if ('code' in body) setCodeErr(msgText(v.codeError, lang));
      setSaveMsg(t.saved);
      return v;
    } catch (e) {
      if (e instanceof ApiError && (e.status === 410 || e.code === 'HOLD_EXPIRED')) setExpired(true);
      if ('code' in body && Object.keys(body).length === 1) setCodeErr(msgOf(e, lang));
      else setErr(msgOf(e, lang));
      setSaveMsg('');
      return null;
    } finally {
      setBusy(false);
    }
  }

  const addonsOf = (f: Form) => [
    ...(f.transfer && f.flightNo.trim() && f.flightTime ? [{ kind: 'TRANSFER' as AddonKind, flightNo: f.flightNo.trim(), arriveTime: f.flightTime }] : []),
    ...(f.early ? [{ kind: 'EARLY_IN' as AddonKind }] : []),
    ...(f.late ? [{ kind: 'LATE_OUT' as AddonKind }] : []),
  ];

  function set<K extends keyof Form>(k: K, v: Form[K]) { setForm((f) => (f ? { ...f, [k]: v } : f)); }
  function setAddon(next: Partial<Form>) {
    if (!form) return;
    const f = { ...form, ...next };
    setForm(f);
    patch({ addons: addonsOf(f) });
  }

  function clientCheck(f: Form): string {
    if (!f.name.trim() || !f.email.trim() || !f.phone.trim()) return t.contactRequired;
    if (f.transfer && (!f.flightNo.trim() || !f.flightTime)) return t.flightNeeded;
    if (f.taxOn && !/^\d{13}$/.test(f.taxId.trim())) return t.taxIdBad;
    if (view?.plan === 'HONEYMOON' && !f.dinnerNight) return t.dinnerRequired;
    if (view?.nonref && !f.nonrefAck) return t.nonrefAckRequired;
    return '';
  }

  async function toPayment(e: React.FormEvent) {
    e.preventDefault();
    if (!form || !view) return;
    const c = clientCheck(form);
    if (c) { setErr(c); return; }
    const v = await patch({
      contact: { name: form.name, email: form.email, phone: form.phone },
      rooms: form.rooms.map((r) => ({ specialRequest: r.specialRequest, bedPref: r.bedPref || null, highFloor: r.highFloor })),
      arrivalTime: form.arrivalTime || null,
      marketingConsent: form.marketingConsent,
      nonrefAck: form.nonrefAck,
      taxInvoice: form.taxOn ? { company: form.company, address: form.address, taxId: form.taxId.trim(), branch: form.branch } : null,
      dinnerNight: view.plan === 'HONEYMOON' ? form.dinnerNight || null : undefined,
      addons: addonsOf(form),
    });
    if (v) { setStep(4); setTimeout(() => topRef.current?.scrollIntoView({ behavior: 'smooth' }), 30); }
  }

  if (loadErr) {
    return (
      <div className={`container ${s.page} ${s.narrow}`} data-testid="flow-error">
        <Alert testId="msg-load-error">{loadErr}</Alert>
        <p style={{ marginTop: 16 }}><Link href={`/${lang}/book`} className="btn btn-primary" data-testid="restart">{t.restart}</Link></p>
      </div>
    );
  }
  if (!view || !form) return <div className={`container ${s.page} ${s.narrow}`}><p className="muted">…</p></div>;

  if (expired) {
    return (
      <div className={`container ${s.page} ${s.narrow}`} data-testid="hold-expired">
        <Steps lang={lang} current={step} />
        <Alert testId="msg-hold-expired"><strong>{t.holdExpired}</strong></Alert>
        <p style={{ marginTop: 16 }}>
          <Link href={`/${lang}/book?checkIn=${view.checkIn}&checkOut=${view.checkOut}&adults=${view.rooms[0]?.adults ?? 2}${view.rooms[0]?.childAges.length ? `&children=${view.rooms[0].childAges.join(',')}` : ''}`} className="btn btn-primary" data-testid="restart">{t.restart}</Link>
        </p>
      </div>
    );
  }

  const mm = left !== null ? Math.floor(left / 60000) : 15;
  const ss = left !== null ? Math.floor((left % 60000) / 1000) : 0;
  const nights = stayNights(view.checkIn, view.checkOut);
  const guestsText = view.rooms.map((r) => `${nameOf(r, lang)} · ${fill(t.guestsSummary, { a: r.adults, c: r.childAges.length ? fill(t.guestsChildren, { c: r.childAges.length }) : '' })}`).join(' / ');
  const canRedeem = member && member.user.verified && member.points >= 100;
  const maxRedeem = member ? Math.floor(member.points / 100) * 100 : 0;
  const tr = view.addons.find((a) => a.kind === 'TRANSFER' || a.kind === 'VAN');

  return (
    <div className={`container ${s.page} ${s.narrow}`} ref={topRef} data-testid="booking-flow">
      <div className={`${s.countdown} ${left !== null && left < 120000 ? s.low : ''}`} role="timer" aria-live="off" data-testid="hold-countdown">
        ⏱ {t.holdLeft} <strong data-testid="hold-countdown-time">{String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}</strong>
      </div>
      <div style={{ height: 14 }} />
      <Steps lang={lang} current={step} />

      <section className={`card ${s.section}`} data-testid="stay-summary">
        <div className="row" style={{ justifyContent: 'space-between' }}>
          <strong data-testid="stay-dates">{fmtDate(view.checkIn, lang)} – {fmtDate(view.checkOut, lang)} · {fill(t.nightsN, { n: view.nights })}</strong>
          <span className="badge" data-testid="booking-code">{view.code}</span>
        </div>
        <div className="small" data-testid="stay-rooms">{guestsText}</div>
        <div className="row small">
          <span className="badge badge-gold" data-testid="plan-label">{msgText(view.planLabel, lang)}</span>
          {view.nonref
            ? <span className="badge badge-bad">{t.nonref}</span>
            : view.freeCancelUntil && <span className="badge badge-ok" data-testid="free-cancel">{fill(t.freeCancelUntil, { d: fmtDateTime(view.freeCancelUntil, lang) })}</span>}
          {view.promotions.map((p) => <span key={p.code} className="badge" data-testid={`applied-promo-${p.code}`}>{lang === 'en' ? p.nameEn : p.nameTh} −{baht(p.saved)}</span>)}
        </div>
        {view.plan === 'GREEN' && <Alert kind="info" testId="green-note">{t.greenNote}</Alert>}
        {view.nonref && <div className={s.warnBox} data-testid="nonref-warning"><strong>⚠ {t.nonrefWarn}</strong></div>}
      </section>

      {step === 3 && (
        <form className={s.flow} onSubmit={toPayment} noValidate data-testid="details-form" style={{ marginTop: 18 }}>
          <section className={`card ${s.section}`}>
            <h2>{t.contactTitle}</h2>
            {member && <p className="small muted" style={{ margin: 0 }} data-testid="prefilled-note">{t.prefilled}</p>}
            <div className="field"><label htmlFor="c-name">{t.name}</label>
              <input id="c-name" className="input" autoComplete="name" value={form.name} onChange={(e) => set('name', e.target.value)} required data-testid="input-name" /></div>
            <div className={s.two}>
              <div className="field"><label htmlFor="c-email">{t.email}</label>
                <input id="c-email" className="input" type="email" autoComplete="email" inputMode="email" value={form.email} onChange={(e) => set('email', e.target.value)} required data-testid="input-email" /></div>
              <div className="field"><label htmlFor="c-phone">{t.phone}</label>
                <input id="c-phone" className="input" type="tel" autoComplete="tel" inputMode="tel" value={form.phone} onChange={(e) => set('phone', e.target.value)} required data-testid="input-phone" /></div>
            </div>
            <p className="small muted" style={{ margin: 0 }} data-testid="privacy-note">
              {t.privacyNote} · <Link href={`/${lang}/privacy`} target="_blank" data-testid="link-privacy-book">{t.privacyLink}</Link>
            </p>
          </section>

          <section className={`card ${s.section}`}>
            <h2>{t.requestsTitle}</h2>
            <Alert kind="info" testId="requests-note">{t.requestsNote}</Alert>
            {form.rooms.map((r, i) => (
              <div key={i} className="stack" data-testid={`requests-room-${i + 1}`}>
                {form.rooms.length > 1 && <strong>{fill(t.roomN, { n: i + 1 })} · {nameOf(view.rooms[i], lang)}</strong>}
                <div className={s.two}>
                  <div className="field"><label htmlFor={`bed-${i}`}>{t.bedPref}</label>
                    <select id={`bed-${i}`} className="input" value={r.bedPref} data-testid={`bed-pref-${i + 1}`}
                      onChange={(e) => set('rooms', form.rooms.map((x, j) => (j === i ? { ...x, bedPref: e.target.value as Form['rooms'][number]['bedPref'] } : x)))}>
                      <option value="">{t.bedAny}</option>
                      <option value="KING">{t.bedKing}</option>
                      <option value="TWIN">{t.bedTwin}</option>
                    </select></div>
                  <label className="check" style={{ alignSelf: 'end', minHeight: 44, alignItems: 'center' }}>
                    <input type="checkbox" checked={r.highFloor} data-testid={`high-floor-${i + 1}`}
                      onChange={(e) => set('rooms', form.rooms.map((x, j) => (j === i ? { ...x, highFloor: e.target.checked } : x)))} />
                    <span>{t.highFloor}</span>
                  </label>
                </div>
                <div className="field"><label htmlFor={`req-${i}`}>{t.requestText}</label>
                  <textarea id={`req-${i}`} className="input" rows={3} maxLength={500} value={r.specialRequest} data-testid={`special-request-${i + 1}`}
                    onChange={(e) => set('rooms', form.rooms.map((x, j) => (j === i ? { ...x, specialRequest: e.target.value.slice(0, 500) } : x)))} />
                  <div className={s.counterText} data-testid={`special-request-count-${i + 1}`}>{fill(t.chars, { n: r.specialRequest.length })}</div>
                </div>
              </div>
            ))}
            <div className="field"><label htmlFor="arrival">{t.arrivalTime}</label>
              <select id="arrival" className="input" value={form.arrivalTime} onChange={(e) => set('arrivalTime', e.target.value)} data-testid="arrival-time">
                <option value="">{t.arrivalAny}</option>
                {ARRIVALS.map((a) => <option key={a} value={a}>{a}</option>)}
              </select></div>
          </section>

          {view.plan === 'HONEYMOON' && (
            <section className={`card ${s.section}`}>
              <h2>{t.dinnerTitle}</h2>
              <div className="field"><label htmlFor="dinner">{t.dinnerPick}</label>
                <select id="dinner" className="input" value={form.dinnerNight} data-testid="dinner-night"
                  onChange={(e) => { set('dinnerNight', e.target.value); if (e.target.value) patch({ dinnerNight: e.target.value }); }}>
                  <option value="">—</option>
                  {nights.map((n) => <option key={n} value={n}>{fmtDate(n, lang)}</option>)}
                </select></div>
            </section>
          )}

          <section className={`card ${s.section}`}>
            <h2>{t.addonsTitle}</h2>
            <label className="check"><input type="checkbox" checked={form.transfer} onChange={(e) => setAddon({ transfer: e.target.checked })} data-testid="addon-transfer" />
              <span>{t.addonTransfer}{tr && <> · <strong data-testid="addon-transfer-price">{baht(tr.price)}</strong></>}</span></label>
            {form.transfer && (
              <div className={s.two} style={{ paddingLeft: 30 }}>
                <div className="field"><label htmlFor="flight">{t.flightNo}</label>
                  <input id="flight" className="input" value={form.flightNo} placeholder="TG201" onChange={(e) => set('flightNo', e.target.value.toUpperCase())} onBlur={() => patch({ addons: addonsOf(form) }, true)} data-testid="input-flight-no" /></div>
                <div className="field"><label htmlFor="ftime">{t.flightTime}</label>
                  <input id="ftime" type="time" className="input" value={form.flightTime} onChange={(e) => setAddon({ flightTime: e.target.value })} data-testid="input-flight-time" /></div>
                {(!form.flightNo.trim() || !form.flightTime) && <p className={s.err} data-testid="msg-flight-needed">{t.flightNeeded}</p>}
              </div>
            )}
            <label className="check"><input type="checkbox" checked={form.early} onChange={(e) => setAddon({ early: e.target.checked })} data-testid="addon-early" />
              <span>{t.addonEarly} <span className="badge badge-warn">{t.pending}</span></span></label>
            <label className="check"><input type="checkbox" checked={form.late} onChange={(e) => setAddon({ late: e.target.checked })} data-testid="addon-late" />
              <span>{t.addonLate} <span className="badge badge-warn">{t.pending}</span></span></label>
            {(form.early || form.late) && <p className="small muted" style={{ margin: 0 }} data-testid="addon-pending-note">{t.pendingNote}</p>}
          </section>

          <section className={`card ${s.section}`}>
            <h2>{t.promoTitle}</h2>
            <div className="row" style={{ flexWrap: 'nowrap' }}>
              <input className="input" aria-label={t.promoTitle} placeholder={t.promoPh} value={form.code} onChange={(e) => set('code', e.target.value.toUpperCase())} data-testid="input-promo-code" />
              {view.promoCode
                ? <button type="button" className="btn btn-ghost" disabled={busy} onClick={() => { set('code', ''); patch({ code: null }); setCodeErr(''); }} data-testid="promo-remove">{t.remove}</button>
                : <button type="button" className="btn btn-primary" disabled={busy || !form.code.trim()} onClick={() => patch({ code: form.code.trim() })} data-testid="promo-apply">{t.apply}</button>}
            </div>
            {codeErr && <p className={s.err} role="alert" data-testid="msg-promo-error">{codeErr}</p>}
            {view.promoCode && <p className="small" style={{ color: 'var(--ok)', margin: 0 }} data-testid="msg-promo-applied">✓ {fill(t.promoApplied, { c: view.promoCode })}</p>}

            {member && (
              <div className="stack" data-testid="points-box">
                <strong>{t.pointsTitle}</strong>
                {!member.user.verified ? <p className="small muted" style={{ margin: 0 }}>{t.pointsUnverified}</p> : (
                  <>
                    <p className="small muted" style={{ margin: 0 }} data-testid="points-have">{fill(t.pointsHave, { n: member.points })}</p>
                    <select className="input" aria-label={t.pointsTitle} disabled={!canRedeem || busy} value={form.redeemPoints} data-testid="redeem-points"
                      onChange={(e) => { const n = Number(e.target.value); set('redeemPoints', n); patch({ redeemPoints: n }); }}>
                      <option value={0}>{t.pointsNone}</option>
                      {Array.from({ length: maxRedeem / 100 }, (_, i) => (i + 1) * 100).map((n) => <option key={n} value={n}>{fill(t.pointsSet, { n })}</option>)}
                    </select>
                  </>
                )}
              </div>
            )}
          </section>

          <section className={`card ${s.section}`}>
            <label className="check"><input type="checkbox" checked={form.taxOn} onChange={(e) => set('taxOn', e.target.checked)} data-testid="tax-toggle" /><span><strong>{t.taxTitle}</strong></span></label>
            {form.taxOn && (
              <div className="stack" data-testid="tax-form">
                <div className="field"><label htmlFor="tx-co">{t.company}</label>
                  <input id="tx-co" className="input" value={form.company} onChange={(e) => set('company', e.target.value)} data-testid="input-tax-company" /></div>
                <div className="field"><label htmlFor="tx-ad">{t.address}</label>
                  <textarea id="tx-ad" className="input" rows={2} value={form.address} onChange={(e) => set('address', e.target.value)} data-testid="input-tax-address" /></div>
                <div className={s.two}>
                  <div className="field"><label htmlFor="tx-id">{t.taxId}</label>
                    <input id="tx-id" className="input" inputMode="numeric" maxLength={13} value={form.taxId} onChange={(e) => set('taxId', e.target.value.replace(/\D/g, '').slice(0, 13))} aria-invalid={!!form.taxId && form.taxId.length !== 13} data-testid="input-tax-id" />
                    {form.taxId && form.taxId.length !== 13 && <p className={s.err} data-testid="msg-tax-id">{t.taxIdBad} ({form.taxId.length}/13)</p>}</div>
                  <div className="field"><label htmlFor="tx-br">{t.branch}</label>
                    <input id="tx-br" className="input" placeholder={t.branchPh} value={form.branch} onChange={(e) => set('branch', e.target.value)} data-testid="input-tax-branch" /></div>
                </div>
                <p className="small muted" style={{ margin: 0 }}>{t.taxLater}</p>
              </div>
            )}
          </section>

          <section className={`card ${s.section}`}>
            {view.nonref && (
              <label className="check" data-testid="nonref-ack-label">
                <input type="checkbox" checked={form.nonrefAck} required onChange={(e) => { set('nonrefAck', e.target.checked); patch({ nonrefAck: e.target.checked }, true); }} data-testid="nonref-ack" />
                <span><strong>{t.nonrefAck}</strong> — {t.nonrefWarn}</span>
              </label>
            )}
            <label className="check">
              <input type="checkbox" checked={form.marketingConsent} onChange={(e) => set('marketingConsent', e.target.checked)} data-testid="marketing-consent" />
              <span>{t.consent}</span>
            </label>
            {err && <Alert testId="msg-details-error">{err}</Alert>}
            <button type="submit" className="btn btn-primary" disabled={busy} data-testid="to-payment">{busy ? t.saving : t.toPayment} →</button>
            {saveMsg && <span className="small muted" aria-live="polite" data-testid="save-status">{saveMsg}</span>}
          </section>
        </form>
      )}

      {step === 4 && (
        <div className={s.flow} style={{ marginTop: 18 }}>
          <button type="button" className="btn btn-ghost" style={{ justifySelf: 'start' }} onClick={() => setStep(3)} data-testid="back-to-details">{t.editDetails}</button>
          <PaymentForm lang={lang} view={view} token={token}
            onExpired={() => setExpired(true)}
            onPaid={() => router.push(`/${lang}/book/${code}/done`)} />
        </div>
      )}

      <PriceSummaryBar lang={lang} total={view.total} lines={view.lines} nightGroups={groups}
        deposit={view.deposit} depositLabel={view.nonref ? t.dueNowFull : `${t.dueNow} · ${t.dueNowDeposit}`}
        dueAtHotel={view.dueAtHotel} pointsToEarn={view.pointsToEarn}
        action={<span className={`${s.barTimer} ${left !== null && left < 120000 ? s.low : ''}`} role="timer" aria-label={t.holdLeft} data-testid="bar-countdown">⏱ {String(mm).padStart(2, '0')}:{String(ss).padStart(2, '0')}</span>} />
    </div>
  );
}
