'use client';
import Link from 'next/link';
import type { Lang } from '@/i18n';
import { fmtDate } from '@/lib/format';
import { LoadError, PageHead, useLoad, useT } from './ui';
import styles from './admin.module.css';

interface Dash { today: string; counts: { arrivals: number; departures: number; inHouse: number }; pendingAddons: number; outboxToday: number }

export default function Dashboard({ lang, canFront }: { lang: Lang; canFront: boolean }) {
  const t = useT(lang);
  const { data, error } = useLoad<Dash>('/api/admin/dashboard');
  const tile = (n: number | undefined, label: string, testid: string, href?: string) => {
    const inner = (<><span className={styles.statNum} data-testid={`${testid}-count`}>{n ?? '–'}</span><span className={styles.statLabel}>{label}</span></>);
    return href ? <Link href={href} className={styles.stat} data-testid={testid}>{inner}</Link> : <div className={styles.stat} data-testid={testid}>{inner}</div>;
  };
  const front = canFront ? `/${lang}/admin/arrivals` : undefined;
  return (
    <>
      <PageHead title={t.dashTitle}>
        {data && <span className="badge" data-testid="dash-today">{t.today}: {fmtDate(data.today, lang)}</span>}
      </PageHead>
      <LoadError error={error} lang={lang} />
      <div className={styles.stats}>
        {tile(data?.counts.arrivals, t.dashArrivals, 'dash-arrivals', front)}
        {tile(data?.counts.departures, t.dashDepartures, 'dash-departures', front)}
        {tile(data?.counts.inHouse, t.dashInHouse, 'dash-inhouse', front)}
        {tile(data?.pendingAddons, t.dashPendingAddons, 'dash-addons', canFront ? `/${lang}/admin/addons` : undefined)}
        {tile(data?.outboxToday, t.dashOutbox, 'dash-outbox', canFront ? `/${lang}/admin/outbox` : undefined)}
      </div>
    </>
  );
}
