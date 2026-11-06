'use client';
import { useState } from 'react';
import { pick, type Lang } from '@/i18n';
import { booking, fill } from '@/i18n/booking';
import { api, msgOf } from '@/lib/client/api';
import { Alert } from './common';
import s from './booking.module.css';

/** US-07 ข้อ 3: 6+ rooms → group quote request to sales. */
export default function GroupQuoteForm({ lang, checkIn, checkOut, onClose }: { lang: Lang; checkIn: string; checkOut: string; onClose: () => void }) {
  const t = pick(booking, lang);
  const [f, setF] = useState({ name: '', email: '', rooms: 6, checkIn, checkOut, note: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const [sent, setSent] = useState<number | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setErr('');
    try {
      const r = await api<{ id: number }>('/api/group-quote', { body: { ...f, checkIn: f.checkIn || undefined, checkOut: f.checkOut || undefined } });
      setSent(r.id);
    } catch (x) {
      setErr(msgOf(x, lang));
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className={`card ${s.section}`} style={{ marginTop: 16 }} data-testid="group-quote">
      <h2>{t.groupTitle}</h2>
      <p className="muted" style={{ margin: 0 }}>{t.groupLead}</p>
      {sent !== null ? (
        <Alert kind="ok" testId="group-sent">{fill(t.groupSent, { id: sent })}</Alert>
      ) : (
        <form onSubmit={submit} className="stack" noValidate>
          <div className={s.two}>
            <div className="field"><label htmlFor="gq-name">{t.groupName}</label>
              <input id="gq-name" className="input" value={f.name} onChange={(e) => setF({ ...f, name: e.target.value })} required data-testid="group-name" /></div>
            <div className="field"><label htmlFor="gq-email">{t.groupEmail}</label>
              <input id="gq-email" type="email" className="input" value={f.email} onChange={(e) => setF({ ...f, email: e.target.value })} required data-testid="group-email" /></div>
            <div className="field"><label htmlFor="gq-rooms">{t.groupRooms}</label>
              <input id="gq-rooms" type="number" min={6} className="input" value={f.rooms} onChange={(e) => setF({ ...f, rooms: Math.max(6, Number(e.target.value) || 6) })} data-testid="group-rooms" /></div>
            <div className="field"><label htmlFor="gq-in">{t.checkIn}</label>
              <input id="gq-in" type="date" className="input" value={f.checkIn} onChange={(e) => setF({ ...f, checkIn: e.target.value })} data-testid="group-checkin" /></div>
            <div className="field"><label htmlFor="gq-out">{t.checkOut}</label>
              <input id="gq-out" type="date" className="input" value={f.checkOut} onChange={(e) => setF({ ...f, checkOut: e.target.value })} data-testid="group-checkout" /></div>
          </div>
          <div className="field"><label htmlFor="gq-note">{t.groupNote}</label>
            <textarea id="gq-note" className="input" rows={3} value={f.note} onChange={(e) => setF({ ...f, note: e.target.value })} data-testid="group-note" /></div>
          {err && <Alert testId="group-error">{err}</Alert>}
          <div className="row">
            <button type="submit" className="btn btn-primary" disabled={busy} data-testid="group-submit">{t.groupSend}</button>
            <button type="button" className="btn btn-ghost" onClick={onClose} data-testid="group-close">{t.groupCancel}</button>
          </div>
        </form>
      )}
    </section>
  );
}
