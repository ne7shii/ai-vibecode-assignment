'use client';
import { useState } from 'react';
import type { Lang } from '@/i18n';
import { api } from '@/lib/client/api';
import { fmtDate } from '@/lib/format';
import type { GuestRow } from '@/lib/services/admin/front';
import { bahtFmt, LoadError, noticeFrom, NoticeBox, PageHead, StatusBadge, useLoad, useT, type Notice } from './ui';
import styles from './admin.module.css';

interface Resp {
  date: string; today: string; arrivals: GuestRow[]; departures: GuestRow[]; inHouse: GuestRow[]; overdue: GuestRow[];
  freeRooms: Record<string, string[]>; counts: { arrivals: number; departures: number; inHouse: number };
}
type Tab = 'arrivals' | 'departures' | 'inHouse' | 'overdue';

export default function Arrivals({ lang }: { lang: Lang }) {
  const t = useT(lang);
  const [date, setDate] = useState('');
  const { data, error, reload } = useLoad<Resp>(`/api/admin/arrivals${date ? `?date=${date}` : ''}`);
  const [tab, setTab] = useState<Tab>('arrivals');
  const [rooms, setRooms] = useState<Record<string, string[]>>({});
  const [busy, setBusy] = useState('');
  const [notice, setNotice] = useState<Notice>(null);

  async function act(code: string, kind: 'check-in' | 'check-out' | 'no-show', g: GuestRow) {
    if (kind === 'no-show' && !window.confirm(t.confirmNoShow)) return;
    setBusy(`${kind}:${code}`);
    setNotice(null);
    try {
      const body = kind === 'check-in' ? { roomNos: g.rooms.map((r, i) => rooms[code]?.[i] ?? r.roomNo ?? '') } : {};
      const r = await api<{ pointsEarned: number }>(`/api/admin/bookings/${encodeURIComponent(code)}/${kind}`, { body });
      const msg = kind === 'check-in' ? t.checkedIn : kind === 'check-out' ? t.checkedOut : t.noShowDone;
      setNotice({ kind: 'ok', text: `${code} · ${msg}${kind === 'check-out' && r.pointsEarned ? ` · ${t.pointsEarned} +${r.pointsEarned}` : ''}` });
      await reload();
    } catch (e) {
      setNotice(noticeFrom(e, lang));
    } finally {
      setBusy('');
    }
  }

  const tabs: { k: Tab; label: string; n: number }[] = [
    { k: 'arrivals', label: t.tabArrivals, n: data?.arrivals.length ?? 0 },
    { k: 'departures', label: t.tabDepartures, n: data?.departures.length ?? 0 },
    { k: 'inHouse', label: t.tabInHouse, n: data?.inHouse.length ?? 0 },
    { k: 'overdue', label: t.tabOverdue, n: data?.overdue.length ?? 0 },
  ];
  const list = data ? data[tab] : [];

  return (
    <>
      <PageHead title={t.arrTitle}>
        <label className="sr-only" htmlFor="arr-date">{t.date}</label>
        <input id="arr-date" type="date" className="input" style={{ width: 170 }} value={date || data?.date || ''} onChange={(e) => setDate(e.target.value)} data-testid="arrivals-date" />
        <button className="btn btn-ghost btn-sm" onClick={() => setDate('')} data-testid="arrivals-today">{t.today}</button>
      </PageHead>
      <LoadError error={error} lang={lang} />
      <div className={styles.tabs} role="tablist">
        {tabs.map((x) => (
          <button key={x.k} role="tab" aria-selected={tab === x.k} className={`${styles.tab} ${tab === x.k ? styles.tabOn : ''}`} onClick={() => setTab(x.k)} data-testid={`arrivals-tab-${x.k}`}>
            {x.label} <span data-testid={`arrivals-count-${x.k}`}>({x.n})</span>
          </button>
        ))}
      </div>
      <NoticeBox n={notice} testid="arrivals-notice" />
      {tab === 'overdue' && <p className="muted small">{t.noShowHint}</p>}
      <div className={styles.guestList} data-testid="arrivals-list">
        {data && !list.length && <p className="muted" data-testid="arrivals-empty">{t.none}</p>}
        {list.map((g) => (
          <article key={g.code} className={styles.guest} data-testid={`guest-${g.code}`}>
            <div className={styles.guestTop}>
              <span>
                <span className={styles.guestName} data-testid="guest-name">{g.contactName}</span>{' '}
                {g.isMember && <span className="badge badge-gold">{t.member}</span>}
              </span>
              <span className="row" style={{ gap: 8 }}>
                <code data-testid="guest-code">{g.code}</code>
                <StatusBadge status={g.status} lang={lang} testid="guest-status" />
              </span>
            </div>
            <div className={styles.meta}>
              <span>{fmtDate(g.checkIn, lang)} – {fmtDate(g.checkOut, lang)} · {g.nights} {t.nights}</span>
              <span>{t.plan}: <b>{lang === 'en' ? g.planLabel.en : g.planLabel.th}</b></span>
              <span>{t.arrival}: <b data-testid="guest-arrival">{g.arrivalTime ?? '–'}</b></span>
              <span>{t.due}: <b data-testid="guest-due">{bahtFmt(g.dueAtHotel)}</b></span>
              {g.phone && <span>☎ {g.phone}</span>}
            </div>
            {g.rooms.map((r, i) => (
              <div key={r.id} className={styles.meta}>
                <span><b>{r.roomType}</b> {lang === 'en' ? r.nameEn : r.nameTh}</span>
                <span>{r.adults} {t.adults}{r.childAges.length ? ` + ${r.childAges.length} ${t.children} (${r.childAges.join(', ')})` : ''}</span>
                {r.roomNo && <span>{t.roomNo}: <b data-testid="guest-room-no">{r.roomNo}</b></span>}
                {g.canCheckIn && (
                  <label>
                    <span className="sr-only">{t.roomNo} {i + 1}</span>
                    <input className={`input ${styles.inlineInput}`} placeholder={t.roomNo} list={`free-${r.roomType}`}
                      value={rooms[g.code]?.[i] ?? r.roomNo ?? ''} data-testid={`checkin-room-${g.code}-${i}`}
                      onChange={(e) => setRooms((s) => { const arr = [...(s[g.code] ?? g.rooms.map((x) => x.roomNo ?? ''))]; arr[i] = e.target.value; return { ...s, [g.code]: arr }; })} />
                  </label>
                )}
              </div>
            ))}
            {g.rooms.some((r) => r.specialRequest) && (
              <div className={styles.req} data-testid="guest-request">{t.request}: {g.rooms.map((r) => r.specialRequest).filter(Boolean).join(' · ')}</div>
            )}
            {g.addons.length > 0 && (
              <div className={styles.meta}>{t.addonsShort}: {g.addons.map((a) => (
                <span key={a.id}>{lang === 'en' ? a.labelEn : a.labelTh} <StatusBadge status={a.status} lang={lang} /></span>
              ))}</div>
            )}
            <div className={styles.actionsRow}>
              {g.canCheckIn && <button className="btn btn-primary btn-sm" disabled={!!busy} onClick={() => act(g.code, 'check-in', g)} data-testid={`checkin-${g.code}`}>{t.checkIn}</button>}
              {g.canCheckOut && <button className="btn btn-gold btn-sm" disabled={!!busy} onClick={() => act(g.code, 'check-out', g)} data-testid={`checkout-${g.code}`}>{t.checkOut}</button>}
              {g.status === 'CONFIRMED' && (
                <button className="btn btn-ghost btn-sm" disabled={!!busy || !g.canNoShow} title={g.canNoShow ? '' : t.noShowHint} onClick={() => act(g.code, 'no-show', g)} data-testid={`noshow-${g.code}`}>{t.noShow}</button>
              )}
            </div>
          </article>
        ))}
      </div>
      {data && Object.entries(data.freeRooms).map(([type, nos]) => (
        <datalist key={type} id={`free-${type}`}>{nos.map((n) => <option key={n} value={n} />)}</datalist>
      ))}
    </>
  );
}
