'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import type { Lang } from '@/i18n';
import { tp } from '@/i18n/public';
import s from './public.module.css';

export interface Photo { file: string; captionTh: string; captionEn: string }

/** Room gallery (US-04 ข้อ 1): mosaic of ≥5 photos + full-screen lightbox with keyboard and swipe. */
export default function Gallery({ photos, lang, name }: { photos: Photo[]; lang: Lang; name: string }) {
  const t = tp(lang);
  const [open, setOpen] = useState<number | null>(null);
  const cap = (p: Photo) => (lang === 'en' ? p.captionEn : p.captionTh);

  return (
    <>
      <div className={s.gallery} data-testid="room-gallery">
        {photos.map((p, i) => (
          <button key={p.file} type="button" onClick={() => setOpen(i)} aria-label={`${name} · ${cap(p)} (${i + 1}/${photos.length})`} data-testid={`gallery-photo-${i}`}>
            <img src={p.file} alt={`${name} · ${cap(p)}`} loading={i === 0 ? 'eager' : 'lazy'} />
            {i === Math.min(photos.length, 5) - 1 && <span className={`${s.glass} ${s.galleryMore}`}>{t.viewAllPhotos} ({photos.length})</span>}
          </button>
        ))}
      </div>
      {open !== null && <Lightbox photos={photos} start={open} lang={lang} name={name} onClose={() => setOpen(null)} />}
    </>
  );
}

export function Lightbox({ photos, start, lang, name, onClose }: { photos: Photo[]; start: number; lang: Lang; name: string; onClose: () => void }) {
  const t = tp(lang);
  const [i, setI] = useState(start);
  const n = photos.length;
  const go = useCallback((d: number) => setI((x) => (x + d + n) % n), [n]);
  const touch = useRef<{ x: number; y: number } | null>(null);
  const closeRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const prevFocus = document.activeElement as HTMLElement | null;
    closeRef.current?.focus();
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'ArrowRight') go(1);
      else if (e.key === 'ArrowLeft') go(-1);
      else if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = prevOverflow;
      prevFocus?.focus?.();
    };
  }, [go, onClose]);

  const p = photos[i];
  const cap = lang === 'en' ? p.captionEn : p.captionTh;

  return (
    <div
      className={s.lb} role="dialog" aria-modal="true" aria-label={`${name} · ${t.photos}`} data-testid="lightbox"
      onTouchStart={(e) => { touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }}
      onTouchEnd={(e) => {
        const st = touch.current; touch.current = null;
        if (!st) return;
        const dx = e.changedTouches[0].clientX - st.x, dy = e.changedTouches[0].clientY - st.y;
        if (Math.abs(dx) > 40 && Math.abs(dx) > Math.abs(dy)) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className={s.lbTop}>
        <span data-testid="lightbox-counter">{i + 1} / {n}</span>
        <button ref={closeRef} type="button" className={s.lbBtn} onClick={onClose} data-testid="lightbox-close">✕ {t.close}</button>
      </div>
      <div className={s.lbStage} onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}>
        <img key={p.file} src={p.file} alt={`${name} · ${cap}`} data-testid="lightbox-image" draggable={false} />
        <button type="button" className={`${s.lbNav} ${s.lbPrev}`} onClick={() => go(-1)} aria-label={t.prev} data-testid="lightbox-prev">‹</button>
        <button type="button" className={`${s.lbNav} ${s.lbNext}`} onClick={() => go(1)} aria-label={t.next} data-testid="lightbox-next">›</button>
      </div>
      <div>
        <div className={s.lbCaption} data-testid="lightbox-caption">{cap}</div>
        <div className={s.lbThumbs}>
          {photos.map((ph, k) => (
            <button key={ph.file} type="button" aria-current={k === i} aria-label={`${k + 1}`} onClick={() => setI(k)} data-testid={`lightbox-thumb-${k}`}>
              <img src={ph.file} alt="" />
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
