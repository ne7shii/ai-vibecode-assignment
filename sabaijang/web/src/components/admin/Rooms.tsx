'use client';
import { useEffect, useState } from 'react';
import type { Lang } from '@/i18n';
import { api } from '@/lib/client/api';
import { fmtDate } from '@/lib/format';
import { LoadError, noticeFrom, NoticeBox, PageHead, useLoad, useT, type Notice } from './ui';
import styles from './admin.module.css';

interface Closure { id: number; roomNo: string; roomType: string; from: string; to: string; reason: string }
interface Room { roomNo: string; roomType: string; nameTh: string; nameEn: string }
interface RoomType {
  code: string; nameTh: string; nameEn: string; descTh: string; descEn: string; bedTh: string; bedEn: string; viewTh: string; viewEn: string;
  amenities: string[]; amenitiesEn: string[]; photos: { sort: number; file: string; captionTh: string; captionEn: string }[];
}
type Edit = Omit<RoomType, 'amenities' | 'amenitiesEn' | 'code'> & { amenities: string; amenitiesEn: string };

const TEXTS: [keyof Edit, 'nameTh' | 'nameEn' | 'descTh' | 'descEn' | 'bedTh' | 'bedEn' | 'viewTh' | 'viewEn', boolean][] = [
  ['nameTh', 'nameTh', false], ['nameEn', 'nameEn', false], ['bedTh', 'bedTh', false], ['bedEn', 'bedEn', false],
  ['viewTh', 'viewTh', false], ['viewEn', 'viewEn', false], ['descTh', 'descTh', true], ['descEn', 'descEn', true],
];

export default function Rooms({ lang }: { lang: Lang }) {
  const t = useT(lang);
  const cl = useLoad<{ closures: Closure[]; rooms: Room[] }>('/api/admin/closures');
  const rt = useLoad<{ roomTypes: RoomType[] }>('/api/admin/room-types');
  const [f, setF] = useState({ roomNo: '', from: '', to: '', reason: '' });
  const [notice, setNotice] = useState<Notice>(null);
  const [code, setCode] = useState('R01');
  const [edit, setEdit] = useState<Edit | null>(null);
  const [cNotice, setCNotice] = useState<Notice>(null);

  useEffect(() => {
    const r = rt.data?.roomTypes.find((x) => x.code === code);
    if (r) setEdit({ ...r, amenities: r.amenities.join(', '), amenitiesEn: r.amenitiesEn.join(', ') });
  }, [rt.data, code]);

  async function close() {
    setNotice(null);
    try {
      await api('/api/admin/closures', { body: f });
      setNotice({ kind: 'ok', text: `${t.closeRoom} ${f.roomNo} · ${t.saved}` });
      setF({ roomNo: '', from: '', to: '', reason: '' });
      await cl.reload();
    } catch (e) {
      const n = noticeFrom(e, lang);
      setNotice(n && n.extra?.length ? { ...n, text: `${n.text}` } : n);
    }
  }
  async function reopen(c: Closure) {
    try {
      await api(`/api/admin/closures/${c.id}`, { method: 'DELETE' });
      setNotice({ kind: 'ok', text: `${t.reopen} ${c.roomNo} · ${t.saved}` });
      await cl.reload();
    } catch (e) {
      setNotice(noticeFrom(e, lang));
    }
  }
  async function saveContent() {
    if (!edit) return;
    setCNotice(null);
    const split = (s: string) => s.split(',').map((x) => x.trim()).filter(Boolean);
    try {
      await api(`/api/admin/room-types/${code}`, {
        method: 'PATCH',
        body: {
          nameTh: edit.nameTh, nameEn: edit.nameEn, descTh: edit.descTh, descEn: edit.descEn, bedTh: edit.bedTh, bedEn: edit.bedEn, viewTh: edit.viewTh, viewEn: edit.viewEn,
          amenities: split(edit.amenities), amenitiesEn: split(edit.amenitiesEn),
          photos: edit.photos.map((p) => ({ sort: p.sort, captionTh: p.captionTh, captionEn: p.captionEn })),
        },
      });
      setCNotice({ kind: 'ok', text: `${code} · ${t.saved}` });
      await rt.reload();
    } catch (e) {
      setCNotice(noticeFrom(e, lang));
    }
  }

  const byType = (cl.data?.rooms ?? []).reduce<Record<string, Room[]>>((a, r) => { (a[r.roomType] ??= []).push(r); return a; }, {});
  return (
    <>
      <PageHead title={t.romTitle} />
      <LoadError error={cl.error ?? rt.error} lang={lang} />
      <section className={styles.panel} data-testid="closures-panel">
        <h2>{t.closuresTitle}</h2>
        <form className={styles.form} onSubmit={(e) => { e.preventDefault(); close(); }}>
          <div className="field"><label htmlFor="cl-room">{t.room}</label>
            <select id="cl-room" className="input" required value={f.roomNo} onChange={(e) => setF({ ...f, roomNo: e.target.value })} data-testid="closure-room">
              <option value="">—</option>
              {Object.entries(byType).map(([type, rooms]) => (
                <optgroup key={type} label={`${type} ${lang === 'en' ? rooms[0].nameEn : rooms[0].nameTh}`}>
                  {rooms.map((r) => <option key={r.roomNo} value={r.roomNo}>{r.roomNo}</option>)}
                </optgroup>
              ))}
            </select></div>
          <div className="field"><label htmlFor="cl-from">{t.from}</label><input id="cl-from" type="date" className="input" required value={f.from} onChange={(e) => setF({ ...f, from: e.target.value })} data-testid="closure-from" /></div>
          <div className="field"><label htmlFor="cl-to">{t.to}</label><input id="cl-to" type="date" className="input" required value={f.to} onChange={(e) => setF({ ...f, to: e.target.value })} data-testid="closure-to" /></div>
          <div className="field"><label htmlFor="cl-reason">{t.reason}</label><input id="cl-reason" className="input" value={f.reason} onChange={(e) => setF({ ...f, reason: e.target.value })} data-testid="closure-reason" /></div>
          <button className="btn btn-primary" type="submit" data-testid="closure-submit">{t.closeRoom}</button>
        </form>
        <div style={{ marginTop: 12 }}><NoticeBox n={notice} testid="closure-notice" /></div>
        <div className="table-wrap" style={{ marginTop: 12 }}>
          <table className="table" data-testid="closures-table">
            <thead><tr><th>{t.room}</th><th>{t.roomType}</th><th>{t.from}</th><th>{t.to}</th><th>{t.reason}</th><th>{t.actions}</th></tr></thead>
            <tbody>
              {cl.data?.closures.map((c) => (
                <tr key={c.id} data-testid={`closure-${c.id}`}>
                  <td><b>{c.roomNo}</b></td><td>{c.roomType}</td><td>{fmtDate(c.from, lang)}</td><td>{fmtDate(c.to, lang)}</td><td>{c.reason || '–'}</td>
                  <td><button className="btn btn-ghost btn-sm" onClick={() => reopen(c)} data-testid={`closure-reopen-${c.id}`}>{t.reopen}</button></td>
                </tr>
              ))}
              {cl.data && !cl.data.closures.length && <tr><td colSpan={6} className="muted">{t.none}</td></tr>}
            </tbody>
          </table>
        </div>
      </section>

      <section className={styles.panel} data-testid="roomtype-panel">
        <div className={styles.panelHead}>
          <h2>{t.contentTitle}</h2>
          <select className="input" style={{ width: 'auto' }} value={code} onChange={(e) => setCode(e.target.value)} aria-label={t.roomType} data-testid="roomtype-select">
            {rt.data?.roomTypes.map((r) => <option key={r.code} value={r.code}>{r.code} · {lang === 'en' ? r.nameEn : r.nameTh}</option>)}
          </select>
        </div>
        {edit && (
          <form className={styles.form} onSubmit={(e) => { e.preventDefault(); saveContent(); }}>
            {TEXTS.map(([key, label, long]) => (
              <div key={key} className={`field ${long ? styles.formWide : ''}`}>
                <label htmlFor={`rt-${key}`}>{t[label]}</label>
                {long
                  ? <textarea id={`rt-${key}`} className="input" rows={2} value={String(edit[key])} onChange={(e) => setEdit({ ...edit, [key]: e.target.value })} data-testid={`roomtype-${key}`} />
                  : <input id={`rt-${key}`} className="input" value={String(edit[key])} onChange={(e) => setEdit({ ...edit, [key]: e.target.value })} data-testid={`roomtype-${key}`} />}
              </div>
            ))}
            <div className={`field ${styles.formWide}`}><label htmlFor="rt-am">{t.amenitiesTh}</label><input id="rt-am" className="input" value={edit.amenities} onChange={(e) => setEdit({ ...edit, amenities: e.target.value })} data-testid="roomtype-amenities" /></div>
            <div className={`field ${styles.formWide}`}><label htmlFor="rt-amen">{t.amenitiesEn}</label><input id="rt-amen" className="input" value={edit.amenitiesEn} onChange={(e) => setEdit({ ...edit, amenitiesEn: e.target.value })} data-testid="roomtype-amenities-en" /></div>
            <div className={styles.formWide}>
              <h3>{t.photos}</h3>
              <div className="stack">
                {edit.photos.map((p, i) => (
                  <div key={p.sort} className="row" style={{ alignItems: 'center' }} data-testid={`roomtype-photo-${p.sort}`}>
                    <img src={p.file} alt="" style={{ width: 72, height: 54, objectFit: 'cover', borderRadius: 8 }} />
                    <input className="input" style={{ flex: '1 1 160px' }} aria-label={`${t.captionTh} ${p.sort}`} value={p.captionTh}
                      onChange={(e) => setEdit({ ...edit, photos: edit.photos.map((x, j) => (j === i ? { ...x, captionTh: e.target.value } : x)) })} data-testid={`roomtype-caption-th-${p.sort}`} />
                    <input className="input" style={{ flex: '1 1 160px' }} aria-label={`${t.captionEn} ${p.sort}`} value={p.captionEn}
                      onChange={(e) => setEdit({ ...edit, photos: edit.photos.map((x, j) => (j === i ? { ...x, captionEn: e.target.value } : x)) })} data-testid={`roomtype-caption-en-${p.sort}`} />
                  </div>
                ))}
              </div>
            </div>
            <div className={styles.formWide}><button className="btn btn-primary" type="submit" data-testid="roomtype-save">{t.save}</button></div>
          </form>
        )}
        <div style={{ marginTop: 12 }}><NoticeBox n={cNotice} testid="roomtype-notice" /></div>
      </section>
    </>
  );
}
