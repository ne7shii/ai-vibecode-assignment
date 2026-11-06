import Link from 'next/link';
import type { Lang } from '@/i18n';

import { fill, tf, tp } from '@/i18n/public';
import { Money } from './Currency';
import s from './public.module.css';

export interface CardRoom {
  code: string; nameTh: string; nameEn: string; descTh: string; descEn: string; sizeSqm: number;
  bedTh: string; bedEn: string; viewTh: string; viewEn: string; maxAdults: number; maxTotal: number;
  extraBedAllowed: boolean; pano: string | null; amenities: string[]; totalRooms: number;
  photos: { file: string; captionTh: string; captionEn: string }[];
  rates: { LOW: number; HIGH: number; PEAK: number }; from: number;
}

export default function RoomCard({ room, lang, compare }: {
  room: CardRoom; lang: Lang;
  compare?: { on: boolean; toggle: () => void };
}) {
  const t = tp(lang);
  const name = tf(room, 'name', lang);
  return (
    <article className={s.roomCard} data-testid={`room-card-${room.code}`}>
      <div className={s.roomImg}>
        <img src={room.photos[0]?.file} alt={name} loading="lazy" />
        <div className={s.roomTag}>
          <span className={s.glass}>{room.sizeSqm} {t.sqm}</span>
          {room.pano && <span className={s.glass}>360°</span>}
        </div>
      </div>
      <div className={s.roomBody}>
        <h3><Link href={`/${lang}/rooms/${room.code}`} data-testid={`room-link-${room.code}`}>{name}</Link></h3>
        <p className="muted small" style={{ margin: 0 }}>{tf(room, 'desc', lang)}</p>
        <div className={s.facts}>
          <span>{tf(room, 'bed', lang)}</span>
          <span>· {tf(room, 'view', lang)}</span>
          <span>· {fill(t.guestsUpTo, { n: room.maxTotal })}</span>
        </div>
        <div className={s.roomFoot}>
          <div>
            <div className={s.priceFrom}>{t.fromPerNight}</div>
            <div className={s.price}><Money thb={room.from} testId={`room-from-${room.code}`} /> <span className={s.priceUnit}>{t.perNight}</span></div>
          </div>
          {compare ? (
            <button type="button" className={`btn btn-ghost btn-sm ${s.compareBtn} ${compare.on ? s.compareOn : ''}`} aria-pressed={compare.on} onClick={compare.toggle} data-testid={`compare-toggle-${room.code}`}>
              {compare.on ? '✓ ' : '+ '}{t.compare}
            </button>
          ) : (
            <span className={s.link} aria-hidden>{t.viewRoom} →</span>
          )}
        </div>
      </div>
    </article>
  );
}
