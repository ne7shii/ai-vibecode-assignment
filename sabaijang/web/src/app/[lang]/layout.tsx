import '../globals.css';
import type { Metadata, Viewport } from 'next';
import { notFound } from 'next/navigation';
import { isLang, pick, type Lang } from '@/i18n';
import { common } from '@/i18n/common';
import { ensureDatabase } from '@/lib/db/reset';
import { getClock } from '@/lib/clock-db';
import { bkk } from '@/lib/clock';
import { fmtDate } from '@/lib/format';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';

export const dynamic = 'force-dynamic';

export const metadata: Metadata = {
  title: { default: 'CWN สบายจัง รีสอร์ท · CWN Sabai Jang Resort', template: '%s · CWN Sabai Jang Resort' },
  description: 'Beachside resort on Kata Beach, Phuket · รีสอร์ทริมหาดกะตะ ภูเก็ต (demo)',
  icons: { icon: '/icon.svg' },
};
export const viewport: Viewport = { width: 'device-width', initialScale: 1, themeColor: '#0b4f5c' };

export default async function RootLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  await ensureDatabase();
  const today = bkk((await getClock()).now());
  const t = pick(common, lang as Lang);
  return (
    <html lang={lang}>
      <body>
        <div className="demo-banner" role="note" data-testid="demo-banner">
          {t.demoBanner} · {t.today}: <strong>{fmtDate(today.date, lang as Lang)} {today.time}</strong>
        </div>
        <SiteHeader lang={lang as Lang} />
        <main id="main">{children}</main>
        <SiteFooter lang={lang as Lang} />
      </body>
    </html>
  );
}
