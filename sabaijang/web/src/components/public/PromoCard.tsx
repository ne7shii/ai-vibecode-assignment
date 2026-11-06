import Link from 'next/link';
import type { Lang } from '@/i18n';

import { fill, tf, tp } from '@/i18n/public';
import { fmtDate } from '@/lib/format';
import Countdown from './Countdown';
import s from './public.module.css';

export interface Promo {
  code: string; grp: string; kind: string; nameTh: string; nameEn: string; descTh: string; descEn: string;
  value: number; memberOnly: boolean; image: string | null; endsOn: string | null; saleEndsAt: string | null;
  remaining: number | null; suggestion: { checkIn: string; checkOut: string; roomType: string; plan: string } | null;
}

export function promoValue(p: Promo, lang: Lang): string | null {
  if (p.kind === 'PERCENT') return `−${p.value}%`;
  if (p.kind === 'FREE_NIGHT') return lang === 'th' ? `พัก ${p.value} จ่าย ${p.value - 1}` : `Stay ${p.value} pay ${p.value - 1}`;
  if ((p.kind === 'HONEYMOON' || p.kind === 'FESTIVAL') && p.value) return `+฿${p.value.toLocaleString('en-US')}`;
  return null;
}

export const bookHref = (p: Promo, lang: Lang) =>
  p.suggestion ? `/${lang}/book?checkIn=${p.suggestion.checkIn}&checkOut=${p.suggestion.checkOut}&adults=2` : `/${lang}/book`;

export default function PromoCard({ p, lang, serverNow, compact = false }: { p: Promo; lang: Lang; serverNow: string; compact?: boolean }) {
  const t = tp(lang);
  const name = tf(p, 'name', lang);
  const value = promoValue(p, lang);
  const flash = !!p.saleEndsAt;
  const birthday = !p.suggestion && p.memberOnly;
  return (
    <article className={s.offer} data-testid={`promo-${p.code}`}>
      <div className={`${s.offerImg} ${p.image ? '' : s.offerImgEmpty}`}>
        {p.image ? <img src={p.image} alt="" loading="lazy" /> : <span aria-hidden>{value ?? '✦'}</span>}
        <div className={s.offerBadges}>
          {flash && <span className="badge badge-peak">{t.flashSale}</span>}
          {p.memberOnly && <span className="badge badge-gold" data-testid={`promo-member-${p.code}`}>★ {t.membersOnly}</span>}
          {p.grp === 'PLAN' && <span className={s.glass}>{t.plan}</span>}
          {p.grp === 'STACK' && <span className={s.glass}>{t.stackable}</span>}
        </div>
        {value && p.image && <span className={s.offerValue}>{value}</span>}
      </div>
      <div className={s.offerBody}>
        <h3>{name}</h3>
        <p className="muted small" style={{ margin: 0 }} data-testid={`promo-conditions-${p.code}`}>{tf(p, 'desc', lang)}</p>
        {flash && p.saleEndsAt && (
          <div className={s.flash} data-testid={`promo-flash-${p.code}`}>
            <div className={s.flashTop}>
              <span>{t.endsIn}</span>
              {p.remaining !== null && <span data-testid={`promo-remaining-${p.code}`}>{fill(t.roomsRemaining, { n: p.remaining })}</span>}
            </div>
            <Countdown endsAt={p.saleEndsAt} serverNow={serverNow} lang={lang} />
          </div>
        )}
        {!compact && (
          <div className={s.offerMeta}>
            <span data-testid={`promo-ends-${p.code}`}>{t.endsOn}: <strong>{p.endsOn ? fmtDate(p.endsOn, lang) : t.noEnd}</strong></span>
            {p.suggestion && <span>{t.suggested}: {fmtDate(p.suggestion.checkIn, lang)} – {fmtDate(p.suggestion.checkOut, lang)}</span>}
            {birthday && <span>{t.birthdayHow}</span>}
          </div>
        )}
        <div className={s.offerFoot}>
          {birthday ? (
            <Link className="btn btn-ghost btn-sm" href={`/${lang}/account`} data-testid={`promo-join-${p.code}`}>{t.joinMember}</Link>
          ) : (
            <Link className="btn btn-primary btn-sm" href={bookHref(p, lang)} data-testid={`promo-book-${p.code}`}>{t.bookOffer} →</Link>
          )}
        </div>
      </div>
    </article>
  );
}
