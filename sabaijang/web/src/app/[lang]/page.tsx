import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLang, type Lang } from '@/i18n';
import { DISTANCES, FACILITIES, TEAM, tf, tp } from '@/i18n/public';
import { listPublicPromotions } from '@/lib/services/promotions';
import { loadPublicRooms } from '@/components/public/server';
import Hero from '@/components/public/Hero';
import Reveal from '@/components/public/Reveal';
import RoomCard from '@/components/public/RoomCard';
import PromoCard from '@/components/public/PromoCard';
import Reviews from '@/components/public/Reviews';
import LocationMap from '@/components/public/LocationMap';
import ChatWidget from '@/components/public/ChatWidget';
import { CurrencyProvider } from '@/components/public/Currency';
import s from '@/components/public/public.module.css';

export default async function Home({ params }: { params: Promise<{ lang: string }> }) {
  const { lang: l } = await params;
  if (!isLang(l)) notFound();
  const lang = l as Lang;
  const t = tp(lang);
  const [{ rooms, today, nowIso }, promos] = await Promise.all([loadPublicRooms(), listPublicPromotions()]);
  // Headline offers first: flash sale, then price promotions and packages (stackable discounts are shown on /promotions).
  const offers = [...promos.filter((p) => p.saleEndsAt), ...promos.filter((p) => !p.saleEndsAt && p.grp !== 'STACK')].slice(0, 6);

  return (
    <CurrencyProvider>
      <Hero lang={lang} today={today} />

      {/* Rooms */}
      <section className="section" data-testid="home-rooms">
        <div className="container">
          <Reveal className={s.head}>
            <div>
              <div className={s.kicker}>{t.roomsEyebrow}</div>
              <h2>{t.roomsTitle}</h2>
              <p className="muted">{t.roomsLead}</p>
            </div>
            <Link className={s.link} href={`/${lang}/rooms`} data-testid="home-all-rooms">{t.allRooms} →</Link>
          </Reveal>
          <div className={s.roomGrid}>
            {rooms.map((r, i) => (
              <Reveal key={r.code} delay={(i % 3) * 100}><RoomCard room={r} lang={lang} /></Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Offers */}
      {offers.length > 0 && (
        <section className="section" style={{ background: 'var(--paper)' }} data-testid="home-offers">
          <div className="container">
            <Reveal className={s.head}>
              <div>
                <div className={s.kicker}>{t.offersEyebrow}</div>
                <h2>{t.offersTitle}</h2>
              </div>
              <Link className={s.link} href={`/${lang}/promotions`} data-testid="home-all-offers">{t.allOffers} →</Link>
            </Reveal>
            <Reveal className={s.strip}>
              {offers.map((p) => <PromoCard key={p.code} p={p} lang={lang} serverNow={nowIso} compact />)}
            </Reveal>
          </div>
        </section>
      )}

      {/* Facilities */}
      <section className="section" data-testid="home-facilities">
        <div className="container">
          <Reveal className={s.head}>
            <div>
              <div className={s.kicker}>{t.facilitiesEyebrow}</div>
              <h2>{t.facilitiesTitle}</h2>
            </div>
            <Link className={s.link} href={`/${lang}/about`}>{t.aboutTitle} →</Link>
          </Reveal>
          <div className={s.facGrid}>
            {FACILITIES.map((f, i) => (
              <Reveal key={f.key} className={s.fac} delay={(i % 3) * 90} data-testid={`facility-${f.key}`}>
                <img src={f.img} alt="" loading="lazy" />
                <div className={s.facBody}>
                  <h3>{lang === 'en' ? f.en : f.th}</h3>
                  <p>{lang === 'en' ? f.descEn : f.descTh}</p>
                  <span className={s.hoursPill}>{lang === 'en' ? f.hoursEn : f.hoursTh}</span>
                </div>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* Location */}
      <section className="section" style={{ background: 'var(--sea-soft)' }} data-testid="home-location">
        <div className={`container ${s.locWrap}`}>
          <Reveal><LocationMap lang={lang} /></Reveal>
          <Reveal delay={120}>
            <div className={s.kicker}>{t.locationEyebrow}</div>
            <h2>{t.locationTitle}</h2>
            <p className="muted">{t.locationLead}</p>
            <ul className={s.distList}>
              {DISTANCES.map((d) => (
                <li key={d.key} data-testid={`distance-${d.key}`}>
                  <div><strong>{lang === 'en' ? d.en : d.th}</strong><div className="small muted">{lang === 'en' ? d.timeEn : d.timeTh}</div></div>
                  <div className={s.distKm}>{d.km} <small>{lang === 'en' ? 'km' : 'กม.'}</small></div>
                </li>
              ))}
            </ul>
          </Reveal>
        </div>
      </section>

      {/* Reviews */}
      <section className="section" data-testid="home-reviews">
        <div className="container">
          <Reveal className={s.head}>
            <div>
              <div className={s.kicker}>{t.reviewsEyebrow}</div>
              <h2>{t.reviewsTitle}</h2>
            </div>
            <Link className={s.link} href={`/${lang}/reviews`} data-testid="home-all-reviews">{t.allReviews} →</Link>
          </Reveal>
          <Reveal>
            <Reviews lang={lang} rooms={rooms.map((r) => ({ code: r.code, name: tf(r, 'name', lang) }))} limit={3} />
          </Reveal>
        </div>
      </section>

      {/* Team */}
      <section className="section" style={{ background: 'var(--paper)' }} data-testid="home-team">
        <div className={`container ${s.team}`}>
          <Reveal>
            <div className={s.kicker}>{t.teamEyebrow}</div>
            <h2>{t.teamTitle}</h2>
            <p className={s.quote}>{t.teamQuote}</p>
            <p className="muted small">{t.teamQuoteBy}</p>
          </Reveal>
          <div className={s.teamGrid}>
            {TEAM.map((m, i) => (
              <Reveal key={m.photo} className={s.member} delay={i * 90}>
                <img src={m.photo} alt={lang === 'en' ? m.en : m.th} loading="lazy" />
                <b>{lang === 'en' ? m.en : m.th}</b>
                <span>{lang === 'en' ? m.roleEn : m.roleTh}</span>
              </Reveal>
            ))}
          </div>
        </div>
      </section>

      {/* CTA band */}
      <section className={s.band} style={{ backgroundImage: 'url(/brand/resort/hero-sunset.jpg)', marginBottom: -40 }} data-testid="home-cta">
        <Reveal className="container">
          <h2>{t.ctaTitle}</h2>
          <p>{t.ctaLead}</p>
          <div className="row" style={{ justifyContent: 'center' }}>
            <Link href={`/${lang}/book`} className="btn btn-gold" data-testid="home-cta-book">{t.ctaBook}</Link>
            <Link href={`/${lang}/promotions`} className="btn" style={{ color: '#fff', borderColor: 'rgba(255,255,255,.6)' }}>{t.allOffers}</Link>
          </div>
        </Reveal>
      </section>

      <ChatWidget lang={lang} />
    </CurrencyProvider>
  );
}
