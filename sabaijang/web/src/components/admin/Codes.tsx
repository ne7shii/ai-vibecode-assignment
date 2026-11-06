'use client';
import { useState } from 'react';
import type { Lang } from '@/i18n';
import { api } from '@/lib/client/api';
import { fmtDate } from '@/lib/format';
import { bahtFmt, LoadError, noticeFrom, NoticeBox, PageHead, useLoad, useT, type Notice } from './ui';
import styles from './admin.module.css';

interface Code { code: string; discount: number; minRoomTotal: number; validUntil: string; maxUses: number | null; used: number; active: boolean }
const EMPTY = { code: '', discount: '', minRoomTotal: '', validUntil: '', maxUses: '' };

export default function Codes({ lang }: { lang: Lang }) {
  const t = useT(lang);
  const { data, error, reload } = useLoad<{ codes: Code[] }>('/api/admin/codes');
  const [f, setF] = useState(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function save() {
    setNotice(null);
    const body = { code: f.code, discount: Number(f.discount), minRoomTotal: f.minRoomTotal ? Number(f.minRoomTotal) : 0, validUntil: f.validUntil, maxUses: f.maxUses.trim() ? Number(f.maxUses) : null };
    try {
      if (editing) await api(`/api/admin/codes/${encodeURIComponent(editing)}`, { method: 'PATCH', body });
      else await api('/api/admin/codes', { body });
      setNotice({ kind: 'ok', text: `${f.code.toUpperCase()} · ${t.saved}` });
      setF(EMPTY); setEditing(null);
      await reload();
    } catch (e) {
      setNotice(noticeFrom(e, lang));
    }
  }
  async function toggle(c: Code) {
    try {
      await api(`/api/admin/codes/${encodeURIComponent(c.code)}`, { method: 'PATCH', body: { active: !c.active } });
      await reload();
    } catch (e) {
      setNotice(noticeFrom(e, lang));
    }
  }

  return (
    <>
      <PageHead title={t.codTitle} />
      <LoadError error={error} lang={lang} />
      <section className={styles.panel}>
        <h2>{editing ? `${t.edit} ${editing}` : t.newCode}</h2>
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); save(); }} data-testid="code-form">
          <div className="field"><label htmlFor="cf-code">{t.code}</label><input id="cf-code" className="input" required disabled={!!editing} value={f.code} onChange={(e) => setF({ ...f, code: e.target.value.toUpperCase() })} data-testid="code-code" /></div>
          <div className="field"><label htmlFor="cf-disc">{t.discount}</label><input id="cf-disc" className="input" inputMode="numeric" required value={f.discount} onChange={(e) => setF({ ...f, discount: e.target.value })} data-testid="code-discount" /></div>
          <div className="field"><label htmlFor="cf-min">{t.minSpend}</label><input id="cf-min" className="input" inputMode="numeric" value={f.minRoomTotal} onChange={(e) => setF({ ...f, minRoomTotal: e.target.value })} data-testid="code-min" /></div>
          <div className="field"><label htmlFor="cf-until">{t.validUntil}</label><input id="cf-until" type="date" className="input" required value={f.validUntil} onChange={(e) => setF({ ...f, validUntil: e.target.value })} data-testid="code-valid-until" /></div>
          <div className="field"><label htmlFor="cf-max">{t.maxUses}</label><input id="cf-max" className="input" inputMode="numeric" placeholder={t.unlimited} value={f.maxUses} onChange={(e) => setF({ ...f, maxUses: e.target.value })} data-testid="code-max-uses" /></div>
          <div className={styles.actionsRow}>
            <button className="btn btn-primary" type="submit" data-testid="code-save">{editing ? t.save : t.create}</button>
            {editing && <button className="btn btn-ghost" type="button" onClick={() => { setEditing(null); setF(EMPTY); }}>{t.cancel}</button>}
          </div>
        </form>
        <div style={{ marginTop: 12 }}><NoticeBox n={notice} testid="code-notice" /></div>
      </section>
      <div className="table-wrap">
        <table className="table" data-testid="codes-table">
          <thead><tr><th>{t.code}</th><th className="num">{t.discount}</th><th className="num">{t.minSpend}</th><th>{t.validUntil}</th><th className="num">{t.used}</th><th>{t.status}</th><th>{t.actions}</th></tr></thead>
          <tbody>
            {data?.codes.map((c) => (
              <tr key={c.code} data-testid={`code-row-${c.code}`}>
                <td><code>{c.code}</code></td>
                <td className="num">{bahtFmt(c.discount)}</td>
                <td className="num">{bahtFmt(c.minRoomTotal)}</td>
                <td>{fmtDate(c.validUntil, lang)}</td>
                <td className="num">{c.used}{c.maxUses !== null ? ` / ${c.maxUses}` : ''}</td>
                <td><span className={`badge ${c.active ? 'badge-ok' : 'badge-bad'}`} data-testid={`code-active-${c.code}`}>{c.active ? t.active : t.inactive}</span></td>
                <td>
                  <div className={styles.actionsRow} style={{ flexWrap: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" data-testid={`code-edit-${c.code}`}
                      onClick={() => { setEditing(c.code); setF({ code: c.code, discount: String(c.discount), minRoomTotal: String(c.minRoomTotal), validUntil: c.validUntil, maxUses: c.maxUses?.toString() ?? '' }); }}>{t.edit}</button>
                    <button className="btn btn-ghost btn-sm" onClick={() => toggle(c)} data-testid={`code-toggle-${c.code}`}>{c.active ? t.deactivate : t.activate}</button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </>
  );
}
