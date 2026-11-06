'use client';
import { useState } from 'react';
import type { Lang } from '@/i18n';
import { api } from '@/lib/client/api';
import { fmtDate } from '@/lib/format';
import { bahtFmt, LoadError, noticeFrom, NoticeBox, PageHead, StatusBadge, useLoad, useT, type Notice } from './ui';
import styles from './admin.module.css';

interface Addon { id: number; bookingCode: string; contactName: string; checkIn: string; checkOut: string; kind: string; nameTh: string; nameEn: string; price: number; status: string; flightNo: string | null; arriveTime: string | null }

export default function Addons({ lang }: { lang: Lang }) {
  const t = useT(lang);
  const [all, setAll] = useState(false);
  const { data, error, reload } = useLoad<{ addons: Addon[] }>(`/api/admin/addons${all ? '' : '?status=PENDING'}`);
  const [notice, setNotice] = useState<Notice>(null);
  const [busy, setBusy] = useState(0);

  async function decide(a: Addon, status: 'CONFIRMED' | 'REJECTED') {
    if (status === 'REJECTED' && !window.confirm(t.confirmReject)) return;
    setBusy(a.id);
    try {
      const r = await api<{ refund: number }>(`/api/admin/addons/${a.id}`, { body: { status } });
      setNotice({ kind: 'ok', text: `${a.bookingCode} · ${lang === 'en' ? a.nameEn : a.nameTh} · ${status === 'CONFIRMED' ? t.st_CONFIRMED : t.st_REJECTED}${r.refund ? ` · ${t.refunded} ${bahtFmt(r.refund)}` : ''}` });
      await reload();
    } catch (e) {
      setNotice(noticeFrom(e, lang));
    } finally {
      setBusy(0);
    }
  }

  return (
    <>
      <PageHead title={t.addTitle}>
        <button className="btn btn-ghost btn-sm" onClick={() => setAll(!all)} data-testid="addons-toggle-all">{all ? t.pendingOnly : t.showAll}</button>
      </PageHead>
      <LoadError error={error} lang={lang} />
      <NoticeBox n={notice} testid="addons-notice" />
      <div className="table-wrap">
        <table className="table" data-testid="addons-table">
          <thead><tr><th>{t.booking}</th><th>{t.guest}</th><th>{t.kind}</th><th>{t.flight}</th><th className="num">{t.price}</th><th>{t.status}</th><th>{t.actions}</th></tr></thead>
          <tbody>
            {data?.addons.map((a) => (
              <tr key={a.id} data-testid={`addon-${a.id}`}>
                <td><code>{a.bookingCode}</code><div className="muted small">{fmtDate(a.checkIn, lang)}</div></td>
                <td>{a.contactName}</td>
                <td>{lang === 'en' ? a.nameEn : a.nameTh}</td>
                <td>{a.flightNo ? `${a.flightNo} ${a.arriveTime ?? ''}` : '–'}</td>
                <td className="num">{bahtFmt(a.price)}</td>
                <td><StatusBadge status={a.status} lang={lang} testid={`addon-status-${a.id}`} /></td>
                <td>
                  {a.status === 'PENDING' ? (
                    <div className={styles.actionsRow}>
                      <button className="btn btn-primary btn-sm" disabled={busy === a.id} onClick={() => decide(a, 'CONFIRMED')} data-testid={`addon-confirm-${a.id}`}>{t.confirm}</button>
                      <button className="btn btn-ghost btn-sm" disabled={busy === a.id} onClick={() => decide(a, 'REJECTED')} data-testid={`addon-reject-${a.id}`}>{t.reject}</button>
                    </div>
                  ) : '–'}
                </td>
              </tr>
            ))}
            {data && !data.addons.length && <tr><td colSpan={7} className="muted" data-testid="addons-empty">{t.none}</td></tr>}
          </tbody>
        </table>
      </div>
    </>
  );
}
