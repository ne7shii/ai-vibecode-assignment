'use client';
import { pick, type Lang } from '@/i18n';
import { booking, fill } from '@/i18n/booking';
import { baht, fmtDate, fmtDateTime } from '@/lib/format';
import { labelOf, msgText, nameOf, type BookingView } from './shared';
import s from './booking.module.css';

/** Everything from the confirmation (US-35 ข้อ 2), used on the done page and in manage booking. */
export default function BookingDetails({ lang, view }: { lang: Lang; view: BookingView }) {
  const t = pick(booking, lang);
  const st = (t as Record<string, string>)[`status${view.status}`] ?? view.status;
  const statusCls = view.status === 'CONFIRMED' ? 'badge-ok' : view.status === 'CANCELLED' || view.status === 'EXPIRED' ? 'badge-bad' : 'badge-warn';
  return (
    <div className="stack" data-testid="booking-details">
      <dl className={s.dl}>
        <dt>{t.status}</dt><dd><span className={`badge ${statusCls}`} data-testid="booking-status">{st}</span></dd>
        <dt>{t.stay}</dt>
        <dd data-testid="detail-stay">{fmtDate(view.checkIn, lang)} – {fmtDate(view.checkOut, lang)} · {fill(t.nightsN, { n: view.nights })}<br /><span className="small muted">{t.checkInOut}</span></dd>
        <dt>{t.guests}</dt>
        <dd data-testid="detail-rooms">
          {view.rooms.map((r, i) => (
            <div key={r.id}>
              {view.rooms.length > 1 && `${fill(t.roomN, { n: i + 1 })}: `}<strong>{nameOf(r, lang)}</strong> · {fill(t.guestsSummary, { a: r.adults, c: r.childAges.length ? fill(t.guestsChildren, { c: r.childAges.length }) : '' })}
              {r.childAges.length > 0 && <span className="muted"> ({r.childAges.join(', ')})</span>}
              {r.extraBed && <span className="badge badge-warn" style={{ marginLeft: 6 }}>+ {lang === 'en' ? 'extra bed' : 'เตียงเสริม'}</span>}
            </div>
          ))}
        </dd>
        <dt>{t.plan}</dt><dd data-testid="detail-plan">{msgText(view.planLabel, lang)}</dd>
        {view.promotions.length > 0 && (<><dt>{t.promosUsed}</dt>
          <dd data-testid="detail-promos">{view.promotions.map((p) => `${lang === 'en' ? p.nameEn : p.nameTh} (−${baht(p.saved)})`).join(', ')}{view.promoCode && ` · ${view.promoCode}`}</dd></>)}
        {view.dinnerNight && (<><dt>{t.dinnerNight}</dt><dd data-testid="detail-dinner">{fmtDate(view.dinnerNight, lang)}</dd></>)}
        {view.addons.length > 0 && (<><dt>{t.addons}</dt>
          <dd data-testid="detail-addons">{view.addons.map((a) => (
            <div key={a.id}>{labelOf(a, lang)} {baht(a.price)} <span className="badge badge-warn">{(t as Record<string, string>)[`addonStatus${a.status}`] ?? a.status}</span>{a.flightNo && ` · ${a.flightNo} ${a.arriveTime ?? ''}`}</div>
          ))}</dd></>)}
        {view.rooms.some((r) => r.specialRequest || r.bedPref || r.highFloor) && (<><dt>{t.requests}</dt>
          <dd data-testid="detail-requests">{view.rooms.map((r, i) => (
            <div key={r.id}>{view.rooms.length > 1 && `${i + 1}: `}{[r.bedPref === 'KING' ? t.bedKing : r.bedPref === 'TWIN' ? t.bedTwin : '', r.highFloor ? t.highFloor : '', r.specialRequest].filter(Boolean).join(' · ')}</div>
          ))}</dd></>)}
        {view.arrivalTime && (<><dt>{t.arrival}</dt><dd>{view.arrivalTime}</dd></>)}
        {view.taxInvoice && (<><dt>{t.taxInvoice}</dt><dd data-testid="detail-tax">{view.taxInvoice.company} · {view.taxInvoice.taxId} · {view.taxInvoice.branch}</dd></>)}
        <dt>{t.total}</dt><dd><strong data-testid="detail-total">{baht(view.total)}</strong></dd>
        <dt>{t.paid}</dt><dd data-testid="detail-paid">{baht(view.paid)}{view.payments.filter((p) => p.status === 'SUCCESS' && p.direction === 'CHARGE').map((p) => ` · ${p.method === 'CARD' ? `•••• ${p.last4 ?? ''}` : 'PromptPay'}`).join('')}</dd>
        {view.refunded > 0 && (<><dt>{t.refunded}</dt><dd data-testid="detail-refunded">{baht(view.refunded)}</dd></>)}
        {view.status !== 'CANCELLED' && (<><dt>{t.payAtHotel}</dt><dd data-testid="detail-due-hotel">{baht(view.dueAtHotel)}</dd></>)}
        <dt>{t.freeCancel}</dt>
        <dd data-testid="detail-free-cancel">{view.nonref || !view.freeCancelUntil ? <span className="badge badge-bad">{t.noFreeCancel}</span> : <strong>{fmtDateTime(view.freeCancelUntil, lang)}</strong>}</dd>
        <dt>{t.contactTitle}</dt><dd data-testid="detail-contact">{view.contact.name} · {view.contact.email} · {view.contact.phone}</dd>
      </dl>
      {view.pointsToEarn > 0 && view.status === 'CONFIRMED' && <p className="small muted" style={{ margin: 0 }} data-testid="detail-points">{fill(t.pointsEarn, { n: view.pointsToEarn })}</p>}
    </div>
  );
}
