'use client';
// Small shared pieces for admin pages: data loading, error/success notices, badges.
import { useCallback, useEffect, useState } from 'react';
import { api, ApiError } from '@/lib/client/api';
import { pick, type Lang } from '@/i18n';
import { admin, type AdminT } from '@/i18n/admin';
import styles from './admin.module.css';

export const useT = (lang: Lang): AdminT => pick(admin, lang);

export function useLoad<T>(url: string | null) {
  const [data, setData] = useState<T | null>(null);
  const [error, setError] = useState<ApiError | null>(null);
  const [loading, setLoading] = useState(false);
  const reload = useCallback(async () => {
    if (!url) return;
    setLoading(true);
    try {
      setData(await api<T>(url));
      setError(null);
    } catch (e) {
      setError(e instanceof ApiError ? e : new ApiError(0, 'ERROR', { th: 'เกิดข้อผิดพลาด', en: 'Something went wrong' }, {}));
    } finally {
      setLoading(false);
    }
  }, [url]);
  useEffect(() => { reload(); }, [reload]);
  useEffect(() => {
    const on = () => reload();
    window.addEventListener('sj-user-changed', on);
    return () => window.removeEventListener('sj-user-changed', on);
  }, [reload]);
  return { data, error, loading, reload, setData };
}

export type Notice = { kind: 'ok' | 'bad'; text: string; extra?: string[] } | null;

export function noticeFrom(e: unknown, lang: Lang): Notice {
  if (e instanceof ApiError) {
    const extra: string[] = [];
    const ranges = e.data.ranges as { from: string; to: string }[] | undefined;
    if (ranges) for (const r of ranges.slice(0, 12)) extra.push(r.from === r.to ? r.from : `${r.from} – ${r.to}`);
    const bookings = e.data.bookings as string[] | undefined;
    if (bookings) extra.push(...bookings);
    return { kind: 'bad', text: lang === 'en' ? e.msg.en : e.msg.th, extra };
  }
  return { kind: 'bad', text: lang === 'en' ? 'Something went wrong' : 'เกิดข้อผิดพลาด' };
}

export function NoticeBox({ n, testid = 'admin-notice' }: { n: Notice; testid?: string }) {
  if (!n) return null;
  return (
    <div className={`alert ${n.kind === 'ok' ? 'alert-ok' : 'alert-bad'} ${styles.notice}`} role={n.kind === 'bad' ? 'alert' : 'status'} data-testid={testid} data-kind={n.kind}>
      {n.text}
      {n.extra?.length ? (
        <ul className={styles.noticeList} data-testid={`${testid}-items`}>
          {n.extra.map((x) => <li key={x}>{x}</li>)}
        </ul>
      ) : null}
    </div>
  );
}

export function LoadError({ error, lang }: { error: ApiError | null; lang: Lang }) {
  if (!error) return null;
  return <div className="alert alert-bad" role="alert" data-testid="admin-load-error">{lang === 'en' ? error.msg.en : error.msg.th}</div>;
}

const STATUS_CLASS: Record<string, string> = {
  CONFIRMED: 'badge', CHECKED_IN: 'badge badge-ok', CHECKED_OUT: 'badge badge-gold', NO_SHOW: 'badge badge-bad', CANCELLED: 'badge badge-bad',
  PENDING: 'badge badge-warn', REJECTED: 'badge badge-bad', LOW: 'badge badge-low', HIGH: 'badge badge-high', PEAK: 'badge badge-peak',
};

export function StatusBadge({ status, lang, testid }: { status: string; lang: Lang; testid?: string }) {
  const t = useT(lang) as unknown as Record<string, string>;
  return <span className={STATUS_CLASS[status] ?? 'badge'} data-testid={testid} data-status={status}>{t[`st_${status}`] ?? t[status] ?? status}</span>;
}

export function PageHead({ title, children }: { title: string; children?: React.ReactNode }) {
  return (
    <div className={styles.pageHead}>
      <h1 className={styles.pageTitle}>{title}</h1>
      {children ? <div className={styles.pageTools}>{children}</div> : null}
    </div>
  );
}

export const bahtFmt = (n: number) => `฿${Math.round(n).toLocaleString('en-US')}`;
