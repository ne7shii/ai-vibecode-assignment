import type { ReactNode } from 'react';
import s from './public.module.css';

/** Photo header for inner public pages. */
export default function PageHero({ img, kicker, title, lead, children, testId }: { img: string; kicker: string; title: string; lead?: string; children?: ReactNode; testId?: string }) {
  return (
    <section className={s.pageHero} style={{ backgroundImage: `url(${img})` }} data-testid={testId ?? 'page-hero'}>
      <div className={`container ${s.pageHeroInner}`}>
        <div className={s.kicker}>{kicker}</div>
        <h1>{title}</h1>
        {lead && <p>{lead}</p>}
        {children}
      </div>
    </section>
  );
}
