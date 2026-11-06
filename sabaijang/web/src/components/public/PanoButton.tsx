'use client';
import { useEffect, useRef, useState } from 'react';
import type { Lang } from '@/i18n';
import { tp } from '@/i18n/public';
import PanoViewer from './PanoViewer';
import s from './public.module.css';

/** "View 360°" button + full-screen dialog. Only rendered for rooms that have a pano file (US-49 ข้อ 2). */
export default function PanoButton({ src, lang, name }: { src: string; lang: Lang; name: string }) {
  const t = tp(lang);
  const [open, setOpen] = useState(false);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => { window.removeEventListener('keydown', onKey); document.body.style.overflow = prev; };
  }, [open]);

  return (
    <>
      <button type="button" className="btn btn-primary" onClick={() => setOpen(true)} data-testid="pano-open">
        <span aria-hidden style={{ fontSize: 18 }}>⟲</span> {t.view360}
      </button>
      {open && (
        <div className={s.lb} role="dialog" aria-modal="true" aria-label={`${name} · ${t.pano360Title}`} data-testid="pano-dialog">
          <div className={s.lbTop}>
            <strong style={{ fontFamily: 'var(--serif)', fontSize: 18 }}>{name} · 360°</strong>
            <button ref={closeRef} type="button" className={s.lbBtn} onClick={() => setOpen(false)} data-testid="pano-close">✕ {t.close}</button>
          </div>
          <div style={{ padding: '0 12px', display: 'grid', alignContent: 'center' }}>
            <PanoViewer src={src} lang={lang} />
          </div>
          <div className={s.lbCaption}>{t.panoHint}</div>
        </div>
      )}
    </>
  );
}
