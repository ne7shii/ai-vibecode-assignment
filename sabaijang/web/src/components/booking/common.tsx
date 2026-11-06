'use client';
import { useCallback, useEffect, useState, type ReactNode } from 'react';
import { pick, type Lang } from '@/i18n';
import { booking, fill } from '@/i18n/booking';
import { api } from '@/lib/client/api';
import { baht, bahtExact } from '@/lib/format';
import { labelOf, seasonBadge, taxBreakdown, type Me, type NightLine, type PriceLine } from './shared';
import s from './booking.module.css';

/** Current demo actor; refreshes when the header switches user. */
export function useMe() {
  const [me, setMe] = useState<Me | undefined>(undefined);
  const load = useCallback(() => {
    api<Me>('/api/me').then(setMe).catch(() => setMe(null));
  }, []);
  useEffect(() => {
    load();
    window.addEventListener('sj-user-changed', load);
    return () => window.removeEventListener('sj-user-changed', load);
  }, [load]);
  return { me, reload: load };
}

export function Steps({ lang, current }: { lang: Lang; current: 1 | 2 | 3 | 4 }) {
  const t = pick(booking, lang);
  const names = [t.step1, t.step2, t.step3, t.step4];
  return (
    <ol className={s.steps} aria-label={fill(t.stepOf, { n: current })} data-testid="steps">
      {names.map((n, i) => (
        <li key={n} className={i + 1 === current ? s.on : i + 1 < current ? s.done : ''} aria-current={i + 1 === current ? 'step' : undefined} data-testid={`step-${i + 1}`}>
          <b>{i + 1}</b>{n}
        </li>
      ))}
    </ol>
  );
}

export interface NightGroup { title: string; nights: NightLine[] }

/** Sticky price summary at the bottom of every step (US-08 ข้อ 3, US-12 ข้อ 3, US-14 ข้อ 2). */
export function PriceSummaryBar(p: {
  lang: Lang;
  total: number | null;
  caption?: string;
  emptyText?: string;
  lines?: PriceLine[];
  nightGroups?: NightGroup[];
  deposit?: number | null;
  depositLabel?: string;
  dueAtHotel?: number | null;
  pointsToEarn?: number;
  action?: ReactNode;
}) {
  const t = pick(booking, p.lang);
  const [open, setOpen] = useState(false);
  const tax = p.total !== null ? taxBreakdown(p.total) : null;
  const lines = p.lines ?? [];
  const hasNightsLine = lines.some((l) => l.kind === 'NIGHTS');
  const nightRows = (p.nightGroups ?? []).flatMap((g, gi) => [
    ...(p.nightGroups!.length > 1 ? [<tr key={`g${gi}`} className={s.sub}><td colSpan={2}><strong>{g.title}</strong></td></tr>] : []),
    ...g.nights.map((n, i) => (
      <tr key={`n${gi}-${i}`} className={s.sub} data-testid="summary-night">
        <td>{n.label} {n.season && <span className={seasonBadge(n.season)}>{t[n.season]}</span>}</td>
        <td>{baht(n.price)}</td>
      </tr>
    )),
  ]);
  return (
    <aside className={s.bar} aria-label={t.total} data-testid="summary-bar">
      <div className={s.barInner}>
        {open && (
          <div className={s.barBody} id="summary-details" data-testid="summary-details">
            <table className={s.lines}>
              <tbody>
                {!hasNightsLine && nightRows.length > 0 && (
                  <tr className={s.head}><td colSpan={2}>{t.nightlyBreakdown}</td></tr>
                )}
                {!hasNightsLine && nightRows}
                {lines.map((l, i) => (
                  <PriceRow key={i} lang={p.lang} line={l}>
                    {l.kind === 'NIGHTS' && nightRows}
                  </PriceRow>
                ))}
                {p.total !== null && (
                  <tr className={s.sum}><td>{t.total}</td><td data-testid="summary-total-line">{baht(p.total)}</td></tr>
                )}
                {tax && (
                  <>
                    <tr className={s.head}><td colSpan={2}>{t.taxBreakdown}</td></tr>
                    <tr className={s.sub}><td>{t.baseRoom}</td><td data-testid="tax-base">{bahtExact(tax.base)}</td></tr>
                    <tr className={s.sub}><td>{t.serviceCharge}</td><td data-testid="tax-service">{bahtExact(tax.service)}</td></tr>
                    <tr className={s.sub}><td>{t.vat}</td><td data-testid="tax-vat">{bahtExact(tax.vat)}</td></tr>
                  </>
                )}
                {p.deposit != null && (
                  <tr className={s.head}><td>{p.depositLabel ?? t.dueNow}</td><td data-testid="summary-deposit">{baht(p.deposit)}</td></tr>
                )}
                {p.dueAtHotel != null && p.dueAtHotel > 0 && (
                  <tr className={s.sub}><td>{t.payAtHotel}</td><td data-testid="summary-due-hotel">{baht(p.dueAtHotel)}</td></tr>
                )}
                {!!p.pointsToEarn && (
                  <tr className={s.sub}><td colSpan={2} data-testid="summary-points">{fill(t.pointsEarn, { n: p.pointsToEarn })}</td></tr>
                )}
              </tbody>
            </table>
          </div>
        )}
        <div className={s.barRow}>
          <div className={s.barTotal}>
            {p.total !== null ? (
              <>
                <small>{p.caption ?? t.total}</small>
                <strong data-testid="summary-total">{baht(p.total)}</strong>
                <small>{t.totalIncl}</small>
              </>
            ) : (
              <small data-testid="summary-empty">{p.emptyText ?? t.chooseRoomHint}</small>
            )}
          </div>
          <div className="row" style={{ gap: 8, flexWrap: 'nowrap' }}>
            {p.total !== null && (
              <button type="button" className={s.barToggle} aria-expanded={open} aria-controls="summary-details" onClick={() => setOpen(!open)} data-testid="summary-toggle">
                {open ? t.hideDetails : t.details} {open ? '▾' : '▴'}
              </button>
            )}
            {p.action}
          </div>
        </div>
      </div>
    </aside>
  );
}

function PriceRow({ lang, line, children }: { lang: Lang; line: PriceLine; children?: ReactNode }) {
  return (
    <>
      <tr className={line.amount < 0 ? s.neg : ''} data-testid={`price-line-${line.kind}`}>
        <td>{labelOf(line, lang)}</td>
        <td>{line.amount < 0 ? `−${baht(-line.amount)}` : line.kind === 'ROUNDING' ? bahtExact(line.amount) : baht(line.amount)}</td>
      </tr>
      {children}
    </>
  );
}

/** Field error / alert helper. */
export function Alert({ kind = 'bad', children, testId }: { kind?: 'bad' | 'ok' | 'warn' | 'info'; children: ReactNode; testId?: string }) {
  if (!children) return null;
  return <div className={`alert alert-${kind}`} role={kind === 'bad' ? 'alert' : 'status'} data-testid={testId}>{children}</div>;
}
