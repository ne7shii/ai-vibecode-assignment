import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { isLang, type Lang } from '@/i18n';
import { AMENITY, amenityLabel, fill, tf, tp } from '@/i18n/public';
import { fmtDate } from '@/lib/format';
import { daysBetween } from '@/lib/rules/calendar';
import type { SeasonKind } from '@/lib/rules/types';
import { isIsoDate, loadPublicRooms, priceNights, upcomingRanges } from '@/components/public/server';
import Gallery from '@/components/public/Gallery';
import PanoButton from '@/components/public/PanoButton';
import RoomCard from '@/components/public/RoomCard';
import Reveal from '@/components/public/Reveal';
import ChatWidget from '@/components/public/ChatWidget';
import { CurrencyProvider, CurrencySelect, Money } from '@/components/public/Currency';
import s from '@/components/public/public.module.css';

type P = { params: Promise<{ lang: string; code: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export async function generateMetadata({ params }: P): Promise<Metadata> {
  const { lang, code } = await params;
  const { rooms } = await loadPublicRooms();
  const r = rooms.find((x) => x.code === code.toUpperCase());
  return { title: r ? tf(r, 'name', isLang(lang) ? lang : 'th') : 'Room' };
}

const BADGE: Record<SeasonKind, string> = { LOW: 'badge-ok', HIGH: 'badge-high', PEAK: 'badge-peak' };

export default async function RoomPage({ params, searchParams }: P) {
  const { lang: l, code: rawCode } = await params;
  if (!isLang(l)) notFound();
  const lang = l as Lang;
  const t = tp(lang);
  const code = rawCode.toUpperCase();
  const { rooms, seasons, rates, today, todaySeason } = await loadPublicRooms();
  const room = rooms.find((r) => r.code === code);
  if (!room) notFound();
  const name = tf(room, 'name', lang);

  // Optional dates (?checkIn=&checkOut=) → nightly prices for that stay (US-04 ข้อ 3, US-11 ข้อ 2)
  const sp = await searchParams;
  const ci = sp.checkIn, co = sp.checkOut;
  const datesOk = isIsoDate(ci) && isIsoDate(co) && ci >= today && co > ci && daysBetween(ci, co) <= 30;
  const nights = datesOk ? priceNights(code, ci, co, { seasons, rates }) : null;
  const total = nights?.reduce((a, n) => a + n.price, 0) ?? 0;
  const badgeSeason = (nights && nights.length ? (nights.some((n) => n.season === 'PEAK') ? 'PEAK' : nights[0].season) : todaySeason) as SeasonKind | null;
  const ranges = upcomingRanges(seasons, today);
  const bookQ = new URLSearchParams(datesOk ? { checkIn: ci, checkOut: co, adults: '2', roomType: code } : { adults: '2', roomType: code });
  const others = rooms.filter((r) => r.code !== code).slice(0, 3);

  return (
    <CurrencyProvider>
      <section className="container" style={{ paddingTop: 28 }} data-testid={`room-detail-${code}`}>
        <Link href={`/${lang}/rooms`} className="small" style={{ textDecoration: 'none', fontWeight: 600 }} data-testid="back-to-rooms">{t.backToRooms}</Link>
        <div className={s.head} style={{ marginTop: 14 }}>
          <div>
            <div className={s.kicker}>{t.roomsEyebrow}</div>
            <h1 style={{ marginBottom: 6 }} data-testid="room-name">{name}</h1>
            <p className="muted" style={{ margin: 0 }}>{tf(room, 'desc', lang)}</p>
          </div>
          <div className="row">
            {badgeSeason && (
              <span className={`badge ${BADGE[badgeSeason]}`} style={{ fontSize: 13, padding: '4px 12px' }} data-testid="season-badge" title={datesOk ? t.seasonSelected : t.seasonToday}>
                {t[`badge${badgeSeason}` as const]}
              </span>
            )}
            {room.pano && <PanoButton src={room.pano} lang={lang} name={name} />}
          </div>
        </div>
        <Gallery photos={room.photos} lang={lang} name={name} />
      </section>

      <section className="container section" style={{ paddingTop: 36 }}>
        <div className={s.detailTop}>
          <div className="stack" style={{ gap: 36 }}>
            <div className={s.specs} data-testid="room-specs">
              <div className={s.spec}><small>{t.size}</small><b data-testid="spec-size">{room.sizeSqm} {t.sqm}</b></div>
              <div className={s.spec}><small>{t.bed}</small><b data-testid="spec-bed">{tf(room, 'bed', lang)}</b></div>
              <div className={s.spec}><small>{t.view}</small><b data-testid="spec-view">{tf(room, 'view', lang)}</b></div>
              <div className={s.spec}><small>{t.maxGuests}</small><b data-testid="spec-guests">{fill(t.adultsMax, { a: room.maxAdults, t: room.maxTotal })}</b></div>
              <div className={s.spec}><small>{t.extraBed}</small><b data-testid="spec-extrabed">{room.extraBedAllowed ? t.yes : t.no}</b></div>
              <div className={s.spec}><small>{t.roomsEyebrow}</small><b>{fill(t.roomsLeft, { n: room.totalRooms })}</b></div>
            </div>

            <Reveal>
              <h2 style={{ fontSize: 24 }}>{t.amenities}</h2>
              <ul className={s.amen} data-testid="room-amenities">
                {room.amenities.map((a) => (
                  <li key={a}><span className={s.amenIcon} aria-hidden>{AMENITY[a]?.icon ?? '•'}</span>{amenityLabel(a, lang)}</li>
                ))}
              </ul>
            </Reveal>

            <Reveal>
              <h2 style={{ fontSize: 24 }}>{t.rates}</h2>
              <div className="table-wrap">
                <table className="table" data-testid="rate-table">
                  <thead><tr><th>{t.season}</th><th>{t.period}</th><th className="num">{t.price}</th></tr></thead>
                  <tbody>
                    {(['LOW', 'HIGH', 'PEAK'] as const).map((k) => (
                      <tr key={k} data-testid={`rate-${k}`}>
                        <td><span className={`badge ${BADGE[k]}`}>{t[k]}</span></td>
                        <td className="small">
                          {ranges[k].slice(0, 4).map((r) => <div key={r.start}>{fmtDate(r.start, lang)} – {fmtDate(r.end, lang)}</div>)}
                          {ranges[k].length > 4 && <div className="muted">+{ranges[k].length - 4}</div>}
                        </td>
                        <td className="num"><strong><Money thb={room.rates[k]} testId={`rate-${k}-price`} /></strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <p className="small muted" style={{ marginTop: 10 }}>{t.rateNote}</p>
            </Reveal>

            {nights && (
              <div data-testid="stay-prices">
                <h2 style={{ fontSize: 24 }}>{t.nightsPrice}</h2>
                <div className="table-wrap">
                  <table className="table">
                    <thead><tr><th>{t.night}</th><th>{t.season}</th><th className="num">{t.price}</th></tr></thead>
                    <tbody>
                      {nights.map((n) => (
                        <tr key={n.night}>
                          <td>{fmtDate(n.night, lang)}</td>
                          <td><span className={`badge ${BADGE[n.season]}`}>{t[n.season]}</span></td>
                          <td className="num"><Money thb={n.price} /></td>
                        </tr>
                      ))}
                      <tr>
                        <td colSpan={2}><strong>{fill(t.totalRoom, { n: nights.length })}</strong> <span className="small muted">({t.beforePromo})</span></td>
                        <td className="num"><strong><Money thb={total} testId="stay-total" /></strong></td>
                      </tr>
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>

          <aside className={`${s.panel} ${s.panelSticky}`} data-testid="room-book-panel">
            <div>
              <div className={s.priceFrom}>{t.fromPerNight}</div>
              <div className={s.price} style={{ fontSize: 32 }}><Money thb={room.from} testId="room-from" /> <span className={s.priceUnit}>{t.perNight}</span></div>
            </div>
            <CurrencySelect lang={lang} />
            <form method="get" className={s.dateForm} data-testid="room-date-form">
              <div className="field">
                <label htmlFor="rd-in">{t.checkIn}</label>
                <input id="rd-in" className="input" type="date" name="checkIn" min={today} defaultValue={datesOk ? ci : ''} required data-testid="room-checkin" />
              </div>
              <div className="field">
                <label htmlFor="rd-out">{t.checkOut}</label>
                <input id="rd-out" className="input" type="date" name="checkOut" min={today} defaultValue={datesOk ? co : ''} required data-testid="room-checkout" />
              </div>
              <button className="btn btn-ghost" type="submit" data-testid="room-show-prices">{t.showPrices}</button>
            </form>
            {datesOk && nights && (
              <div className="alert alert-info small">
                {fmtDate(ci, lang)} – {fmtDate(co, lang)} · {fill(t.totalRoom, { n: nights.length })}: <strong><Money thb={total} /></strong>
              </div>
            )}
            <Link className="btn btn-gold" href={`/${lang}/book?${bookQ.toString()}`} data-testid="book-this-room">{t.bookThisRoom} →</Link>
          </aside>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--paper)', paddingTop: 56 }}>
        <div className="container">
          <h2>{t.otherRooms}</h2>
          <div className={s.roomGrid}>
            {others.map((r, i) => <Reveal key={r.code} delay={i * 90}><RoomCard room={r} lang={lang} /></Reveal>)}
          </div>
        </div>
      </section>
      <ChatWidget lang={lang} />
    </CurrencyProvider>
  );
}
