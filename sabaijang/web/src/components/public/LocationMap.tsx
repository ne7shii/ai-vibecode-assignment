import type { Lang } from '@/i18n';
import { DISTANCES, tp } from '@/i18n/public';
import s from './public.module.css';

// Stylised map of Phuket (not to scale) – no external tiles or scripts.
const PINS: Record<string, { x: number; y: number; dx?: number; anchor?: 'start' | 'end' }> = {
  airport: { x: 262, y: 58, dx: 14 },
  oldtown: { x: 392, y: 262, dx: 14 },
  buddha: { x: 256, y: 304, dx: 14 },
  viewpoint: { x: 190, y: 392, dx: 14 },
  beach: { x: 168, y: 352, dx: -14, anchor: 'end' },
};

export default function LocationMap({ lang }: { lang: Lang }) {
  const t = tp(lang);
  const label = (k: string) => {
    const d = DISTANCES.find((x) => x.key === k)!;
    return lang === 'en' ? d.en : d.th;
  };
  return (
    <figure className={s.map} style={{ margin: 0 }} data-testid="location-map">
      <svg viewBox="0 0 600 440" role="img" aria-label={`${t.locationTitle} · ${t.locationLead}`}>
        <defs>
          <linearGradient id="sea" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#bfe0e0" /><stop offset="1" stopColor="#8fc6c8" /></linearGradient>
          <linearGradient id="land" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#f6f1e7" /><stop offset="1" stopColor="#ebe2cf" /></linearGradient>
          <pattern id="waves" width="40" height="16" patternUnits="userSpaceOnUse"><path d="M0 8 q10 -6 20 0 t20 0" fill="none" stroke="#ffffff" strokeOpacity=".35" strokeWidth="1.2" /></pattern>
        </defs>
        <rect width="600" height="440" fill="url(#sea)" />
        <rect width="600" height="440" fill="url(#waves)" />
        <path d="M232 0 C252 40 222 66 210 104 C196 150 190 200 178 250 C168 296 158 338 168 372 C176 404 196 428 214 440 L268 440 C300 412 334 386 382 364 C424 344 456 318 446 280 C436 240 404 220 394 180 C382 130 352 90 334 40 C326 20 312 0 300 0 Z" fill="url(#land)" stroke="#d8ccb2" strokeWidth="2" />
        <path d="M200 230 C240 240 280 250 330 240 M210 280 C260 276 300 268 392 262" fill="none" stroke="#7aa88f" strokeOpacity=".35" strokeWidth="14" strokeLinecap="round" />
        <path d="M262 58 C250 120 240 180 226 240 C214 290 200 330 186 356" fill="none" stroke="#b08a3e" strokeWidth="2.5" strokeDasharray="7 6" />
        <text x="96" y="210" fill="#0b4f5c" fillOpacity=".55" fontSize="15" fontStyle="italic" fontFamily="Georgia, serif" letterSpacing="3">{lang === 'en' ? 'ANDAMAN SEA' : 'ทะเลอันดามัน'}</text>
        {Object.entries(PINS).map(([k, p]) => (
          <g key={k}>
            <circle cx={p.x} cy={p.y} r="6" fill="#fff" stroke="#0b4f5c" strokeWidth="2.5" />
            <text x={p.x + (p.dx ?? 12)} y={p.y + 5} textAnchor={p.anchor ?? 'start'} fontSize="16" fontWeight="600" fill="#073640" stroke="#fff" strokeWidth="4" paintOrder="stroke" fontFamily="Sarabun, system-ui, sans-serif">{label(k)}</text>
          </g>
        ))}
        <g transform="translate(186 356)">
          <circle r="22" fill="#b08a3e" opacity=".25" className={s.pulse} />
          <path d="M0 -26 C-11 -26 -17 -18 -17 -10 C-17 2 0 14 0 14 C0 14 17 2 17 -10 C17 -18 11 -26 0 -26 Z" fill="#b08a3e" stroke="#fff" strokeWidth="2" transform="translate(0 -6)" />
          <circle cy="-16" r="5" fill="#fff" />
          <text x="22" y="-14" fontSize="19" fontWeight="700" fill="#073640" stroke="#fff" strokeWidth="5" paintOrder="stroke" fontFamily="'Noto Serif Thai', Georgia, serif">CWN {lang === 'en' ? 'Sabai Jang' : 'สบายจัง'}</text>
        </g>
        <g transform="translate(548 44)" fill="#073640" fontSize="12" fontWeight="700" textAnchor="middle">
          <circle r="16" fill="#fff" opacity=".8" />
          <path d="M0 -11 L5 4 L0 1 L-5 4 Z" fill="#b08a3e" />
          <text y="30">N</text>
        </g>
      </svg>
      <a className={`btn btn-sm ${s.mapLink}`} style={{ background: '#fff', color: 'var(--sea-deep)', boxShadow: 'var(--shadow)' }} href="https://www.google.com/maps/search/?api=1&query=Kata+Road+Karon+Phuket+83100" target="_blank" rel="noreferrer" data-testid="map-open">{t.openMap} ↗</a>
    </figure>
  );
}
