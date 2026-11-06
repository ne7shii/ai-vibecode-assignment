'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { pick, type Lang } from '@/i18n';
import { booking, fill } from '@/i18n/booking';
import { api, msgOf } from '@/lib/client/api';
import { Alert } from './common';
import s from './booking.module.css';

/** US-42: join without a password (demo); the API sets the demo cookie to the new member. */
export default function RegisterForm({ lang }: { lang: Lang }) {
  const t = pick(booking, lang);
  const router = useRouter();
  const [f, setF] = useState({ name: '', email: '', phone: '', birthDate: '', marketingConsent: false });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [done, setDone] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await api<{ userId: string }>('/api/members/register', {
        body: { name: f.name.trim(), email: f.email.trim(), phone: f.phone.trim() || undefined, birthDate: f.birthDate || undefined, lang, marketingConsent: f.marketingConsent },
      });
      setDone(true);
      window.dispatchEvent(new CustomEvent('sj-user-changed', { detail: r.userId }));
      router.refresh();
    } catch (x) {
      setErr(msgOf(x, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className={`container ${s.page}`} data-testid="register-page">
      <h1>{t.registerTitle}</h1>
      <p className={s.lead}>{t.registerLead}</p>
      {done ? (
        <div className="stack" style={{ maxWidth: 560 }}>
          <Alert kind="ok" testId="msg-registered">{fill(t.registered, { e: f.email })}</Alert>
          <div className="row">
            <Link href={`/${lang}/account`} className="btn btn-primary" data-testid="link-account">{t.goAccount}</Link>
            <Link href={`/${lang}/book`} className="btn btn-ghost" data-testid="link-book">{t.goBook}</Link>
          </div>
        </div>
      ) : (
        <form className={`card ${s.section}`} onSubmit={submit} style={{ maxWidth: 560 }} data-testid="register-form">
          <div className="field"><label htmlFor="r-name">{t.name}</label>
            <input id="r-name" className="input" autoComplete="name" required value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} data-testid="reg-name" /></div>
          <div className="field"><label htmlFor="r-email">{t.email}</label>
            <input id="r-email" className="input" type="email" autoComplete="email" required value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} data-testid="reg-email" /></div>
          <div className="field"><label htmlFor="r-phone">{t.phoneOpt}</label>
            <input id="r-phone" className="input" type="tel" autoComplete="tel" value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} data-testid="reg-phone" /></div>
          <div className="field"><label htmlFor="r-birth">{t.birthDate}</label>
            <input id="r-birth" className="input" type="date" value={f.birthDate} onChange={(e) => setF({ ...f, birthDate: e.target.value })} data-testid="reg-birthdate" /></div>
          <label className="check"><input type="checkbox" checked={f.marketingConsent} onChange={(e) => setF({ ...f, marketingConsent: e.target.checked })} data-testid="reg-consent" /><span>{t.consent}</span></label>
          <p className="small muted" style={{ margin: 0 }}>{t.privacyNote} · <Link href={`/${lang}/privacy`} data-testid="link-privacy-register">{t.privacyLink}</Link></p>
          {err && <Alert testId="msg-register-error">{err}</Alert>}
          <button type="submit" className="btn btn-gold" disabled={busy || !f.name.trim() || !f.email.trim()} data-testid="reg-submit">{t.registerBtn}</button>
        </form>
      )}
    </div>
  );
}
