import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLang, type Lang } from '@/i18n';
import { pick } from '@/i18n';
import { common } from '@/i18n/common';
import { DISTANCES, FACILITIES, POLICIES, tp } from '@/i18n/public';
import PageHero from '@/components/public/PageHero';
import LocationMap from '@/components/public/LocationMap';
import Reveal from '@/components/public/Reveal';
import ChatWidget from '@/components/public/ChatWidget';
import s from '@/components/public/public.module.css';

export async function generateMetadata({ params }: { params: Promise<{ lang: string }> }): Promise<Metadata> {
  const { lang } = await params;
  return { title: tp(isLang(lang) ? lang : 'th').aboutTitle };
}

export default async function AboutPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  if (!isLang(l)) notFound();
  const lang = l as Lang;
  const t = tp(lang);
  const c = pick(common, lang);
  const en = lang === 'en';

  return (
    <>
      <PageHero img="/brand/resort/exterior.jpg" kicker={c.tagline} title={t.aboutTitle} lead={t.aboutLead} testId="about-hero" />

      <section className="section" id="facilities" data-testid="about-facilities">
        <div className="container">
          <div className={s.head}>
            <div>
              <div className={s.kicker}>{t.facilitiesEyebrow}</div>
              <h2>{t.facilitiesTitle}</h2>
            </div>
          </div>
          <div className={s.facGrid}>
            {FACILITIES.map((f, i) => (
              <Reveal key={f.key} className={s.fac} delay={(i % 4) * 80} data-testid={`facility-${f.key}`}>
                <img src={f.img} alt="" loading="lazy" />
                <div className={s.facBody}>
                  <h3>{en ? f.en : f.th}</h3>
                  <p>{en ? f.descEn : f.descTh}</p>
                  <span className={s.hoursPill} data-testid={`facility-hours-${f.key}`}>{en ? f.hoursEn : f.hoursTh}</span>
                </div>
              </Reveal>
            ))}
          </div>
          <Reveal style={{ marginTop: 28 }}>
            <h3>{t.hours}</h3>
            <div className="table-wrap">
              <table className={`table ${s.hoursTable}`} data-testid="hours-table">
                <tbody>
                  {FACILITIES.map((f) => (
                    <tr key={f.key}><td>{en ? f.en : f.th}</td><td>{en ? f.hoursEn : f.hoursTh}</td></tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Reveal>
        </div>
      </section>

      <section className="section" id="location" style={{ background: 'var(--sea-soft)' }} data-testid="about-location">
        <div className={`container ${s.locWrap}`}>
          <Reveal><LocationMap lang={lang} /></Reveal>
          <Reveal delay={120}>
            <div className={s.kicker}>{t.locationEyebrow}</div>
            <h2>{t.distancesTitle}</h2>
            <p className="muted">{t.locationLead}</p>
            <ul className={s.distList}>
              {DISTANCES.map((d) => (
                <li key={d.key} data-testid={`distance-${d.key}`}>
                  <div><strong>{en ? d.en : d.th}</strong><div className="small muted">{en ? d.timeEn : d.timeTh}</div></div>
                  <div className={s.distKm}>{d.km} <small>{en ? 'km' : 'กม.'}</small></div>
                </li>
              ))}
            </ul>
            <p className="small" style={{ marginTop: 14 }}>{t.gettingHere}</p>
          </Reveal>
        </div>
      </section>

      <section className="section" id="policies" data-testid="policies" style={{ scrollMarginTop: 72 }}>
        <div className="container">
          <div className={s.head}>
            <div>
              <div className={s.kicker}>{c.policies}</div>
              <h2>{t.policiesTitle}</h2>
            </div>
          </div>
          <div className={s.policyGrid}>
            {POLICIES.map((p) => (
              <article className={s.policy} key={p.key} data-testid={`policy-${p.key}`}>
                <h3>{en ? p.en : p.th}</h3>
                <p>{en ? p.bodyEn : p.bodyTh}</p>
              </article>
            ))}
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--paper)' }} data-testid="about-contact">
        <div className="container grid-2" style={{ alignItems: 'center' }}>
          <img src="/brand/resort/lobby.jpg" alt="" loading="lazy" style={{ width: '100%', borderRadius: 18, aspectRatio: '3/2', objectFit: 'cover', boxShadow: 'var(--shadow)' }} />
          <div>
            <div className={s.kicker}>{t.contactTitle}</div>
            <h2>{c.hotel}</h2>
            <p>{c.address}</p>
            <p><a href="tel:076123456">076-123-456</a> · LINE <strong>@cwnsabaijang</strong><br /><a href="mailto:reservation@sabaijang.test">reservation@sabaijang.test</a></p>
          </div>
        </div>
      </section>
      <ChatWidget lang={lang} />
    </>
  );
}
