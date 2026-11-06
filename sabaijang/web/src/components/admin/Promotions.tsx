'use client';
import { useState } from 'react';
import type { Lang } from '@/i18n';
import { api } from '@/lib/client/api';
import { bkk } from '@/lib/clock';
import { fmtDate } from '@/lib/format';
import { bahtFmt, LoadError, noticeFrom, NoticeBox, PageHead, useLoad, useT, type Notice } from './ui';
import styles from './admin.module.css';

type Grp = 'PRICE' | 'STACK' | 'PLAN';
interface Rules { minLeadDays?: number; maxLeadDays?: number; minNights?: number; noPeak?: boolean; roomTypes?: string[]; stayFrom?: string; stayTo?: string; saleFrom?: string; saleTo?: string; bookFrom?: string; bookTo?: string; blackout?: string[]; flash?: boolean; birthday?: boolean; every?: number; allSeasons?: string[] }
interface Promo { code: string; grp: Grp; kind: string; nameTh: string; nameEn: string; descTh: string; descEn: string; value: number; rules: Rules; quota: number | null; used: number; memberOnly: boolean; active: boolean; image: string | null; sort: number }
interface Preview { eligible: boolean; reason: { th: string; en: string } | null; baseRoomTotal: number; before: { total: number; roomTotal: number }; after: { total: number; roomTotal: number; lines: { kind: string; labelTh: string; labelEn: string; amount: number }[] }; saved: number }

const KINDS: Record<Grp, string[]> = { PRICE: ['PERCENT', 'AMOUNT', 'FREE_NIGHT'], STACK: ['PERCENT'], PLAN: ['GREEN', 'HONEYMOON', 'FAMILY_SUMMER', 'FESTIVAL'] };
const ROOMS = ['R01', 'R02', 'R03', 'R04', 'R05', 'R06'];

interface Form {
  code: string; grp: Grp; kind: string; nameTh: string; nameEn: string; descTh: string; descEn: string; value: string;
  stayFrom: string; stayTo: string; bookFrom: string; bookTo: string; saleFrom: string; saleTo: string;
  minNights: string; minLeadDays: string; maxLeadDays: string; roomTypes: string[]; blackout: string; quota: string;
  memberOnly: boolean; active: boolean; noPeak: boolean; flash: boolean; extra: Rules;
}
const EMPTY: Form = { code: '', grp: 'PRICE', kind: 'PERCENT', nameTh: '', nameEn: '', descTh: '', descEn: '', value: '', stayFrom: '', stayTo: '', bookFrom: '', bookTo: '', saleFrom: '', saleTo: '', minNights: '', minLeadDays: '', maxLeadDays: '', roomTypes: [], blackout: '', quota: '', memberOnly: false, active: true, noPeak: false, flash: false, extra: {} };

const toLocal = (iso?: string) => { if (!iso) return ''; const p = bkk(new Date(iso)); return `${p.date}T${p.time}`; };
const fromLocal = (v: string) => (v ? `${v}:00+07:00` : undefined);
const num = (v: string) => (v.trim() === '' ? undefined : Number(v));

function toForm(p: Promo): Form {
  const r = p.rules;
  const { minLeadDays, maxLeadDays, minNights, noPeak, roomTypes, stayFrom, stayTo, saleFrom, saleTo, bookFrom, bookTo, blackout, flash, ...extra } = r;
  return {
    code: p.code, grp: p.grp, kind: p.kind, nameTh: p.nameTh, nameEn: p.nameEn, descTh: p.descTh, descEn: p.descEn, value: String(p.value),
    stayFrom: stayFrom ?? '', stayTo: stayTo ?? '', bookFrom: bookFrom ?? '', bookTo: bookTo ?? '', saleFrom: toLocal(saleFrom), saleTo: toLocal(saleTo),
    minNights: minNights?.toString() ?? '', minLeadDays: minLeadDays?.toString() ?? '', maxLeadDays: maxLeadDays?.toString() ?? '',
    roomTypes: roomTypes ?? [], blackout: (blackout ?? []).join(', '), quota: p.quota?.toString() ?? '',
    memberOnly: p.memberOnly, active: p.active, noPeak: !!noPeak, flash: !!flash, extra,
  };
}

function toBody(f: Form) {
  return {
    code: f.code, grp: f.grp, kind: f.kind, nameTh: f.nameTh, nameEn: f.nameEn, descTh: f.descTh, descEn: f.descEn, value: Number(f.value || 0),
    rules: {
      ...f.extra,
      stayFrom: f.stayFrom || undefined, stayTo: f.stayTo || undefined, bookFrom: f.bookFrom || undefined, bookTo: f.bookTo || undefined,
      saleFrom: fromLocal(f.saleFrom), saleTo: fromLocal(f.saleTo),
      minNights: num(f.minNights), minLeadDays: num(f.minLeadDays), maxLeadDays: num(f.maxLeadDays),
      roomTypes: f.roomTypes.length ? f.roomTypes : undefined,
      blackout: f.blackout.split(/[,\s]+/).map((s) => s.trim()).filter(Boolean),
      noPeak: f.noPeak || undefined, flash: f.flash || undefined,
    },
    quota: f.quota.trim() === '' ? null : Number(f.quota), memberOnly: f.memberOnly, active: f.active,
  };
}

export default function Promotions({ lang }: { lang: Lang }) {
  const t = useT(lang);
  const tt = t as unknown as Record<string, string>;
  const { data, error, reload } = useLoad<{ promotions: Promo[] }>('/api/admin/promotions');
  const [form, setForm] = useState<Form | null>(null);
  const [editing, setEditing] = useState<string | null>(null);
  const [notice, setNotice] = useState<Notice>(null);
  const [pv, setPv] = useState({ code: 'PR-01', roomType: 'R01', checkIn: '', checkOut: '' });
  const [preview, setPreview] = useState<Preview | null>(null);
  const [pvNotice, setPvNotice] = useState<Notice>(null);
  const set = (p: Partial<Form>) => setForm((f) => ({ ...(f ?? EMPTY), ...p }));

  async function save() {
    if (!form) return;
    setNotice(null);
    try {
      if (editing) await api(`/api/admin/promotions/${encodeURIComponent(editing)}`, { method: 'PATCH', body: toBody(form) });
      else await api('/api/admin/promotions', { body: toBody(form) });
      setNotice({ kind: 'ok', text: `${form.code.toUpperCase()} · ${t.saved}` });
      setForm(null); setEditing(null);
      await reload();
    } catch (e) {
      setNotice(noticeFrom(e, lang));
    }
  }

  async function toggle(p: Promo) {
    try {
      await api(`/api/admin/promotions/${encodeURIComponent(p.code)}`, { method: 'PATCH', body: { active: !p.active } });
      setNotice({ kind: 'ok', text: `${p.code} · ${p.active ? t.inactive : t.active}` });
      await reload();
    } catch (e) {
      setNotice(noticeFrom(e, lang));
    }
  }

  async function runPreview(useDraft: boolean) {
    setPvNotice(null);
    setPreview(null);
    try {
      const body = useDraft && form ? { promotion: toBody(form), roomType: pv.roomType, checkIn: pv.checkIn, checkOut: pv.checkOut } : { code: pv.code, roomType: pv.roomType, checkIn: pv.checkIn, checkOut: pv.checkOut };
      setPreview(await api<Preview>('/api/admin/promotions/preview', { body }));
    } catch (e) {
      setPvNotice(noticeFrom(e, lang));
    }
  }

  const f = form;
  return (
    <>
      <PageHead title={t.proTitle}>
        <button className="btn btn-primary btn-sm" onClick={() => { setForm({ ...EMPTY }); setEditing(null); }} data-testid="promo-new">{t.newPromo}</button>
      </PageHead>
      <LoadError error={error} lang={lang} />
      <NoticeBox n={notice} testid="promo-notice" />

      {f && (
        <section className={styles.panel} data-testid="promo-form">
          <h2>{editing ? `${t.editPromo} ${editing}` : t.newPromo}</h2>
          <form className={styles.form} onSubmit={(e) => { e.preventDefault(); save(); }}>
            <div className="field"><label htmlFor="pf-code">{t.code}</label><input id="pf-code" className="input" required disabled={!!editing} value={f.code} onChange={(e) => set({ code: e.target.value.toUpperCase() })} data-testid="promo-code" /></div>
            <div className="field"><label htmlFor="pf-grp">{t.group}</label>
              <select id="pf-grp" className="input" value={f.grp} onChange={(e) => set({ grp: e.target.value as Grp, kind: KINDS[e.target.value as Grp][0] })} data-testid="promo-grp">
                {(['PRICE', 'STACK', 'PLAN'] as Grp[]).map((g) => <option key={g} value={g}>{tt[`grp_${g}`]}</option>)}
              </select></div>
            <div className="field"><label htmlFor="pf-kind">{t.kind}</label>
              <select id="pf-kind" className="input" value={f.kind} onChange={(e) => set({ kind: e.target.value })} data-testid="promo-kind">
                {KINDS[f.grp].map((k) => <option key={k} value={k}>{tt[`kind_${k}`]}</option>)}
              </select></div>
            <div className="field"><label htmlFor="pf-value">{t.value}{f.kind === 'PERCENT' ? ' (%)' : ' (฿)'}</label><input id="pf-value" className="input" inputMode="decimal" required value={f.value} onChange={(e) => set({ value: e.target.value })} data-testid="promo-value" /></div>
            <div className="field"><label htmlFor="pf-nth">{t.nameTh}</label><input id="pf-nth" className="input" required value={f.nameTh} onChange={(e) => set({ nameTh: e.target.value })} data-testid="promo-name-th" /></div>
            <div className="field"><label htmlFor="pf-nen">{t.nameEn}</label><input id="pf-nen" className="input" required value={f.nameEn} onChange={(e) => set({ nameEn: e.target.value })} data-testid="promo-name-en" /></div>
            <div className={`field ${styles.formWide}`}><label htmlFor="pf-dth">{t.descTh}</label><textarea id="pf-dth" className="input" rows={2} value={f.descTh} onChange={(e) => set({ descTh: e.target.value })} data-testid="promo-desc-th" /></div>
            <div className={`field ${styles.formWide}`}><label htmlFor="pf-den">{t.descEn}</label><textarea id="pf-den" className="input" rows={2} value={f.descEn} onChange={(e) => set({ descEn: e.target.value })} data-testid="promo-desc-en" /></div>
            <div className="field"><label htmlFor="pf-sf">{t.stayFrom}</label><input id="pf-sf" type="date" className="input" value={f.stayFrom} onChange={(e) => set({ stayFrom: e.target.value })} data-testid="promo-stay-from" /></div>
            <div className="field"><label htmlFor="pf-st">{t.stayTo}</label><input id="pf-st" type="date" className="input" value={f.stayTo} onChange={(e) => set({ stayTo: e.target.value })} data-testid="promo-stay-to" /></div>
            <div className="field"><label htmlFor="pf-bf">{t.bookFrom}</label><input id="pf-bf" type="date" className="input" value={f.bookFrom} onChange={(e) => set({ bookFrom: e.target.value })} data-testid="promo-book-from" /></div>
            <div className="field"><label htmlFor="pf-bt">{t.bookTo}</label><input id="pf-bt" type="date" className="input" value={f.bookTo} onChange={(e) => set({ bookTo: e.target.value })} data-testid="promo-book-to" /></div>
            <div className="field"><label htmlFor="pf-salef">{t.saleFrom}</label><input id="pf-salef" type="datetime-local" className="input" value={f.saleFrom} onChange={(e) => set({ saleFrom: e.target.value })} data-testid="promo-sale-from" /></div>
            <div className="field"><label htmlFor="pf-salet">{t.saleTo}</label><input id="pf-salet" type="datetime-local" className="input" value={f.saleTo} onChange={(e) => set({ saleTo: e.target.value })} data-testid="promo-sale-to" /></div>
            <div className="field"><label htmlFor="pf-mn">{t.minNights}</label><input id="pf-mn" className="input" inputMode="numeric" value={f.minNights} onChange={(e) => set({ minNights: e.target.value })} data-testid="promo-min-nights" /></div>
            <div className="field"><label htmlFor="pf-mnl">{t.minLead}</label><input id="pf-mnl" className="input" inputMode="numeric" value={f.minLeadDays} onChange={(e) => set({ minLeadDays: e.target.value })} data-testid="promo-min-lead" /></div>
            <div className="field"><label htmlFor="pf-mxl">{t.maxLead}</label><input id="pf-mxl" className="input" inputMode="numeric" value={f.maxLeadDays} onChange={(e) => set({ maxLeadDays: e.target.value })} data-testid="promo-max-lead" /></div>
            <div className="field"><label htmlFor="pf-q">{t.quota}</label><input id="pf-q" className="input" inputMode="numeric" value={f.quota} onChange={(e) => set({ quota: e.target.value })} data-testid="promo-quota" /></div>
            <div className={`field ${styles.formWide}`}><label htmlFor="pf-bo">{t.blackout}</label><input id="pf-bo" className="input" placeholder="2027-12-31, 2028-01-01" value={f.blackout} onChange={(e) => set({ blackout: e.target.value })} data-testid="promo-blackout" /></div>
            <fieldset className={`${styles.formWide} ${styles.checks}`} style={{ border: 0, padding: 0, margin: 0 }}>
              <legend className="small" style={{ fontWeight: 600, color: 'var(--sea-deep)', marginBottom: 4 }}>{t.roomsIncluded}</legend>
              {ROOMS.map((r) => (
                <label key={r}><input type="checkbox" checked={f.roomTypes.includes(r)} onChange={(e) => set({ roomTypes: e.target.checked ? [...f.roomTypes, r] : f.roomTypes.filter((x) => x !== r) })} data-testid={`promo-room-${r}`} />{r}</label>
              ))}
            </fieldset>
            <div className={`${styles.formWide} ${styles.checks}`}>
              <label><input type="checkbox" checked={f.memberOnly} onChange={(e) => set({ memberOnly: e.target.checked })} data-testid="promo-member-only" />{t.memberOnly}</label>
              <label><input type="checkbox" checked={f.noPeak} onChange={(e) => set({ noPeak: e.target.checked })} data-testid="promo-no-peak" />{t.noPeak}</label>
              <label><input type="checkbox" checked={f.flash} onChange={(e) => set({ flash: e.target.checked })} data-testid="promo-flash" />{t.flash}</label>
              <label><input type="checkbox" checked={f.active} onChange={(e) => set({ active: e.target.checked })} data-testid="promo-active" />{t.active}</label>
            </div>
            <div className={`${styles.formWide} ${styles.actionsRow}`}>
              <button className="btn btn-primary" type="submit" data-testid="promo-save">{t.save}</button>
              <button className="btn btn-ghost" type="button" onClick={() => runPreview(true)} data-testid="promo-preview-draft">{t.preview}</button>
              <button className="btn btn-ghost" type="button" onClick={() => { setForm(null); setEditing(null); }} data-testid="promo-cancel">{t.cancel}</button>
            </div>
          </form>
        </section>
      )}

      <section className={styles.panel} data-testid="promo-preview">
        <h2>{t.previewTitle}</h2>
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); runPreview(false); }}>
          <div className="field"><label htmlFor="pv-code">{t.code}</label>
            <select id="pv-code" className="input" value={pv.code} onChange={(e) => setPv({ ...pv, code: e.target.value })} data-testid="preview-code">
              {data?.promotions.map((p) => <option key={p.code} value={p.code}>{p.code} · {lang === 'en' ? p.nameEn : p.nameTh}</option>)}
            </select></div>
          <div className="field"><label htmlFor="pv-rt">{t.roomType}</label>
            <select id="pv-rt" className="input" value={pv.roomType} onChange={(e) => setPv({ ...pv, roomType: e.target.value })} data-testid="preview-roomtype">{ROOMS.map((r) => <option key={r}>{r}</option>)}</select></div>
          <div className="field"><label htmlFor="pv-in">{t.checkInDate}</label><input id="pv-in" type="date" className="input" required value={pv.checkIn} onChange={(e) => setPv({ ...pv, checkIn: e.target.value })} data-testid="preview-checkin" /></div>
          <div className="field"><label htmlFor="pv-out">{t.checkOutDate}</label><input id="pv-out" type="date" className="input" required value={pv.checkOut} onChange={(e) => setPv({ ...pv, checkOut: e.target.value })} data-testid="preview-checkout" /></div>
          <button className="btn btn-primary" type="submit" data-testid="preview-run">{t.preview}</button>
        </form>
        <NoticeBox n={pvNotice} testid="preview-notice" />
        {preview && (
          <div className="stack" style={{ marginTop: 12 }} data-testid="preview-result" data-eligible={preview.eligible ? '1' : '0'}>
            {!preview.eligible && <div className="alert alert-warn" data-testid="preview-not-eligible">{t.notEligible}: {lang === 'en' ? preview.reason?.en : preview.reason?.th}</div>}
            <div className={styles.stats}>
              <div className={styles.stat}><span className={styles.statLabel}>{t.before}</span><span className={styles.statNum} data-testid="preview-before">{bahtFmt(preview.before.total)}</span></div>
              <div className={styles.stat}><span className={styles.statLabel}>{t.after}</span><span className={styles.statNum} data-testid="preview-after">{bahtFmt(preview.after.total)}</span></div>
              <div className={styles.stat}><span className={styles.statLabel}>{t.youSave}</span><span className={styles.statNum} data-testid="preview-saved">{bahtFmt(preview.saved)}</span></div>
            </div>
            <div className="table-wrap"><table className="table"><tbody>
              {preview.after.lines.map((l, i) => <tr key={i}><td>{lang === 'en' ? l.labelEn : l.labelTh}</td><td className="num">{bahtFmt(l.amount)}</td></tr>)}
            </tbody></table></div>
          </div>
        )}
      </section>

      <div className="table-wrap">
        <table className="table" data-testid="promo-table">
          <thead><tr><th>{t.code}</th><th>{t.name}</th><th>{t.group}</th><th className="num">{t.value}</th><th>{t.stayFrom} – {t.stayTo}</th><th className="num">{t.used}</th><th>{t.status}</th><th>{t.actions}</th></tr></thead>
          <tbody>
            {data?.promotions.map((p) => (
              <tr key={p.code} data-testid={`promo-row-${p.code}`}>
                <td><code>{p.code}</code></td>
                <td>{lang === 'en' ? p.nameEn : p.nameTh}{p.rules.flash ? <> <span className="badge badge-warn">Flash</span></> : null}{p.memberOnly ? <> <span className="badge badge-gold">{t.member}</span></> : null}</td>
                <td className="small">{p.grp}</td>
                <td className="num">{p.kind === 'PERCENT' ? `${p.value}%` : p.kind === 'FREE_NIGHT' ? `${p.rules.every ?? p.value}→${(p.rules.every ?? p.value) - 1}` : bahtFmt(p.value)}</td>
                <td className="small">{p.rules.stayFrom ? fmtDate(p.rules.stayFrom, lang) : '–'} – {p.rules.stayTo ? fmtDate(p.rules.stayTo, lang) : '–'}</td>
                <td className="num">{p.quota !== null ? `${p.used}/${p.quota}` : p.used || '–'}</td>
                <td><span className={`badge ${p.active ? 'badge-ok' : 'badge-bad'}`} data-testid={`promo-active-${p.code}`}>{p.active ? t.active : t.inactive}</span></td>
                <td>
                  <div className={styles.actionsRow} style={{ flexWrap: 'nowrap' }}>
                    <button className="btn btn-ghost btn-sm" onClick={() => { setForm(toForm(p)); setEditing(p.code); window.scrollTo({ top: 0, behavior: 'smooth' }); }} data-testid={`promo-edit-${p.code}`}>{t.edit}</button>
                    <button className={`btn btn-sm ${p.active ? 'btn-ghost' : 'btn-primary'}`} onClick={() => toggle(p)} data-testid={`promo-toggle-${p.code}`}>{p.active ? t.deactivate : t.activate}</button>
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
