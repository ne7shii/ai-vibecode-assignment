import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLang, type Lang } from '@/i18n';
import { tp } from '@/i18n/public';
import { listPublicPromotions } from '@/lib/services/promotions';
import { getClock } from '@/lib/clock-db';
import PageHero from '@/components/public/PageHero';
import PromoCard, { bookHref } from '@/components/public/PromoCard';
import Reveal from '@/components/public/Reveal';
import ChatWidget from '@/components/public/ChatWidget';
import s from '@/components/public/public.module.css';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: tp(isLang(lang) ? lang : 'th').promoPageTitle };
}

export default async function PromotionsPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  if (!isLang(l)) notFound();
  const lang = l as Lang;
  const t = tp(lang);
  const [promos, clock] = await Promise.all([listPublicPromotions(), getClock()]);
  const nowIso = clock.now().toISOString();
  // Flash sale first, then price offers, packages, and stackable discounts last.
  const order = (p: { saleEndsAt: string | null; grp: string }) => (p.saleEndsAt ? 0 : p.grp === 'PRICE' ? 1 : p.grp === 'PLAN' ? 2 : 3);
  const list = [...promos].sort((a, b) => order(a) - order(b));
  const family = promos.find((p) => p.kind === 'FAMILY_SUMMER');

  return (
    <>
      <PageHero img="/brand/misc/promo-bg.jpg" kicker={t.offersEyebrow} title={t.promoPageTitle} lead={t.promoPageLead} testId="promo-hero" />
      <section className="section" style={{ paddingTop: 40 }}>
        <div className="container">
          {list.length === 0 ? (
            <div className={s.empty} data-testid="promo-empty"><img src="/brand/misc/empty-state.jpg" alt="" /><p>{t.noPromos}</p></div>
          ) : (
            <div className={s.offerGrid} data-testid="promo-list">
              {list.map((p, i) => (
                <Reveal key={p.code} delay={(i % 3) * 90}><PromoCard p={p} lang={lang} serverNow={nowIso} /></Reveal>
              ))}
            </div>
          )}
        </div>
      </section>

      {family && (
        <section className="section" style={{ background: 'var(--paper)' }} data-testid="kids-club">
          <div className={`container ${s.locWrap}`}>
            <Reveal>
              <img src="/brand/resort/kids-club.jpg" alt="Kids Club" style={{ width: '100%', borderRadius: 18, aspectRatio: '4/3', objectFit: 'cover', boxShadow: 'var(--shadow)' }} loading="lazy" />
            </Reveal>
            <Reveal delay={120}>
              <div className={s.kicker}>{lang === 'en' ? family.nameEn : family.nameTh}</div>
              <h2>{t.kidsTitle}</h2>
              <p className="muted">{t.kidsLead}</p>
              <ul className={s.distList}>
                {t.kidsActs.map(([time, act]) => (
                  <li key={time} data-testid="kids-activity">
                    <span>{act}</span>
                    <span className={s.distKm} style={{ fontSize: 18 }}>{time}</span>
                  </li>
                ))}
              </ul>
              <Link className="btn btn-primary" style={{ marginTop: 18 }} href={bookHref(family, lang)} data-testid="kids-book">{t.bookOffer} →</Link>
            </Reveal>
          </div>
        </section>
      )}
      <ChatWidget lang={lang} />
    </>
  );
}
