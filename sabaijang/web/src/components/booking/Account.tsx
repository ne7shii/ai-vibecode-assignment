'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { pick, type Lang } from '@/i18n';
import { booking, fill } from '@/i18n/booking';
import { api, msgOf } from '@/lib/client/api';
import { baht, fmtDate, fmtDateTime } from '@/lib/format';
import { Alert, useMe } from './common';
import { nameOf, type MeMember } from './shared';
import s from './booking.module.css';

interface MyBooking {
  code: string; status: string; checkIn: string; checkOut: string; total: number; plan: string; canReview: boolean;
  rooms: { roomType: string; nameTh: string; nameEn: string; adults: number; childAges: number[] }[];
}
type Tab = 'upcoming' | 'past' | 'cancelled';

export default function Account({ lang }: { lang: Lang }) {
  const t = pick(booking, lang);
  const router = useRouter();
  const { me, reload } = useMe();
  const member = me?.kind === 'member' ? (me as MeMember) : null;

  const [profile, setProfile] = useState({ name: '', phone: '' });
  const [profMsg, setProfMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);
  const [points, setPoints] = useState<{ balance: number; ledger: { delta: number; reason: string; bookingCode: string | null; createdAt: string }[] } | null>(null);
  const [pointsErr, setPointsErr] = useState('');
  const [bookings, setBookings] = useState<Record<Tab, MyBooking[]> | null>(null);
  const [bkErr, setBkErr] = useState('');
  const [tab, setTab] = useState<Tab>('upcoming');
  const [reviewFor, setReviewFor] = useState<string | null>(null);
  const [reviewed, setReviewed] = useState<string[]>([]);
  const [delOpen, setDelOpen] = useState(false);
  const [delMsg, setDelMsg] = useState<{ kind: 'ok' | 'bad'; text: string } | null>(null);

  const loadAll = useCallback(() => {
    api<Record<Tab, MyBooking[]>>('/api/me/bookings').then((b) => { setBookings(b); setBkErr(''); }).catch((e) => setBkErr(msgOf(e, lang)));
    api<NonNullable<typeof points>>('/api/me/points').then((p) => { setPoints(p); setPointsErr(''); }).catch((e) => setPointsErr(msgOf(e, lang)));
  }, [lang]);

  useEffect(() => {
    if (!member) return;
    setProfile({ name: member.user.displayName, phone: member.user.phone ?? '' });
    loadAll();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [member?.user.id]);

  async function saveProfile(e: React.FormEvent) {
    e.preventDefault();
    try {
      await api('/api/me', { method: 'PATCH', body: { name: profile.name, phone: profile.phone } });
      setProfMsg({ kind: 'ok', text: t.profileSaved });
      reload();
      router.refresh();
    } catch (x) { setProfMsg({ kind: 'bad', text: msgOf(x, lang) }); }
  }
  async function toggleConsent(v: boolean) {
    try {
      await api('/api/me', { method: 'PATCH', body: { marketingConsent: v } });
      setProfMsg({ kind: 'ok', text: t.profileSaved });
      reload();
    } catch (x) { setProfMsg({ kind: 'bad', text: msgOf(x, lang) }); }
  }
  async function deleteAccount() {
    try {
      await api('/api/me', { method: 'DELETE', body: { confirm: true } });
      setDelMsg({ kind: 'ok', text: t.deleted });
      window.dispatchEvent(new CustomEvent('sj-user-changed', { detail: '' }));
      router.refresh();
    } catch (x) { setDelMsg({ kind: 'bad', text: msgOf(x, lang) }); }
  }

  if (me === undefined) return <div className={`container ${s.page}`}><p className="muted">…</p></div>;
  if (!member) {
    return (
      <div className={`container ${s.page}`} data-testid="account-page">
        <h1>{t.accountTitle}</h1>
        {delMsg && <Alert kind={delMsg.kind} testId="msg-account-deleted">{delMsg.text}</Alert>}
        <div style={{ marginTop: 12 }}><Alert kind="info" testId="msg-pick-user">{t.pickUser}</Alert></div>
        <p style={{ marginTop: 16 }}><Link href={`/${lang}/account/register`} className="btn btn-gold" data-testid="link-register">{t.registerCta}</Link></p>
      </div>
    );
  }

  const list = bookings?.[tab] ?? [];
  return (
    <div className={`container ${s.page}`} data-testid="account-page">
      <h1>{t.accountTitle}</h1>
      <div className="grid-2">
        <form className={`card ${s.section}`} onSubmit={saveProfile} data-testid="profile-form">
          <h2>{t.profile}</h2>
          <div className="row">
            {member.user.photo && <img src={member.user.photo} alt="" width={56} height={56} style={{ borderRadius: '50%', objectFit: 'cover', width: 56, height: 56 }} />}
            <div>
              <div data-testid="profile-email">{member.user.email}</div>
              {member.user.verified
                ? <span className="badge badge-ok" data-testid="badge-verified">{t.verifiedBadge}</span>
                : <span className="badge badge-warn" data-testid="badge-unverified">{t.unverified}</span>}
            </div>
          </div>
          <div className="field"><label htmlFor="p-name">{t.name}</label>
            <input id="p-name" className="input" value={profile.name} onChange={(e) => setProfile({ ...profile, name: e.target.value })} data-testid="profile-name" /></div>
          <div className="field"><label htmlFor="p-phone">{t.phone}</label>
            <input id="p-phone" className="input" type="tel" value={profile.phone} onChange={(e) => setProfile({ ...profile, phone: e.target.value })} data-testid="profile-phone" /></div>
          <label className="check"><input type="checkbox" checked={member.user.marketingConsent} onChange={(e) => toggleConsent(e.target.checked)} data-testid="profile-consent" /><span>{t.consentToggle}</span></label>
          {profMsg && <Alert kind={profMsg.kind} testId="msg-profile">{profMsg.text}</Alert>}
          <button type="submit" className="btn btn-primary" data-testid="profile-save">{t.saveProfile}</button>
        </form>

        <section className={`card ${s.section}`} data-testid="points-section">
          <h2>{t.pointsBalance}</h2>
          <div className={s.stat} data-testid="points-balance">{(points?.balance ?? member.points).toLocaleString('en-US')} <span className="small muted">{t.pointsUnit}</span></div>
          <strong>{t.ledger}</strong>
          {pointsErr && <Alert kind="warn" testId="msg-points-error">{pointsErr}</Alert>}
          {points && (points.ledger.length ? (
            <div className="table-wrap">
              <table className="table" data-testid="points-ledger">
                <thead><tr><th>{t.date}</th><th>{t.booking}</th><th className="num">{t.pointsCol}</th></tr></thead>
                <tbody>
                  {points.ledger.map((l, i) => (
                    <tr key={i}>
                      <td>{fmtDateTime(l.createdAt, lang).split(' ').slice(0, 3).join(' ')}<br /><span className="small muted">{(t as Record<string, string>)[`reason${l.reason}`] ?? l.reason}</span></td>
                      <td className="small">{l.bookingCode ?? '—'}</td>
                      <td className="num" style={{ color: l.delta < 0 ? 'var(--bad)' : 'var(--ok)' }}>{l.delta > 0 ? '+' : ''}{l.delta}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : <p className="muted small" data-testid="points-empty">{t.ledgerEmpty}</p>)}
        </section>
      </div>

      <section className={`card ${s.section}`} style={{ marginTop: 20 }} data-testid="my-bookings">
        <h2>{t.myBookings}</h2>
        <div className={s.tabs} role="tablist">
          {(['upcoming', 'past', 'cancelled'] as Tab[]).map((k) => (
            <button key={k} type="button" role="tab" aria-selected={tab === k} className={`${s.tab} ${tab === k ? s.on : ''}`} onClick={() => setTab(k)} data-testid={`tab-${k}`}>
              {k === 'upcoming' ? t.tabUpcoming : k === 'past' ? t.tabPast : t.tabCancelled}{bookings ? ` (${bookings[k].length})` : ''}
            </button>
          ))}
        </div>
        {bkErr && <Alert kind="warn" testId="msg-bookings-error">{bkErr}</Alert>}
        {bookings && !list.length && <p className="muted" data-testid="bookings-empty">{t.noBookings}</p>}
        <div className={s.bkList}>
          {list.map((b) => {
            const r0 = b.rooms[0];
            const again = r0 ? `/${lang}/book?adults=${r0.adults}${r0.childAges.length ? `&children=${r0.childAges.join(',')}` : ''}&room=${r0.roomType}` : `/${lang}/book`;
            return (
              <div key={b.code} className={s.bkItem} data-testid={`my-booking-${b.code}`}>
                <div className="row" style={{ justifyContent: 'space-between' }}>
                  <strong>{b.code}</strong>
                  <span className="badge">{(t as Record<string, string>)[`status${b.status}`] ?? b.status}</span>
                </div>
                <div className="small">{fmtDate(b.checkIn, lang)} – {fmtDate(b.checkOut, lang)} · {b.rooms.map((r) => nameOf(r, lang)).join(', ')} · {baht(b.total)}</div>
                <div className="row">
                  {tab === 'upcoming' && <Link href={`/${lang}/manage?code=${encodeURIComponent(b.code)}`} className="btn btn-ghost btn-sm" data-testid={`view-${b.code}`}>{t.view}</Link>}
                  <Link href={again} className="btn btn-primary btn-sm" data-testid={`book-again-${b.code}`}>{t.bookAgain}</Link>
                  {b.canReview && !reviewed.includes(b.code) && (
                    <button type="button" className="btn btn-gold btn-sm" onClick={() => setReviewFor(reviewFor === b.code ? null : b.code)} data-testid={`review-open-${b.code}`}>{t.writeReview}</button>
                  )}
                </div>
                {reviewFor === b.code && (
                  <ReviewForm lang={lang} code={b.code} onDone={() => { setReviewed([...reviewed, b.code]); setReviewFor(null); }} />
                )}
                {reviewed.includes(b.code) && <Alert kind="ok" testId={`msg-review-sent-${b.code}`}>{t.reviewSent}</Alert>}
              </div>
            );
          })}
        </div>
      </section>

      <section className={`card ${s.section} ${s.danger}`} style={{ marginTop: 20 }} data-testid="delete-section">
        <h2>{t.deleteTitle}</h2>
        <p className="small muted" style={{ margin: 0 }}>{t.deleteLead}</p>
        {delMsg && <Alert kind={delMsg.kind} testId="msg-delete">{delMsg.text}</Alert>}
        {!delOpen ? (
          <button type="button" className="btn btn-ghost" style={{ justifySelf: 'start', color: 'var(--bad)' }} onClick={() => setDelOpen(true)} data-testid="delete-open">{t.deleteBtn}</button>
        ) : (
          <div className="row">
            <button type="button" className="btn btn-danger" onClick={deleteAccount} data-testid="delete-confirm">{t.deleteConfirm}</button>
            <button type="button" className="btn btn-ghost" onClick={() => setDelOpen(false)} data-testid="delete-cancel">{t.deleteCancel}</button>
          </div>
        )}
      </section>
    </div>
  );
}

function ReviewForm({ lang, code, onDone }: { lang: Lang; code: string; onDone: () => void }) {
  const t = pick(booking, lang);
  const [sc, setSc] = useState({ room: 5, service: 5, clean: 5, location: 5 });
  const [body, setBody] = useState('');
  const [err, setErr] = useState('');
  const [busy, setBusy] = useState(false);
  const labels: Record<keyof typeof sc, string> = { room: t.scoreRoom, service: t.scoreService, clean: t.scoreClean, location: t.scoreLocation };
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      await api('/api/reviews', { body: { bookingCode: code, ...sc, body } });
      onDone();
    } catch (x) { setErr(msgOf(x, lang)); } finally { setBusy(false); }
  }
  return (
    <form className="stack" onSubmit={submit} data-testid={`review-form-${code}`}>
      <strong>{fill(t.reviewTitle, { c: code })}</strong>
      {(Object.keys(sc) as (keyof typeof sc)[]).map((k) => (
        <div key={k} className="row" style={{ justifyContent: 'space-between' }}>
          <span>{labels[k]}</span>
          <div className={s.stars} role="radiogroup" aria-label={labels[k]}>
            {[1, 2, 3, 4, 5].map((n) => (
              <button key={n} type="button" role="radio" aria-checked={sc[k] === n} aria-label={`${labels[k]} ${n}`} className={`${s.star} ${n <= sc[k] ? s.on : ''}`} onClick={() => setSc({ ...sc, [k]: n })} data-testid={`review-${k}-${n}`}>★</button>
            ))}
          </div>
        </div>
      ))}
      <div className="field"><label htmlFor={`rv-${code}`}>{t.reviewBody}</label>
        <textarea id={`rv-${code}`} className="input" rows={3} value={body} onChange={(e) => setBody(e.target.value)} data-testid="review-body" /></div>
      {err && <Alert testId="msg-review-error">{err}</Alert>}
      <button type="submit" className="btn btn-primary" disabled={busy} data-testid="review-submit">{t.sendReview}</button>
    </form>
  );
}
