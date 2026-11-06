'use client';
import { useState } from 'react';
import { pick, type Lang } from '@/i18n';
import { booking, fill } from '@/i18n/booking';
import { api, ApiError, msgOf } from '@/lib/client/api';
import { baht } from '@/lib/format';
import { Alert } from './common';
import type { BookingView } from './shared';
import s from './booking.module.css';

/** Step 4 (US-34): card or PromptPay through the fake gateway. */
export default function PaymentForm({ lang, view, token, onPaid, onExpired }: {
  lang: Lang; view: BookingView; token: string | null; onPaid: () => void; onExpired: () => void;
}) {
  const t = pick(booking, lang);
  const [method, setMethod] = useState<'CARD' | 'PROMPTPAY'>('CARD');
  const [card, setCard] = useState({ number: '', expiry: '', cvc: '', holder: view.contact.name });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState('');
  const digits = card.number.replace(/\D/g, '');

  async function pay(body: Record<string, unknown>) {
    if (busy) return;
    setBusy(true);
    setErr('');
    try {
      await api(`/api/bookings/${encodeURIComponent(view.code)}/pay`, { body, token });
      onPaid();
    } catch (e) {
      if (e instanceof ApiError && (e.status === 410 || e.code === 'HOLD_EXPIRED')) { onExpired(); return; }
      setErr(msgOf(e, lang));
      setBusy(false);
    }
  }

  function submitCard(e: React.FormEvent) {
    e.preventDefault();
    if (digits.length < 12 || !/^\d{2}\s*\/\s*\d{2}$/.test(card.expiry) || !/^\d{3,4}$/.test(card.cvc)) { setErr(t.cardIncomplete); return; }
    pay({ method: 'CARD', cardNumber: digits });
  }

  return (
    <section className={`card ${s.section}`} data-testid="payment">
      <h2>{t.payTitle}</h2>
      <div className={s.amounts} data-testid="pay-amounts">
        <div><span>{t.total}</span><strong data-testid="pay-total">{baht(view.total)}</strong></div>
        <div className={s.big}><span>{t.dueNow} · {view.nonref ? t.dueNowFull : t.dueNowDeposit}</span><strong data-testid="pay-due-now">{baht(view.deposit)}</strong></div>
        {view.dueAtHotel > 0 && <div><span>{t.payAtHotel}</span><strong data-testid="pay-at-hotel">{baht(view.dueAtHotel)}</strong></div>}
      </div>

      <div className={s.payTabs} role="tablist">
        <button type="button" role="tab" aria-selected={method === 'CARD'} className={`${s.payTab} ${method === 'CARD' ? s.on : ''}`} onClick={() => { setMethod('CARD'); setErr(''); }} data-testid="method-card">💳 {t.card}</button>
        <button type="button" role="tab" aria-selected={method === 'PROMPTPAY'} className={`${s.payTab} ${method === 'PROMPTPAY' ? s.on : ''}`} onClick={() => { setMethod('PROMPTPAY'); setErr(''); }} data-testid="method-promptpay">{t.promptpay}</button>
      </div>

      {method === 'CARD' ? (
        <form className="stack" onSubmit={submitCard} noValidate data-testid="card-form">
          <Alert kind="info" testId="test-cards">{t.testCards}</Alert>
          <div className="field"><label htmlFor="cc-num">{t.cardNumber}</label>
            <input id="cc-num" className="input" inputMode="numeric" autoComplete="cc-number" placeholder="4242 4242 4242 4242" value={card.number}
              onChange={(e) => setCard({ ...card, number: e.target.value.replace(/\D/g, '').slice(0, 16).replace(/(\d{4})(?=\d)/g, '$1 ') })} data-testid="input-card-number" /></div>
          <div className={s.two}>
            <div className="field"><label htmlFor="cc-exp">{t.expiry}</label>
              <input id="cc-exp" className="input" inputMode="numeric" autoComplete="cc-exp" placeholder="12/29" value={card.expiry}
                onChange={(e) => { const d = e.target.value.replace(/\D/g, '').slice(0, 4); setCard({ ...card, expiry: d.length > 2 ? `${d.slice(0, 2)}/${d.slice(2)}` : d }); }} data-testid="input-card-expiry" /></div>
            <div className="field"><label htmlFor="cc-cvc">{t.cvc}</label>
              <input id="cc-cvc" className="input" inputMode="numeric" autoComplete="cc-csc" placeholder="123" value={card.cvc}
                onChange={(e) => setCard({ ...card, cvc: e.target.value.replace(/\D/g, '').slice(0, 4) })} data-testid="input-card-cvc" /></div>
          </div>
          <div className="field"><label htmlFor="cc-name">{t.cardHolder}</label>
            <input id="cc-name" className="input" autoComplete="cc-name" value={card.holder} onChange={(e) => setCard({ ...card, holder: e.target.value })} data-testid="input-card-holder" /></div>
          <p className="small muted" style={{ margin: 0 }}>🔒 {t.cardSecure}</p>
          {err && <Alert testId="msg-pay-error">{err}</Alert>}
          <button type="submit" className="btn btn-gold" disabled={busy} data-testid="pay-submit">{busy ? t.paying : fill(t.payBtn, { x: baht(view.deposit) })}</button>
        </form>
      ) : (
        <div className="stack" data-testid="promptpay">
          <p className="center" style={{ margin: 0 }}>{t.ppScan}</p>
          <div>
            <div className={s.ppHead}>PromptPay</div>
            <FakeQr seed={`${view.code}:${view.deposit}`} />
          </div>
          <p className="center" style={{ margin: 0 }}><strong style={{ fontSize: 22 }} data-testid="pp-amount">{baht(view.deposit)}</strong></p>
          <p className="small muted center" style={{ margin: 0 }}>{t.ppDemo}</p>
          {err && <Alert testId="msg-pay-error">{err}</Alert>}
          <button type="button" className="btn btn-gold" disabled={busy} onClick={() => pay({ method: 'PROMPTPAY', confirmed: true })} data-testid="pp-paid">{busy ? t.paying : t.ppPaid}</button>
        </div>
      )}
    </section>
  );
}

/** Deterministic QR-looking SVG (not scannable). */
function FakeQr({ seed }: { seed: string }) {
  const n = 25;
  let h = 2166136261;
  for (const ch of seed) h = Math.imul(h ^ ch.charCodeAt(0), 16777619);
  const rnd = () => { h ^= h << 13; h ^= h >>> 17; h ^= h << 5; return (h >>> 0) / 4294967296; };
  const finder = (x: number, y: number) => {
    for (const [fx, fy] of [[0, 0], [n - 7, 0], [0, n - 7]]) {
      const dx = x - fx, dy = y - fy;
      if (dx >= 0 && dx < 7 && dy >= 0 && dy < 7) return dx === 0 || dx === 6 || dy === 0 || dy === 6 || (dx >= 2 && dx <= 4 && dy >= 2 && dy <= 4) ? 1 : 0;
      if (dx >= -1 && dx <= 7 && dy >= -1 && dy <= 7) return 0;
    }
    return -1;
  };
  const cells: React.ReactNode[] = [];
  for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) {
    const f = finder(x, y);
    if (f === 1 || (f === -1 && rnd() > 0.52)) cells.push(<rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />);
  }
  return (
    <svg viewBox={`0 0 ${n} ${n}`} className={s.qr} role="img" aria-label="PromptPay QR (demo)" data-testid="pp-qr" shapeRendering="crispEdges">
      <g fill="#111">{cells}</g>
    </svg>
  );
}
