'use client';
import { useEffect, useState } from 'react';
import type { Lang } from '@/i18n';
import { tp } from '@/i18n/public';
import s from './public.module.css';

/**
 * Countdown to `endsAt` measured on the demo site clock: `serverNow` is the site's "now" at render
 * time, so the browser keeps the same offset and ticks forward from there.
 */
export default function Countdown({ endsAt, serverNow, lang }: { endsAt: string; serverNow: string; lang: Lang }) {
  const t = tp(lang);
  const [left, setLeft] = useState(() => Date.parse(endsAt) - Date.parse(serverNow));

  useEffect(() => {
    const offset = Date.parse(serverNow) - Date.now();
    const tick = () => setLeft(Date.parse(endsAt) - (Date.now() + offset));
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [endsAt, serverNow]);

  if (left <= 0) return <span data-testid="countdown-ended">{t.saleEnded}</span>;
  const sec = Math.floor(left / 1000);
  const parts: [number, string][] = [[Math.floor(sec / 86400), t.days], [Math.floor(sec / 3600) % 24, t.hrs], [Math.floor(sec / 60) % 60, t.mins], [sec % 60, t.secs]];
  return (
    <span className={s.count} data-testid="countdown" data-seconds-left={sec} role="timer" aria-live="off">
      {parts.map(([v, l]) => (
        <span className={s.countCell} key={l}><b>{String(v).padStart(2, '0')}</b><small>{l}</small></span>
      ))}
    </span>
  );
}
