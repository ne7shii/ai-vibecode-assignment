'use client';
import Link from 'next/link';
import { useEffect, useState } from 'react';
import type { Lang } from '@/i18n';
import { tp } from '@/i18n/public';
import SearchBox from './SearchBox';
import s from './public.module.css';

const SLIDES = ['/brand/resort/hero-beach.jpg', '/brand/resort/hero-pool.jpg', '/brand/resort/hero-sunset.jpg'];

export default function Hero({ lang, today }: { lang: Lang; today: string }) {
  const t = tp(lang);
  const [i, setI] = useState(0);

  useEffect(() => {
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    const id = window.setInterval(() => setI((x) => (x + 1) % SLIDES.length), 7000);
    return () => window.clearInterval(id);
  }, []);

  return (
    <section className={s.hero} data-testid="hero">
      <div className={s.heroSlides} aria-hidden>
        {SLIDES.map((src, k) => (
          <div key={src} className={`${s.heroSlide} ${k === i ? s.heroSlideOn : ''}`} style={{ backgroundImage: `url(${src})` }} data-testid={k === i ? 'hero-slide-active' : undefined} />
        ))}
      </div>
      <div className={s.heroShade} aria-hidden />
      <div className={`container ${s.heroInner}`}>
        <div className={s.heroEyebrow}>{t.heroEyebrow}</div>
        <h1 className={s.heroTitle} data-testid="hero-title">{t.heroTitle}</h1>
        <p className={s.heroLead}>{t.heroLead}</p>
        <div className="row" style={{ marginTop: 20 }}>
          <Link href={`/${lang}/rooms`} className="btn" style={{ background: 'rgba(255,255,255,.14)', color: '#fff', borderColor: 'rgba(255,255,255,.55)', backdropFilter: 'blur(6px)' }} data-testid="hero-rooms">{t.heroCta}</Link>
        </div>
        <div className={s.heroDots} role="tablist" aria-label="slides">
          {SLIDES.map((src, k) => (
            <button key={src} type="button" role="tab" aria-selected={k === i} aria-label={`${k + 1} / ${SLIDES.length}`} className={`${s.heroDot} ${k === i ? s.heroDotOn : ''}`} onClick={() => setI(k)} data-testid={`hero-dot-${k}`} />
          ))}
        </div>
      </div>
      <div className={`container ${s.heroSearchWrap}`}>
        <SearchBox lang={lang} today={today} />
      </div>
      <div className={s.scrollCue} aria-hidden>{t.heroScroll}</div>
    </section>
  );
}
