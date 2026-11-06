import Link from 'next/link';
import { pick, type Lang } from '@/i18n';
import { common } from '@/i18n/common';

export default function SiteFooter({ lang }: { lang: Lang }) {
  const t = pick(common, lang);
  return (
    <footer style={{ background: 'var(--sea-deep)', color: '#d7e6e6', padding: '48px 0 28px', marginTop: 40 }} data-testid="site-footer">
      <div className="container grid-3">
        <div>
          <div style={{ fontFamily: 'var(--serif)', fontSize: 22, color: '#fff', fontWeight: 700 }}>{t.hotel}</div>
          <p className="small" style={{ marginTop: 8 }}>{t.tagline}</p>
          <p className="small">{t.address}<br />{t.contact}</p>
        </div>
        <nav className="stack small" aria-label="footer">
          <Link style={{ color: '#fff' }} href={`/${lang}/about`}>{t.facilities}</Link>
          <Link style={{ color: '#fff' }} href={`/${lang}/about#policies`}>{t.policies}</Link>
          <Link style={{ color: '#fff' }} href={`/${lang}/privacy`} data-testid="link-privacy">{t.privacy}</Link>
          <Link style={{ color: '#fff' }} href={`/${lang}/credits`} data-testid="link-credits">{t.credits}</Link>
        </nav>
        <div className="small">
          <p>{t.demoBanner}</p>
          <p style={{ opacity: .7 }}>© 2027 CWN Sabai Jang Resort (fictional teaching project)</p>
        </div>
      </div>
    </footer>
  );
}
