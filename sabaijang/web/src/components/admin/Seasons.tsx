'use client';
import { useEffect, useState } from 'react';
import type { Lang } from '@/i18n';
import { api } from '@/lib/client/api';
import { fmtDate, fmtMonth } from '@/lib/format';
import { bahtFmt, LoadError, noticeFrom, NoticeBox, PageHead, useLoad, useT, type Notice } from './ui';
import styles from './admin.module.css';

type Kind = 'LOW' | 'HIGH' | 'PEAK';
interface Season { id: number; kind: Kind; start: string; end: string; label: string }
interface RatesResp { roomTypes: { code: string; nameTh: string; nameEn: string }[]; rates: Record<string, Record<Kind, number>> }
interface Day { date: string; season: Kind | null; price: number | null; seasonPrice: number | null; override: boolean }
interface DateRatesResp { overrides: { roomType: string; night: string; price: number }[]; calendar: { month: string; roomType: string; days: Day[] } | null }
const KINDS: Kind[] = ['LOW', 'HIGH', 'PEAK'];

function shiftMonth(m: string, n: number) {
  const [y, mo] = m.split('-').map(Number);
  const d = new Date(Date.UTC(y, mo - 1 + n, 1));
  return d.toISOString().slice(0, 7);
}

export default function Seasons({ lang }: { lang: Lang }) {
  const t = useT(lang);
  const seasons = useLoad<{ seasons: Season[]; today: string; windowEnd: string }>('/api/admin/seasons');
  const rates = useLoad<RatesResp>('/api/admin/rates');
  const [month, setMonth] = useState('');
  const [calType, setCalType] = useState('R01');
  const cal = useLoad<DateRatesResp>(month ? `/api/admin/date-rates?month=${month}&roomType=${calType}` : null);
  const [notice, setNotice] = useState<Notice>(null);
  const [rows, setRows] = useState<Season[]>([]);
  const [draft, setDraft] = useState({ kind: 'PEAK' as Kind, start: '', end: '', label: '' });
  const [rateDraft, setRateDraft] = useState<Record<string, Record<Kind, string>>>({});
  const [ov, setOv] = useState({ roomType: 'R01', from: '', to: '', price: '' });

  useEffect(() => { if (seasons.data) setRows(seasons.data.seasons); }, [seasons.data]);
  useEffect(() => { if (!month && seasons.data) setMonth(seasons.data.today.slice(0, 7)); }, [seasons.data, month]);
  useEffect(() => {
    if (!rates.data) return;
    const d: Record<string, Record<Kind, string>> = {};
    for (const rt of rates.data.roomTypes) d[rt.code] = { LOW: String(rates.data.rates[rt.code]?.LOW ?? ''), HIGH: String(rates.data.rates[rt.code]?.HIGH ?? ''), PEAK: String(rates.data.rates[rt.code]?.PEAK ?? '') };
    setRateDraft(d);
  }, [rates.data]);

  async function run(fn: () => Promise<unknown>, after: () => Promise<unknown>) {
    setNotice(null);
    try {
      await fn();
      setNotice({ kind: 'ok', text: t.saved });
      await after();
    } catch (e) {
      setNotice(noticeFrom(e, lang));
    }
  }
  const refreshSeasons = () => Promise.all([seasons.reload(), cal.reload()]);
  const setRow = (id: number, p: Partial<Season>) => setRows((rs) => rs.map((r) => (r.id === id ? { ...r, ...p } : r)));

  return (
    <>
      <PageHead title={t.seaTitle} />
      <NoticeBox n={notice} testid="seasons-notice" />
      <LoadError error={seasons.error ?? rates.error} lang={lang} />

      <section className={styles.panel} data-testid="seasons-panel">
        <h2>{t.seasonsList}</h2>
        <p className="muted small">{t.windowNote}{seasons.data ? ` (${fmtDate(seasons.data.today, lang)} – ${fmtDate(seasons.data.windowEnd, lang)})` : ''}</p>
        <div className="table-wrap">
          <table className="table" data-testid="seasons-table">
            <thead><tr><th>{t.season}</th><th>{t.from}</th><th>{t.to}</th><th>{t.label}</th><th>{t.actions}</th></tr></thead>
            <tbody>
              {rows.map((s) => (
                <tr key={s.id} data-testid={`season-row-${s.id}`}>
                  <td>
                    <select className="input" value={s.kind} onChange={(e) => setRow(s.id, { kind: e.target.value as Kind })} data-testid={`season-kind-${s.id}`} aria-label={t.season}>
                      {KINDS.map((k) => <option key={k} value={k}>{k}</option>)}
                    </select>
                  </td>
                  <td><input type="date" className="input" value={s.start} onChange={(e) => setRow(s.id, { start: e.target.value })} data-testid={`season-start-${s.id}`} aria-label={t.from} /></td>
                  <td><input type="date" className="input" value={s.end} onChange={(e) => setRow(s.id, { end: e.target.value })} data-testid={`season-end-${s.id}`} aria-label={t.to} /></td>
                  <td><input className="input" value={s.label} onChange={(e) => setRow(s.id, { label: e.target.value })} data-testid={`season-label-${s.id}`} aria-label={t.label} /></td>
                  <td>
                    <div className={styles.actionsRow} style={{ flexWrap: 'nowrap' }}>
                      <button className="btn btn-primary btn-sm" data-testid={`season-save-${s.id}`}
                        onClick={() => run(() => api(`/api/admin/seasons/${s.id}`, { method: 'PATCH', body: { kind: s.kind, start: s.start, end: s.end, label: s.label } }), refreshSeasons)}>{t.save}</button>
                      <button className="btn btn-ghost btn-sm" data-testid={`season-delete-${s.id}`}
                        onClick={() => window.confirm(t.confirmDelete) && run(() => api(`/api/admin/seasons/${s.id}`, { method: 'DELETE' }), refreshSeasons)}>{t.delete}</button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <h3 style={{ marginTop: 16 }}>{t.addSeason}</h3>
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); run(() => api('/api/admin/seasons', { body: draft }), async () => { setDraft({ ...draft, start: '', end: '', label: '' }); await refreshSeasons(); }); }}>
          <div className="field"><label htmlFor="ns-kind">{t.season}</label>
            <select id="ns-kind" className="input" value={draft.kind} onChange={(e) => setDraft({ ...draft, kind: e.target.value as Kind })} data-testid="new-season-kind">{KINDS.map((k) => <option key={k}>{k}</option>)}</select></div>
          <div className="field"><label htmlFor="ns-start">{t.from}</label><input id="ns-start" type="date" className="input" required value={draft.start} onChange={(e) => setDraft({ ...draft, start: e.target.value })} data-testid="new-season-start" /></div>
          <div className="field"><label htmlFor="ns-end">{t.to}</label><input id="ns-end" type="date" className="input" required value={draft.end} onChange={(e) => setDraft({ ...draft, end: e.target.value })} data-testid="new-season-end" /></div>
          <div className="field"><label htmlFor="ns-label">{t.label}</label><input id="ns-label" className="input" value={draft.label} onChange={(e) => setDraft({ ...draft, label: e.target.value })} data-testid="new-season-label" /></div>
          <button className="btn btn-primary" type="submit" data-testid="new-season-submit">{t.add}</button>
        </form>
      </section>

      <section className={styles.panel} data-testid="rates-panel">
        <h2>{t.ratesTitle}</h2>
        <p className="muted small">{t.ratesNote}</p>
        <div className="table-wrap">
          <table className="table" data-testid="rates-table">
            <thead><tr><th>{t.roomType}</th>{KINDS.map((k) => <th key={k} className="num">{k}</th>)}</tr></thead>
            <tbody>
              {rates.data?.roomTypes.map((rt) => (
                <tr key={rt.code}>
                  <td><b>{rt.code}</b> {lang === 'en' ? rt.nameEn : rt.nameTh}</td>
                  {KINDS.map((k) => (
                    <td key={k} className="num">
                      <input className={`input ${styles.priceInput}`} inputMode="numeric" aria-label={`${rt.code} ${k}`} value={rateDraft[rt.code]?.[k] ?? ''}
                        onChange={(e) => setRateDraft((d) => ({ ...d, [rt.code]: { ...d[rt.code], [k]: e.target.value } }))} data-testid={`rate-${rt.code}-${k}`} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div style={{ marginTop: 12 }}>
          <button className="btn btn-primary" data-testid="rates-save" onClick={() => run(() => api('/api/admin/rates', {
            method: 'PUT',
            body: { rates: Object.entries(rateDraft).flatMap(([roomType, v]) => KINDS.map((kind) => ({ roomType, kind, price: Number(v[kind]) }))) },
          }), () => Promise.all([rates.reload(), cal.reload()]))}>{t.saveRates}</button>
        </div>
      </section>

      <section className={styles.panel} data-testid="calendar-panel">
        <div className={styles.panelHead}>
          <h2>{t.calTitle} · {month ? fmtMonth(month, lang) : ''}</h2>
          <div className={styles.actionsRow}>
            <button className="btn btn-ghost btn-sm" onClick={() => setMonth(shiftMonth(month, -1))} data-testid="cal-prev">{t.prevMonth}</button>
            <button className="btn btn-ghost btn-sm" onClick={() => setMonth(shiftMonth(month, 1))} data-testid="cal-next">{t.nextMonth}</button>
            <select className="input" style={{ width: 'auto' }} value={calType} onChange={(e) => setCalType(e.target.value)} aria-label={t.roomType} data-testid="cal-roomtype">
              {rates.data?.roomTypes.map((rt) => <option key={rt.code} value={rt.code}>{rt.code}</option>)}
            </select>
          </div>
        </div>
        <div className={styles.legend}>
          <span><span className={`${styles.swatch} ${styles.dLOW}`} />{t.LOW}</span>
          <span><span className={`${styles.swatch} ${styles.dHIGH}`} />{t.HIGH}</span>
          <span><span className={`${styles.swatch} ${styles.dPEAK}`} />{t.PEAK}</span>
          <span><span className={`${styles.swatch} ${styles.dOverride}`} />{t.legendOverride}</span>
        </div>
        <div className={styles.cal} data-testid="rate-calendar" style={{ marginTop: 10 }}>
          {(lang === 'en' ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['จ', 'อ', 'พ', 'พฤ', 'ศ', 'ส', 'อา']).map((d) => <div key={d} className={styles.calHead}>{d}</div>)}
          {cal.data?.calendar && Array.from({ length: (new Date(`${cal.data.calendar.month}-01T00:00:00Z`).getUTCDay() + 6) % 7 }).map((_, i) => <div key={`b${i}`} />)}
          {cal.data?.calendar?.days.map((d) => (
            <div key={d.date} className={`${styles.day} ${styles[`d${d.season ?? 'NONE'}`]} ${d.override ? styles.dOverride : ''}`}
              data-testid={`cal-day-${d.date}`} data-season={d.season ?? 'NONE'} data-override={d.override ? '1' : '0'} title={`${d.season ?? '—'}${d.override ? ` · ${t.legendOverride}` : ''}`}>
              <span className={styles.dayNum}>{Number(d.date.slice(8))}</span>
              <span className={styles.dayPrice}>{d.price ? bahtFmt(d.price) : '—'}</span>
            </div>
          ))}
        </div>

        <h3 style={{ marginTop: 16 }}>{t.overrideTitle}</h3>
        <form className={styles.form} onSubmit={(e) => {
          e.preventDefault();
          run(() => api('/api/admin/date-rates', { method: 'PUT', body: { roomType: ov.roomType, from: ov.from, to: ov.to || undefined, price: Number(ov.price) } }), () => cal.reload());
        }}>
          <div className="field"><label htmlFor="ov-rt">{t.roomType}</label>
            <select id="ov-rt" className="input" value={ov.roomType} onChange={(e) => setOv({ ...ov, roomType: e.target.value })} data-testid="override-roomtype">
              {rates.data?.roomTypes.map((rt) => <option key={rt.code} value={rt.code}>{rt.code}</option>)}
            </select></div>
          <div className="field"><label htmlFor="ov-from">{t.from}</label><input id="ov-from" type="date" className="input" required value={ov.from} onChange={(e) => setOv({ ...ov, from: e.target.value })} data-testid="override-from" /></div>
          <div className="field"><label htmlFor="ov-to">{t.to}</label><input id="ov-to" type="date" className="input" value={ov.to} onChange={(e) => setOv({ ...ov, to: e.target.value })} data-testid="override-to" /></div>
          <div className="field"><label htmlFor="ov-price">{t.price}</label><input id="ov-price" className="input" inputMode="numeric" required value={ov.price} onChange={(e) => setOv({ ...ov, price: e.target.value })} data-testid="override-price" /></div>
          <button className="btn btn-primary" type="submit" data-testid="override-submit">{t.setOverride}</button>
        </form>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table" data-testid="overrides-table">
            <thead><tr><th>{t.date}</th><th>{t.roomType}</th><th className="num">{t.price}</th><th>{t.actions}</th></tr></thead>
            <tbody>
              {cal.data?.overrides.map((o) => (
                <tr key={`${o.roomType}-${o.night}`} data-testid={`override-${o.roomType}-${o.night}`}>
                  <td>{fmtDate(o.night, lang)}</td><td>{o.roomType}</td><td className="num">{bahtFmt(o.price)}</td>
                  <td><button className="btn btn-ghost btn-sm" data-testid={`override-delete-${o.roomType}-${o.night}`}
                    onClick={() => run(() => api(`/api/admin/date-rates?roomType=${o.roomType}&night=${o.night}`, { method: 'DELETE' }), () => cal.reload())}>{t.removeOverride}</button></td>
                </tr>
              ))}
              {cal.data && !cal.data.overrides.length && <tr><td colSpan={4} className="muted">{t.none}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>
    </>
  );
}
