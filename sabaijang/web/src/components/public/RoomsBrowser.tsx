'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import type { Lang } from '@/i18n';

import { amenityLabel, fill, tf, tp } from '@/i18n/public';
import { Money } from './Currency';
import Reveal from './Reveal';
import RoomCard, { type CardRoom } from './RoomCard';
import s from './public.module.css';

/** Room list with compare (US-10): up to 3 room types side by side. */
export default function RoomsBrowser({ rooms, lang }: { rooms: CardRoom[]; lang: Lang }) {
  const t = tp(lang);
  const [picked, setPicked] = useState<string[]>([]);
  const [limitMsg, setLimitMsg] = useState(false);
  const [show, setShow] = useState(false);
  const tableRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!limitMsg) return;
    const id = window.setTimeout(() => setLimitMsg(false), 5000);
    return () => window.clearTimeout(id);
  }, [limitMsg]);

  function toggle(code: string) {
    if (picked.includes(code)) {
      setPicked(picked.filter((c) => c !== code));
      setLimitMsg(false);
      return;
    }
    if (picked.length >= 3) { setLimitMsg(true); return; }
    setPicked([...picked, code]);
  }

  const chosen = rooms.filter((r) => picked.includes(r.code));
  const showTable = show && chosen.length >= 2;

  function openCompare() {
    setShow(true);
    requestAnimationFrame(() => tableRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
  }

  const rows: { label: string; cell: (r: CardRoom) => ReactNode }[] = [
    { label: t.size, cell: (r) => `${r.sizeSqm} ${t.sqm}` },
    { label: t.bed, cell: (r) => tf(r, 'bed', lang) },
    { label: t.view, cell: (r) => tf(r, 'view', lang) },
    { label: t.maxGuests, cell: (r) => fill(t.adultsMax, { a: r.maxAdults, t: r.maxTotal }) },
    { label: t.extraBed, cell: (r) => (r.extraBedAllowed ? t.yes : t.no) },
    { label: t.LOW, cell: (r) => <Money thb={r.rates.LOW} /> },
    { label: t.HIGH, cell: (r) => <Money thb={r.rates.HIGH} /> },
    { label: t.PEAK, cell: (r) => <Money thb={r.rates.PEAK} /> },
    { label: t.amenities, cell: (r) => r.amenities.map((a) => amenityLabel(a, lang)).join(' · ') },
    { label: '360°', cell: (r) => (r.pano ? '✓' : '–') },
  ];

  return (
    <>
      <div className={s.roomGrid} data-testid="room-list">
        {rooms.map((r, i) => (
          <Reveal key={r.code} delay={(i % 3) * 90}>
            <RoomCard room={r} lang={lang} compare={{ on: picked.includes(r.code), toggle: () => toggle(r.code) }} />
          </Reveal>
        ))}
      </div>

      {(picked.length > 0 || limitMsg) && (
        <div className={s.tray} data-testid="compare-tray" aria-live="polite">
          <strong>{fill(t.compareSelected, { n: picked.length })}</strong>
          <div className={s.trayChips}>
            {chosen.map((r) => <span className={s.chip} key={r.code}>{tf(r, 'name', lang)}</span>)}
          </div>
          <button type="button" className={`btn btn-sm ${s.trayGhost}`} onClick={() => { setPicked([]); setShow(false); setLimitMsg(false); }} data-testid="compare-clear">{t.compareClear}</button>
          <button type="button" className="btn btn-gold btn-sm" onClick={openCompare} disabled={picked.length < 2} title={picked.length < 2 ? t.compareNeedTwo : undefined} data-testid="compare-open">{t.compareNow}</button>
          {limitMsg && <div className={s.trayMsg} role="alert" data-testid="compare-limit-msg">{t.compareLimit}</div>}
        </div>
      )}

      <div ref={tableRef} style={{ scrollMarginTop: 90 }}>
        {showTable && (
          <section style={{ marginTop: 40 }} data-testid="compare-table-section">
            <h2>{t.compareTitle}</h2>
            <div className="table-wrap">
              <table className={`table ${s.cmpTable}`} data-testid="compare-table">
                <thead>
                  <tr>
                    <th scope="col"><span className="sr-only">{t.compareTitle}</span></th>
                    {chosen.map((r) => (
                      <td key={r.code} data-testid={`compare-col-${r.code}`}>
                        <img className={s.cmpImg} src={r.photos[0]?.file} alt="" />
                        <Link href={`/${lang}/rooms/${r.code}`} style={{ fontFamily: 'var(--serif)', fontWeight: 700, fontSize: 17 }}>{tf(r, 'name', lang)}</Link>
                      </td>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((row) => (
                    <tr key={row.label}>
                      <th scope="row">{row.label}</th>
                      {chosen.map((r) => <td key={r.code}>{row.cell(r)}</td>)}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        )}
      </div>
    </>
  );
}
