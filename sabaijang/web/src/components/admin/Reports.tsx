'use client';
import { useState } from 'react';
import type { Lang } from '@/i18n';
import { fmtDate, fmtMonth } from '@/lib/format';
import type { Report } from '@/lib/services/admin/reports';
import { bahtFmt, LoadError, PageHead, useLoad, useT } from './ui';
import styles from './admin.module.css';

const pct = (r: number) => `${(r * 100).toFixed(1)}%`;

export default function Reports({ lang }: { lang: Lang }) {
  const t = useT(lang);
  const [range, setRange] = useState({ from: '', to: '' });
  const [applied, setApplied] = useState({ from: '', to: '' });
  const qs = applied.from && applied.to ? `?from=${applied.from}&to=${applied.to}` : '';
  const { data, error, loading } = useLoad<Report>(`/api/admin/reports${qs}`);
  const from = range.from || data?.from || '';
  const to = range.to || data?.to || '';
  const maxOcc = Math.max(0.01, ...(data?.occupancy.daily.map((d) => d.rate) ?? [0]));
  const maxRev = Math.max(1, ...(data?.revenue.bySeason.map((s) => s.revenue) ?? [1]));
  const maxPromo = Math.max(1, ...(data?.promotions.map((p) => p.discount) ?? [1]), ...(data?.codes.map((c) => c.discount) ?? [1]));

  return (
    <>
      <PageHead title={t.repTitle}>
        <a className="btn btn-gold btn-sm" href={`/api/admin/reports/export?from=${data?.from ?? ''}&to=${data?.to ?? ''}`} data-testid="report-download">⬇ {t.download}</a>
      </PageHead>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); setApplied({ from, to }); }}>
        <div className="field"><label htmlFor="rp-from">{t.from}</label><input id="rp-from" type="date" className="input" value={from} onChange={(e) => setRange({ ...range, from: e.target.value, to })} data-testid="report-from" /></div>
        <div className="field"><label htmlFor="rp-to">{t.to}</label><input id="rp-to" type="date" className="input" value={to} onChange={(e) => setRange({ ...range, to: e.target.value, from })} data-testid="report-to" /></div>
        <button className="btn btn-primary" type="submit" disabled={loading} data-testid="report-run">{t.run}</button>
      </form>
      <LoadError error={error} lang={lang} />
      {data && (
        <>
          <section className={styles.panel} data-testid="report-occupancy">
            <h2>{t.occupancy} · {fmtDate(data.from, lang)} – {fmtDate(data.to, lang)}</h2>
            <h3>{t.occDaily}</h3>
            <div className={styles.colChart} role="img" aria-label={t.occDaily} data-testid="report-occ-chart">
              {data.occupancy.daily.map((d) => (
                <div key={d.date} className={styles.col} style={{ height: `${Math.max(2, (d.rate / maxOcc) * 100)}%` }} title={`${d.date} · ${pct(d.rate)} (${d.sold}/${d.total})`} />
              ))}
            </div>
            <div className={styles.colLabels}><span>{fmtDate(data.from, lang)}</span><span>{fmtDate(data.to, lang)}</span></div>
            <h3 style={{ marginTop: 16 }}>{t.occMonthly}</h3>
            <div className="table-wrap">
              <table className="table" data-testid="report-occ-monthly">
                <thead><tr><th>{t.month}</th>{data.roomTypes.map((r) => <th key={r.code} className="num">{r.code}</th>)}<th className="num">{t.total}</th></tr></thead>
                <tbody>
                  {data.occupancy.monthly.map((m) => (
                    <tr key={m.month}>
                      <td>{fmtMonth(m.month, lang)}</td>
                      {data.roomTypes.map((r) => <td key={r.code} className="num">{m.byType[r.code] ? `${pct(m.byType[r.code].rate)}` : '–'}<div className="muted small">{m.byType[r.code] ? `${m.byType[r.code].sold}/${m.byType[r.code].total}` : ''}</div></td>)}
                      <td className="num"><b>{pct(m.rate)}</b></td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <details style={{ marginTop: 12 }}>
              <summary data-testid="report-daily-toggle">{t.occDaily} ({data.occupancy.daily.length})</summary>
              <div className="table-wrap" style={{ marginTop: 8, maxHeight: 360, overflow: 'auto' }}>
                <table className="table" data-testid="report-occ-daily">
                  <thead><tr><th>{t.date}</th>{data.roomTypes.map((r) => <th key={r.code} className="num">{r.code}</th>)}<th className="num">{t.total}</th></tr></thead>
                  <tbody>
                    {data.occupancy.daily.map((d) => (
                      <tr key={d.date}><td>{d.date}</td>{data.roomTypes.map((r) => <td key={r.code} className="num">{d.byType[r.code] ? `${d.byType[r.code].sold}/${d.byType[r.code].total}` : '–'}</td>)}<td className="num">{pct(d.rate)}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </details>
          </section>

          <div className={styles.split}>
            <section className={styles.panel} data-testid="report-revenue">
              <h2>{t.revenue}</h2>
              <div className={styles.bars}>
                {data.revenue.bySeason.map((s) => (
                  <div key={s.season} className={styles.barRow}>
                    <span>{s.season}</span>
                    <span className={styles.barTrack}><span className={styles.bar} style={{ width: `${(s.revenue / maxRev) * 100}%`, display: 'block' }} /></span>
                    <span className="num small">{bahtFmt(s.revenue)}</span>
                  </div>
                ))}
              </div>
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="table">
                  <thead><tr><th>{t.season}</th><th className="num">{t.roomNights}</th><th className="num">{t.revenueAmt}</th><th className="num">{t.adr}</th></tr></thead>
                  <tbody>
                    {data.revenue.bySeason.map((s) => <tr key={s.season} data-testid={`report-season-${s.season}`}><td>{s.season}</td><td className="num">{s.roomNights}</td><td className="num">{bahtFmt(s.revenue)}</td><td className="num">{bahtFmt(s.adr)}</td></tr>)}
                    <tr><td><b>{t.total}</b></td><td className="num"><b>{data.revenue.total.roomNights}</b></td><td className="num"><b>{bahtFmt(data.revenue.total.revenue)}</b></td><td className="num"><b>{bahtFmt(data.revenue.total.adr)}</b></td></tr>
                  </tbody>
                </table>
              </div>
              <h3 style={{ marginTop: 12 }}>{t.revenueType}</h3>
              <div className="table-wrap">
                <table className="table">
                  <thead><tr><th>{t.roomType}</th><th className="num">{t.roomNights}</th><th className="num">{t.revenueAmt}</th><th className="num">{t.adr}</th></tr></thead>
                  <tbody>{data.revenue.byRoomType.map((s) => <tr key={s.roomType}><td>{s.roomType}</td><td className="num">{s.roomNights}</td><td className="num">{bahtFmt(s.revenue)}</td><td className="num">{bahtFmt(s.adr)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>

            <section className={styles.panel} data-testid="report-promos">
              <h2>{t.promoUsage}</h2>
              <div className={styles.bars}>
                {data.promotions.filter((p) => p.bookings).map((p) => (
                  <div key={p.code} className={styles.barRow}>
                    <span>{p.code}</span>
                    <span className={styles.barTrack}><span className={`${styles.bar} ${styles.barGold}`} style={{ width: `${(p.discount / maxPromo) * 100}%`, display: 'block' }} /></span>
                    <span className="num small">{bahtFmt(p.discount)}</span>
                  </div>
                ))}
              </div>
              <div className="table-wrap" style={{ marginTop: 12 }}>
                <table className="table" data-testid="report-promo-table">
                  <thead><tr><th>{t.code}</th><th>{t.name}</th><th className="num">{t.bookings}</th><th className="num">{t.discountTotal}</th></tr></thead>
                  <tbody>{data.promotions.map((p) => <tr key={p.code}><td><code>{p.code}</code></td><td>{lang === 'en' ? p.nameEn : p.nameTh}</td><td className="num">{p.bookings}</td><td className="num">{bahtFmt(p.discount)}</td></tr>)}</tbody>
                </table>
              </div>
              <h3 style={{ marginTop: 12 }}>{t.codeUsage}</h3>
              <div className="table-wrap">
                <table className="table" data-testid="report-code-table">
                  <thead><tr><th>{t.code}</th><th className="num">{t.bookings}</th><th className="num">{t.discountTotal}</th></tr></thead>
                  <tbody>{data.codes.map((c) => <tr key={c.code} data-testid={`report-code-${c.code}`}><td><code>{c.code}</code></td><td className="num">{c.bookings}</td><td className="num">{bahtFmt(c.discount)}</td></tr>)}</tbody>
                </table>
              </div>
            </section>
          </div>
        </>
      )}
    </>
  );
}
