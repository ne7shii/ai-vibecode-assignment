import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLang, type Lang } from '@/i18n';
import { PRIVACY, tp } from '@/i18n/public';
import ChatWidget from '@/components/public/ChatWidget';
import s from '@/components/public/public.module.css';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: tp(isLang(lang) ? lang : 'th').privacyTitle };
}

/** US-56: privacy policy (PDPA) in Thai and English. */
export default async function PrivacyPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  if (!isLang(l)) notFound();
  const lang = l as Lang;
  const t = tp(lang);
  const p = PRIVACY[lang];
  const other: Lang = lang === 'th' ? 'en' : 'th';
  return (
    <>
      <section className="container" data-testid="privacy">
        <div className={s.pageHead}>
          <div className={s.kicker}>PDPA</div>
          <h1>{t.privacyTitle}</h1>
          <p className="muted small" style={{ margin: 0 }}>{p.updated} · <Link href={`/${other}/privacy`} hrefLang={other} data-testid="privacy-other-lang">{other === 'en' ? 'Read in English' : 'อ่านฉบับภาษาไทย'}</Link></p>
        </div>
        <div className={`${s.prose} card`} style={{ padding: 'clamp(20px, 4vw, 40px)', marginBottom: 40 }}>
          <p style={{ fontSize: 17 }}>{p.intro}</p>
          {p.sections.map((sec, i) => (
            <section key={sec.h} data-testid={`privacy-section-${i + 1}`}>
              <h2>{sec.h}</h2>
              <ul>{sec.items.map((it) => <li key={it}>{it}</li>)}</ul>
            </section>
          ))}
        </div>
      </section>
      <ChatWidget lang={lang} />
    </>
  );
}
