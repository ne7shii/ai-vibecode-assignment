'use client';
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react';
import type { Lang } from '@/i18n';
import { tp } from '@/i18n/public';
import { api } from '@/lib/client/api';
import s from './public.module.css';

export type Cur = 'THB' | 'USD' | 'EUR' | 'CNY';
const CURS: Cur[] = ['THB', 'USD', 'EUR', 'CNY'];
const SYMBOL: Record<Cur, string> = { THB: '฿', USD: '$', EUR: '€', CNY: '¥' };
const KEY = 'sj-currency';

const Ctx = createContext<{ cur: Cur; rates: Partial<Record<Cur, number>>; setCur: (c: Cur) => void }>({ cur: 'THB', rates: {}, setCur: () => undefined });

/** US-46: display-only conversion with the fixed demo rates from GET /api/fx (THB per unit). Always charged in THB. */
export function CurrencyProvider({ children }: { children: ReactNode }) {
  const [cur, setCurState] = useState<Cur>('THB');
  const [rates, setRates] = useState<Partial<Record<Cur, number>>>({});
  useEffect(() => {
    try {
      const saved = localStorage.getItem(KEY) as Cur | null;
      if (saved && CURS.includes(saved)) setCurState(saved);
    } catch { /* storage blocked */ }
    api<{ rates: Partial<Record<Cur, number>> }>('/api/fx').then((r) => setRates(r.rates)).catch(() => setRates({}));
  }, []);
  const setCur = (c: Cur) => {
    setCurState(c);
    try { localStorage.setItem(KEY, c); } catch { /* ignore */ }
  };
  return <Ctx.Provider value={{ cur, rates, setCur }}>{children}</Ctx.Provider>;
}

export function approx(thb: number, cur: Cur, rates: Partial<Record<Cur, number>>) {
  const r = rates[cur];
  if (cur === 'THB' || !r) return null;
  const v = thb / r;
  return `≈ ${SYMBOL[cur]}${v.toLocaleString('en-US', { maximumFractionDigits: v >= 100 ? 0 : 2 })}`;
}

/** "฿2,400" plus "≈ $69" when another currency is selected. */
export function Money({ thb, className = '', testId }: { thb: number; className?: string; testId?: string }) {
  const { cur, rates } = useContext(Ctx);
  const a = approx(thb, cur, rates);
  return (
    <span className={className} data-testid={testId}>
      ฿{Math.round(thb).toLocaleString('en-US')}
      {a && <span className={s.fx} data-testid={testId ? `${testId}-fx` : 'fx-approx'}>{a} {cur}</span>}
    </span>
  );
}

export function CurrencySelect({ lang }: { lang: Lang }) {
  const t = tp(lang);
  const { cur, setCur, rates } = useContext(Ctx);
  return (
    <div className={s.fxBar} data-testid="currency-selector">
      <span>{t.currency}</span>
      <div className={s.fxSeg} role="group" aria-label={t.currency}>
        {CURS.map((c) => (
          <button key={c} type="button" aria-pressed={cur === c} onClick={() => setCur(c)} disabled={c !== 'THB' && !rates[c]} data-testid={`currency-${c}`}>{c}</button>
        ))}
      </div>
      <span data-testid="fx-note">{t.fxNote}</span>
    </div>
  );
}
