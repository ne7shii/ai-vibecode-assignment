'use client';
import { useEffect, useState } from 'react';
import type { Lang } from '@/i18n';
import { fill, tp } from '@/i18n/public';
import { api } from '@/lib/client/api';
import { fmtDate } from '@/lib/format';
import s from './public.module.css';

type Scores = { room: number; service: number; clean: number; location: number };
export interface Review {
  id: number; roomType: string; authorName: string; authorPhoto: string | null; scores: Scores; avg: number;
  body: string; lang: string; createdAt: string; reply: { body: string; staffName: string; createdAt: string } | null;
}
interface Summary { count: number; avg: number; room: number; service: number; clean: number; location: number }
type RoomName = { code: string; name: string };

export function Stars({ value, label }: { value: number; label?: string }) {
  const full = Math.round(value);
  return (
    <span className={s.stars} role="img" aria-label={label ?? `${value.toFixed(1)} / 5`}>
      {'★'.repeat(full)}<span className={s.starsOff}>{'★'.repeat(Math.max(0, 5 - full))}</span>
    </span>
  );
}

const bkkDate = (iso: string) => new Date(Date.parse(iso) + 7 * 3600_000).toISOString().slice(0, 10);

function ReviewCard({ r, lang, rooms }: { r: Review; lang: Lang; rooms: RoomName[] }) {
  const t = tp(lang);
  const room = rooms.find((x) => x.code === r.roomType)?.name ?? r.roomType;
  return (
    <article className={s.rev} data-testid={`review-${r.id}`}>
      <div className={s.revHead}>
        {r.authorPhoto ? <img className={s.avatar} src={r.authorPhoto} alt="" /> : <span className={s.avatarEmpty}>{r.authorName.slice(0, 1)}</span>}
        <div style={{ minWidth: 0 }}>
          <div className={s.revName}>{r.authorName}</div>
          <div className="small muted">{t.stayedIn} {room} · {fmtDate(bkkDate(r.createdAt), lang)}</div>
        </div>
      </div>
      <div className="row" style={{ gap: 8 }}>
        <Stars value={r.avg} />
        <strong style={{ color: 'var(--sea-deep)' }}>{r.avg.toFixed(1)}</strong>
      </div>
      <p className={s.revBody} lang={r.lang}>“{r.body}”</p>
      <div className="small muted">
        {t.catRoom} {r.scores.room} · {t.catService} {r.scores.service} · {t.catClean} {r.scores.clean} · {t.catLocation} {r.scores.location}
      </div>
      {r.reply && (
        <div className={s.reply} data-testid={`review-reply-${r.id}`}>
          <strong>{t.hotelReply} · {r.reply.staffName}</strong>
          <div>{r.reply.body}</div>
        </div>
      )}
    </article>
  );
}

/**
 * Reviews from GET /api/reviews (US-47). `limit` → compact list for the home page.
 * Degrades to an empty state while the API is not available.
 */
export default function Reviews({ lang, rooms, limit, withFilter = false }: { lang: Lang; rooms: RoomName[]; limit?: number; withFilter?: boolean }) {
  const t = tp(lang);
  const [roomType, setRoomType] = useState('');
  const [data, setData] = useState<{ summary: Summary | null; reviews: Review[] } | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let live = true;
    setData(null);
    api<{ summary: Summary; reviews: Review[] }>(`/api/reviews${roomType ? `?roomType=${roomType}` : ''}`)
      .then((r) => {
        if (!live) return;
        const reviews = [...(r.reviews ?? [])].sort((a, b) => b.createdAt.localeCompare(a.createdAt)); // newest first
        setData({ summary: r.summary ?? null, reviews });
        setFailed(false);
      })
      .catch(() => { if (live) { setData({ summary: null, reviews: [] }); setFailed(true); } });
    return () => { live = false; };
  }, [roomType]);

  const list = data ? (limit ? data.reviews.slice(0, limit) : data.reviews) : [];
  const sm = data?.summary;

  return (
    <div className="stack" style={{ gap: 24 }} data-testid="reviews">
      {withFilter && (
        <>
          {sm && sm.count > 0 && (
            <div className={s.summary} data-testid="review-summary">
              <div>
                <div className="small muted">{t.avgScore}</div>
                <div className={s.bigScore} data-testid="review-avg">{sm.avg.toFixed(1)}</div>
                <Stars value={sm.avg} />
                <div className="small muted" data-testid="review-count">{fill(t.basedOn, { n: sm.count })}</div>
              </div>
              <div className={s.bars}>
                {([['room', t.catRoom], ['service', t.catService], ['clean', t.catClean], ['location', t.catLocation]] as const).map(([k, label]) => (
                  <div className={s.bar} key={k} data-testid={`review-cat-${k}`}>
                    <span>{label}</span>
                    <span className={s.barTrack}><span className={s.barFill} style={{ width: `${(sm[k] / 5) * 100}%`, display: 'block' }} /></span>
                    <strong>{sm[k].toFixed(1)}</strong>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="row" style={{ justifyContent: 'space-between' }}>
            <label className="row small" style={{ gap: 8 }}>
              <strong>{t.filterRoom}</strong>
              <select className="input" style={{ width: 'auto', minWidth: 220 }} value={roomType} onChange={(e) => setRoomType(e.target.value)} data-testid="review-filter">
                <option value="">{t.allRoomTypes}</option>
                {rooms.map((r) => <option key={r.code} value={r.code}>{r.name}</option>)}
              </select>
            </label>
          </div>
        </>
      )}

      {!data && <p className="muted" aria-busy="true">…</p>}
      {data && list.length === 0 && (
        <div className={s.empty} data-testid="reviews-empty">
          <img src="/brand/misc/empty-state.jpg" alt="" />
          <p className="muted" style={{ margin: 0 }}>{failed ? t.reviewsUnavailable : t.noReviews}</p>
        </div>
      )}
      {list.length > 0 && (
        <div className={s.revGrid} data-testid="review-list">
          {list.map((r) => <ReviewCard key={r.id} r={r} lang={lang} rooms={rooms} />)}
        </div>
      )}
    </div>
  );
}
