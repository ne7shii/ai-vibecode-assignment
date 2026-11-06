'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { pick, type Lang } from '@/i18n';
import { booking, fill } from '@/i18n/booking';
import { api, msgOf } from '@/lib/client/api';
import { baht, fmtDate, fmtDateTime } from '@/lib/format';
import { RULES } from '@/lib/rules/stay';
import { Alert, PriceSummaryBar, Steps, useMe, type NightGroup } from './common';
import PriceCalendar from './PriceCalendar';
import GroupQuoteForm from './GroupQuoteForm';
import { labelOf, msgText, nameOf, seasonBadge, setToken, type MeMember, type PlanOption, type RoomReq, type SearchResponse, type SearchResultItem } from './shared';
import s from './booking.module.css';

export interface BookQuery { checkIn?: string; checkOut?: string; adults?: string; children?: string; room?: string }

type Pick = { roomType: string; key: string } | null;
const planKey = (p: PlanOption) => `${p.plan}|${p.nonref ? 1 : 0}|${p.festivalCode ?? ''}`;

function parseRoom(q: BookQuery): RoomReq {
  const adults = Math.min(4, Math.max(1, Number(q.adults) || 2));
  const childAges = (q.children ?? '').split(',').map((x) => x.trim()).filter((x) => x !== '').map((x) => (Number.isInteger(Number(x)) ? Number(x) : ''))
    .slice(0, 4) as (number | '')[];
  return { adults, childAges };
}

export default function BookSearch({ lang, query }: { lang: Lang; query: BookQuery }) {
  const t = pick(booking, lang);
  const router = useRouter();
  const { me } = useMe();
  const isMember = me?.kind === 'member';
  const memberVerified = me?.kind === 'member' && (me as MeMember).user.verified;

  const [today, setToday] = useState('');
  const [checkIn, setCheckIn] = useState(query.checkIn ?? '');
  const [checkOut, setCheckOut] = useState(query.checkOut ?? '');
  const [rooms, setRooms] = useState<RoomReq[]>([parseRoom(query)]);
  const [showCal, setShowCal] = useState(!query.checkIn);
  const [showGroup, setShowGroup] = useState(false);
  const [formErr, setFormErr] = useState('');
  const [apiErr, setApiErr] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<SearchResponse[] | null>(null);
  const [searched, setSearched] = useState<{ checkIn: string; checkOut: string; rooms: RoomReq[] } | null>(null);
  const [active, setActive] = useState(0);
  const [picks, setPicks] = useState<Pick[]>([]);
  const [holding, setHolding] = useState('');
  const resultsRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api<{ date: string }>('/api/clock').then((c) => setToday(c.date)).catch(() => setToday(new Date().toISOString().slice(0, 10)));
  }, []);

  const agesMissing = rooms.some((r) => r.childAges.some((a) => a === '' || a < 0 || a > 17));

  function validate(ci = checkIn, co = checkOut): string {
    if (!ci || !co) return t.datesMissing;
    if (co <= ci) return t.sameDay;
    if (agesMissing) return t.childAgesMissing;
    return '';
  }

  const runSearch = useCallback(async (ci: string, co: string, rs: RoomReq[], scroll = true) => {
    setApiErr('');
    setLoading(true);
    try {
      const res = await Promise.all(rs.map((r) =>
        api<SearchResponse>(`/api/search?checkIn=${ci}&checkOut=${co}&adults=${r.adults}&children=${r.childAges.join(',')}`)));
      setResults(res);
      setSearched({ checkIn: ci, checkOut: co, rooms: rs });
      setPicks(rs.map(() => null));
      setActive(0);
      const r0 = rs[0];
      const qs = new URLSearchParams({ checkIn: ci, checkOut: co, adults: String(r0.adults) });
      if (r0.childAges.length) qs.set('children', r0.childAges.join(','));
      if (query.room) qs.set('room', query.room);
      router.replace(`/${lang}/book?${qs}`, { scroll: false });
      if (scroll) setTimeout(() => resultsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 50);
    } catch (e) {
      setResults(null);
      setApiErr(msgOf(e, lang));
    } finally {
      setLoading(false);
    }
  }, [lang, router, query.room]);

  // Auto-search when arriving with ?checkIn&checkOut (home page, offers, "book again").
  const autoRan = useRef(false);
  useEffect(() => {
    if (autoRan.current) return;
    autoRan.current = true;
    if (query.checkIn && query.checkOut && !validate(query.checkIn, query.checkOut)) runSearch(query.checkIn, query.checkOut, rooms, false);
    else if (query.checkIn && query.checkOut) setFormErr(validate(query.checkIn, query.checkOut));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Member switched in the header → prices change (US-22 ข้อ 3).
  useEffect(() => {
    const again = () => { if (searched) runSearch(searched.checkIn, searched.checkOut, searched.rooms, false); };
    window.addEventListener('sj-user-changed', again);
    return () => window.removeEventListener('sj-user-changed', again);
  }, [searched, runSearch]);

  function submit(e: React.FormEvent) {
    e.preventDefault();
    const v = validate();
    setFormErr(v);
    if (v) return;
    runSearch(checkIn, checkOut, rooms);
  }

  function pickDay(d: string) {
    setFormErr('');
    if (!checkIn || checkOut) { setCheckIn(d); setCheckOut(''); return; }
    if (d === checkIn) { setFormErr(t.sameDay); return; }
    if (d < checkIn) { setCheckIn(d); return; }
    setCheckOut(d);
    if (!agesMissing) runSearch(checkIn, d, rooms);
  }

  function updateRoom(i: number, r: Partial<RoomReq>) {
    setRooms((rs) => rs.map((x, j) => (j === i ? { ...x, ...r } : x)));
  }
  function setChildren(i: number, n: number) {
    const cur = rooms[i].childAges;
    updateRoom(i, { childAges: n > cur.length ? [...cur, ...Array(n - cur.length).fill('')] : cur.slice(0, n) });
  }
  function addRoom() {
    if (rooms.length >= RULES.maxRoomsPerBooking) { setShowGroup(true); return; }
    setRooms([...rooms, { adults: 2, childAges: [] }]);
  }

  async function hold(sel: { roomType: string; plan: PlanOption }[]) {
    if (!searched) return;
    setApiErr('');
    setHolding(sel.map((x) => x.roomType).join(','));
    try {
      const p = sel[0].plan;
      const h = await api<{ code: string; holdToken: string }>('/api/holds', {
        body: {
          checkIn: searched.checkIn, checkOut: searched.checkOut,
          rooms: sel.map((x, i) => ({ roomType: x.roomType, adults: searched.rooms[i].adults, childAges: searched.rooms[i].childAges })),
          plan: p.plan, nonref: p.nonref, festivalCode: p.festivalCode,
        },
      });
      setToken(h.code, h.holdToken);
      router.push(`/${lang}/book/${h.code}`);
    } catch (e) {
      setApiErr(msgOf(e, lang));
      setHolding('');
    }
  }

  const multi = (searched?.rooms.length ?? 1) > 1;
  const lockedKey = picks[0]?.key ?? null;

  function choose(roomIdx: number, item: SearchResultItem, plan: PlanOption) {
    if (!multi) { hold([{ roomType: item.roomType.code, plan }]); return; }
    const next = [...picks];
    if (roomIdx === 0 && next[0]?.key !== planKey(plan)) for (let i = 1; i < next.length; i++) next[i] = null; // plan changed → others must re-pick
    next[roomIdx] = { roomType: item.roomType.code, key: planKey(plan) };
    setPicks(next);
    const nextOpen = next.findIndex((x) => !x);
    if (nextOpen >= 0) setActive(nextOpen);
  }

  function findPlan(roomIdx: number, pk: Pick) {
    if (!pk || !results) return null;
    const item = results[roomIdx].results.find((r) => r.roomType.code === pk.roomType);
    const plan = item?.plans.find((p) => planKey(p) === pk.key);
    return item && plan ? { item, plan } : null;
  }

  // Summary bar contents for step 1–2.
  const summary = useMemo(() => {
    if (!results || !searched) return null;
    const chosen = multi ? picks.map((pk, i) => findPlan(i, pk)) : [];
    if (multi && chosen.some((c) => c)) {
      const ok = chosen.filter((c): c is NonNullable<typeof c> => !!c);
      return {
        caption: t.total,
        total: ok.reduce((a, c) => a + c.plan.total, 0),
        groups: chosen.map((c, i): NightGroup | null => c && ({ title: `${fill(t.roomN, { n: i + 1 })} · ${nameOf(c.item.roomType, lang)}`, nights: c.item.nights.map((n) => ({ label: fmtDate(n.night, lang), season: n.season, price: n.price })) })).filter((g): g is NightGroup => !!g),
        lines: chosen.map((c, i) => c && { kind: 'ROOM', labelTh: `ห้องที่ ${i + 1} · ${c.item.roomType.nameTh} · ${c.plan.labelTh}`, labelEn: `Room ${i + 1} · ${c.item.roomType.nameEn} · ${c.plan.labelEn}`, amount: c.plan.total }).filter((l): l is NonNullable<typeof l> => !!l),
      };
    }
    let best: { item: SearchResultItem; plan: PlanOption } | null = null;
    for (const item of results[0].results) for (const plan of item.plans) if (!best || plan.total < best.plan.total) best = { item, plan };
    if (!best) return null;
    return {
      caption: `${t.fromPrice} · ${nameOf(best.item.roomType, lang)}`,
      total: best.plan.total,
      groups: [{ title: nameOf(best.item.roomType, lang), nights: best.item.nights.map((n) => ({ label: fmtDate(n.night, lang), season: n.season, price: n.price })) }],
      lines: [{ kind: 'PLAN', labelTh: `${best.item.roomType.nameTh} · ${best.plan.labelTh}`, labelEn: `${best.item.roomType.nameEn} · ${best.plan.labelEn}`, amount: best.plan.total }],
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [results, searched, picks, lang, multi]);

  const allPicked = multi && picks.length > 0 && picks.every((p) => p);
  const startMonth = (checkIn || today || '2027-03-01').slice(0, 7);
  const roomFilter = query.room;

  return (
    <div className={`container ${s.page}`} data-testid="book-page">
      <Steps lang={lang} current={results ? 2 : 1} />
      <h1>{t.bookTitle}</h1>
      <p className={s.lead}>{t.bookLead}</p>

      <form className={`card ${s.searchCard}`} onSubmit={submit} noValidate data-testid="search-form">
        <div className={s.dates}>
          <div className="field">
            <label htmlFor="checkIn">{t.checkIn}</label>
            <input id="checkIn" type="date" className="input" value={checkIn} min={today || undefined} onChange={(e) => { setCheckIn(e.target.value); setFormErr(''); }} data-testid="input-checkin" />
          </div>
          <div className="field">
            <label htmlFor="checkOut">{t.checkOut}</label>
            <input id="checkOut" type="date" className="input" value={checkOut} min={checkIn || today || undefined} onChange={(e) => { setCheckOut(e.target.value); setFormErr(''); }} data-testid="input-checkout" />
          </div>
        </div>
        {checkIn && checkOut && checkOut > checkIn && (
          <p className="small muted" style={{ margin: '6px 0 0' }} data-testid="nights-count">{fill(t.nightsN, { n: Math.round((Date.parse(checkOut) - Date.parse(checkIn)) / 86400000) })}</p>
        )}

        {rooms.map((r, i) => (
          <div key={i} className={s.roomBlock} data-testid={`room-block-${i + 1}`}>
            {(rooms.length > 1 || i > 0) && (
              <div className={s.roomHead}>
                <strong>{fill(t.roomN, { n: i + 1 })}</strong>
                {i > 0 && <button type="button" className="btn btn-ghost btn-sm" onClick={() => setRooms(rooms.filter((_, j) => j !== i))} data-testid={`remove-room-${i + 1}`}>{t.removeRoom}</button>}
              </div>
            )}
            <div className={s.counters}>
              <Counter label={t.adults} value={r.adults} min={1} max={4} onChange={(v) => updateRoom(i, { adults: v })} testId={`adults-${i + 1}`} />
              <Counter label={t.children} value={r.childAges.length} min={0} max={4} onChange={(v) => setChildren(i, v)} testId={`children-${i + 1}`} />
            </div>
            {r.childAges.length > 0 && (
              <>
                <div className={s.ages}>
                  {r.childAges.map((a, k) => (
                    <div className="field" key={k}>
                      <label htmlFor={`age-${i}-${k}`}>{fill(t.childAge, { n: k + 1 })}</label>
                      <input id={`age-${i}-${k}`} className="input" type="number" inputMode="numeric" min={0} max={17} placeholder={t.childAgePh} value={a}
                        onChange={(e) => {
                          const v = e.target.value === '' ? '' : Math.max(0, Math.min(17, Math.floor(Number(e.target.value))));
                          updateRoom(i, { childAges: r.childAges.map((x, j) => (j === k ? v : x)) as (number | '')[] });
                        }}
                        aria-invalid={a === ''} data-testid={`child-age-${i + 1}-${k + 1}`} />
                    </div>
                  ))}
                </div>
                <p className="small muted" style={{ margin: 0 }}>{t.childAgeHint}</p>
              </>
            )}
          </div>
        ))}

        {agesMissing && <p className={s.err} data-testid="msg-child-ages">{t.childAgesMissing}</p>}
        {formErr && formErr !== t.childAgesMissing && <p className={s.err} role="alert" data-testid="msg-form-error">{formErr}</p>}

        <div className={s.formActions}>
          <button type="button" className="btn btn-ghost" onClick={addRoom} data-testid="add-room">{t.addRoom}</button>
          <button type="button" className="btn btn-ghost" onClick={() => setShowCal(!showCal)} aria-expanded={showCal} data-testid="toggle-calendar">📅 {showCal ? t.hideCalendar : t.showCalendar}</button>
          <button type="submit" className="btn btn-primary" disabled={loading || agesMissing} data-testid="search-submit">{loading ? t.searching : t.search}</button>
        </div>
        <p className="small muted" style={{ margin: '8px 0 0' }}>{t.maxRooms}</p>
      </form>

      {showGroup && (
        <GroupQuoteForm lang={lang} checkIn={checkIn} checkOut={checkOut} onClose={() => setShowGroup(false)} />
      )}

      {showCal && today && (
        <PriceCalendar lang={lang} today={today} startMonth={startMonth} adults={rooms[0].adults}
          childAges={rooms[0].childAges.filter((a): a is number => a !== '')} checkIn={checkIn} checkOut={checkOut} onPick={pickDay} />
      )}

      <div ref={resultsRef} style={{ scrollMarginTop: 80 }} />
      {apiErr && <div style={{ marginTop: 16 }}><Alert testId="msg-api-error">{apiErr}</Alert></div>}

      {results && searched && (
        <section className={s.results} aria-live="polite" data-testid="results">
          {multi && (
            <>
              <Alert kind="info" testId="multi-hint">
                {t.multiPick}
                {lockedKey && findPlan(0, picks[0]) && <><br /><strong>{fill(t.multiPlanLocked, { p: labelOf(findPlan(0, picks[0])!.plan, lang) })}</strong></>}
              </Alert>
              <div className={s.tabs} role="tablist">
                {searched.rooms.map((r, i) => (
                  <button key={i} type="button" role="tab" aria-selected={active === i} className={`${s.tab} ${active === i ? s.on : ''}`} onClick={() => setActive(i)} data-testid={`room-tab-${i + 1}`}>
                    {picks[i] ? '✓ ' : ''}{fill(t.roomN, { n: i + 1 })} · {fill(t.guestsSummary, { a: r.adults, c: r.childAges.length ? fill(t.guestsChildren, { c: r.childAges.length }) : '' })}
                  </button>
                ))}
              </div>
            </>
          )}
          {(() => {
            const res = results[multi ? active : 0];
            if (!res.results.length) {
              return (
                <div className="card card-body" data-testid="no-rooms">
                  <h3>{msgText(res.message, lang) || t.noRooms}</h3>
                  {res.suggestions.length > 0 && (
                    <>
                      <p className="muted" style={{ margin: 0 }}>{t.tryDates}</p>
                      <div className={s.chips}>
                        {res.suggestions.map((sg) => (
                          <button key={sg.checkIn} type="button" className={s.chip} data-testid={`suggestion-${sg.checkIn}`}
                            onClick={() => { setCheckIn(sg.checkIn); setCheckOut(sg.checkOut); runSearch(sg.checkIn, sg.checkOut, searched.rooms); }}>
                            {fmtDate(sg.checkIn, lang)} – {fmtDate(sg.checkOut, lang)}
                          </button>
                        ))}
                      </div>
                    </>
                  )}
                </div>
              );
            }
            const items = [...res.results].sort((a, b) => (a.roomType.code === roomFilter ? -1 : b.roomType.code === roomFilter ? 1 : 0));
            const roomIdx = multi ? active : 0;
            return (
              <>
                <p className="muted" style={{ margin: 0 }} data-testid="results-count">
                  {fill(t.resultsTitle, { n: items.length })} · {fmtDate(res.checkIn, lang)} – {fmtDate(res.checkOut, lang)} · {fill(t.nightsN, { n: res.nights })}
                </p>
                {items.map((item) => (
                  <RoomResult key={item.roomType.code} lang={lang} item={item} nights={res.nights} isMember={isMember} memberVerified={memberVerified}
                    highlight={item.roomType.code === roomFilter}
                    filterKey={multi && roomIdx > 0 ? lockedKey : null}
                    picked={multi ? picks[roomIdx] : null}
                    busy={!!holding} holdingThis={holding.split(',').includes(item.roomType.code) && !multi}
                    onChoose={(plan) => choose(roomIdx, item, plan)} />
                ))}
              </>
            );
          })()}
        </section>
      )}

      <PriceSummaryBar lang={lang} total={summary?.total ?? null} caption={summary?.caption} lines={summary?.lines} nightGroups={summary?.groups}
        emptyText={results ? t.chooseRoomHint : `${t.step1} · ${t.bookLead}`}
        action={multi ? (
          <button type="button" className="btn btn-primary" disabled={!allPicked || !!holding} data-testid="multi-continue"
            onClick={() => hold(picks.map((pk, i) => { const f = findPlan(i, pk)!; return { roomType: f.item.roomType.code, plan: f.plan }; }))}>
            {holding ? t.holding : allPicked ? t.continueMulti : t.pickAllRooms}
          </button>
        ) : undefined} />
    </div>
  );
}

function Counter({ label, value, min, max, onChange, testId }: { label: string; value: number; min: number; max: number; onChange: (v: number) => void; testId: string }) {
  return (
    <div className={s.counter} role="group" aria-label={label}>
      <span>{label}</span>
      <div className="row" style={{ gap: 4, flexWrap: 'nowrap' }}>
        <button type="button" className={s.stepBtn} onClick={() => onChange(value - 1)} disabled={value <= min} aria-label={`${label} −`} data-testid={`${testId}-minus`}>−</button>
        <output aria-live="polite" data-testid={`${testId}-value`}>{value}</output>
        <button type="button" className={s.stepBtn} onClick={() => onChange(value + 1)} disabled={value >= max} aria-label={`${label} +`} data-testid={`${testId}-plus`}>+</button>
      </div>
    </div>
  );
}

function RoomResult(p: {
  lang: Lang; item: SearchResultItem; nights: number; isMember: boolean; memberVerified: boolean; highlight: boolean;
  filterKey: string | null; picked: Pick; busy: boolean; holdingThis: boolean; onChoose: (plan: PlanOption) => void;
}) {
  const t = pick(booking, p.lang);
  const { item, lang } = p;
  const rt = item.roomType;
  const seasons = [...new Set(item.nights.map((n) => n.season))];
  const plans = p.filterKey ? item.plans.filter((x) => planKey(x) === p.filterKey) : item.plans;
  const code = rt.code;
  return (
    <article className={`card ${s.roomCard}`} style={p.highlight ? { outline: '3px solid var(--gold)' } : undefined} data-testid={`room-result-${code}`}>
      <div className={s.roomPhoto}>
        {rt.photos[0] && <img src={rt.photos[0].file} alt={lang === 'en' ? rt.photos[0].captionEn : rt.photos[0].captionTh} loading="lazy" />}
        <div className={s.badges}>
          {seasons.map((se) => <span key={se} className={seasonBadge(se)} data-testid={`season-badge-${code}-${se}`}>{t[se]}</span>)}
          {item.lowStock && <span className="badge badge-bad" data-testid={`low-stock-${code}`}>{fill(t.lowStock, { n: item.left })}</span>}
        </div>
      </div>
      <div className={s.roomBody}>
        <h3>{nameOf(rt, lang)}</h3>
        <div className={s.facts}>
          <span data-testid={`size-${code}`}>{fill(t.sizeSqm, { n: rt.sizeSqm })}</span>
          <span>{lang === 'en' ? rt.bedEn : rt.bedTh}</span>
          <span>{lang === 'en' ? rt.viewEn : rt.viewTh}</span>
          <span>{fill(t.maxGuests, { a: rt.maxAdults, t: rt.maxTotal })}</span>
        </div>
        {item.needsExtraBed && <div className="alert alert-warn small" data-testid={`extra-bed-${code}`}>🛏️ {t.extraBed}</div>}
        <details className={s.more} data-testid={`nightly-${code}`}>
          <summary data-testid={`nightly-toggle-${code}`}>{t.nightly}</summary>
          <table className={s.nightTable}>
            <tbody>
              {item.nights.map((n) => (
                <tr key={n.night} data-testid={`nightly-row-${code}-${n.night}`}>
                  <td>{fmtDate(n.night, lang)} <span className={seasonBadge(n.season)}>{t[n.season]}</span></td>
                  <td>{baht(n.price)}</td>
                </tr>
              ))}
              {item.needsExtraBed && <tr><td>{t.extraBed}</td><td>{baht(800 * item.nights.length)}</td></tr>}
            </tbody>
          </table>
        </details>
        <div className="small muted">{t.plans}</div>
        <ul className={s.planList}>
          {plans.map((pl) => {
            const k = planKey(pl);
            const picked = p.picked?.roomType === code && p.picked.key === k;
            const tid = `${code}-${pl.plan}${pl.nonref ? '-NR' : ''}${pl.festivalCode ? `-${pl.festivalCode}` : ''}`;
            return (
              <li key={k} className={`${s.planRow} ${picked ? s.picked : ''}`} data-testid={`plan-${tid}`}>
                <div style={{ minWidth: 0 }}>
                  <div className={s.planName}>{labelOf(pl, lang)}</div>
                  <div className={s.planMeta}>
                    {pl.refundable
                      ? <span className="badge badge-ok" data-testid={`refundable-${tid}`}>{pl.freeCancelUntil ? fill(t.freeCancelUntil, { d: fmtDateTime(pl.freeCancelUntil, lang) }) : t.refundable}</span>
                      : <span className="badge badge-bad" data-testid={`nonref-${tid}`}>{t.nonref}</span>}
                    {pl.pricePromo && <span className="badge badge-gold" data-testid={`promo-${tid}`}>{lang === 'en' ? pl.pricePromo.nameEn : pl.pricePromo.nameTh}</span>}
                    {p.memberVerified && <span className="badge" data-testid={`member-applied-${tid}`}>{t.memberApplied}</span>}
                  </div>
                </div>
                <div className={s.planPrice}>
                  {pl.saved > 0 && <s>{baht(pl.total + pl.saved)}</s>}
                  <strong data-testid={`price-${tid}`}>{baht(pl.total)}</strong>
                  <small>{fill(t.totalFor, { n: p.nights })} · {baht(pl.perNight)}{t.perNightShort}</small>
                </div>
                <div className={s.planActions}>
                  <div style={{ display: 'grid', gap: 2 }}>
                    {pl.saved > 0 && <span className={s.save} data-testid={`saved-${tid}`}>{fill(t.save, { x: baht(pl.saved) })}</span>}
                    {!p.isMember && pl.memberPrice !== null && pl.memberPrice < pl.total && (
                      <Link href={`/${lang}/account/register`} className={s.memberHint} data-testid={`member-hint-${tid}`}>{fill(t.memberHint, { x: baht(pl.memberPrice) })}</Link>
                    )}
                  </div>
                  <button type="button" className={`btn ${picked ? 'btn-gold' : 'btn-primary'} btn-sm`} disabled={p.busy} onClick={() => p.onChoose(pl)} data-testid={`choose-${tid}`}>
                    {p.holdingThis ? t.holding : picked ? `✓ ${t.chosen}` : t.choose}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </div>
    </article>
  );
}
