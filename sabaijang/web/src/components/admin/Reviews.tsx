'use client';
import { useState } from 'react';
import type { Lang } from '@/i18n';
import { api } from '@/lib/client/api';
import { fmtDateTime } from '@/lib/format';
import { LoadError, noticeFrom, NoticeBox, PageHead, useLoad, useT, type Notice } from './ui';
import styles from './admin.module.css';

interface Review {
  id: number; bookingCode: string; roomType: string; authorName: string; avg: number; body: string; createdAt: string;
  scores: { room: number; service: number; clean: number; location: number };
  reply: { body: string; staffName: string; createdAt: string } | null;
}

export default function Reviews({ lang }: { lang: Lang }) {
  const t = useT(lang);
  const [onlyOpen, setOnlyOpen] = useState(false);
  const { data, error, reload } = useLoad<{ reviews: Review[] }>(`/api/admin/reviews${onlyOpen ? '?unreplied=1' : ''}`);
  const [drafts, setDrafts] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [notice, setNotice] = useState<Notice>(null);

  async function send(id: number) {
    try {
      await api(`/api/admin/reviews/${id}/reply`, { body: { body: drafts[id] ?? '' } });
      setNotice({ kind: 'ok', text: t.saved });
      setEditing(null);
      await reload();
    } catch (e) {
      setNotice(noticeFrom(e, lang));
    }
  }

  return (
    <>
      <PageHead title={t.revTitle}>
        <label className="check" style={{ alignItems: 'center' }}>
          <input type="checkbox" checked={onlyOpen} onChange={(e) => setOnlyOpen(e.target.checked)} data-testid="reviews-unreplied" /> {t.unreplied}
        </label>
      </PageHead>
      <LoadError error={error} lang={lang} />
      <NoticeBox n={notice} testid="reviews-notice" />
      <div className="stack">
        {data && !data.reviews.length && <p className="muted">{t.none}</p>}
        {data?.reviews.map((r) => {
          const open = editing === r.id || !r.reply;
          return (
            <article key={r.id} className={styles.panel} data-testid={`review-${r.id}`}>
              <div className={styles.guestTop}>
                <span><strong>{r.authorName}</strong> · {r.roomType} · <code>{r.bookingCode}</code></span>
                <span className={styles.stars} aria-label={`${r.avg}/5`}>{'★'.repeat(Math.round(r.avg))}<span className="muted small"> {r.avg.toFixed(1)}</span></span>
              </div>
              <p className="small muted" style={{ margin: '4px 0' }}>
                {fmtDateTime(r.createdAt, lang)} · {t.score}: {r.scores.room}/{r.scores.service}/{r.scores.clean}/{r.scores.location}
              </p>
              <p>{r.body}</p>
              {r.reply && editing !== r.id && (
                <div className={styles.req} data-testid={`review-reply-${r.id}`}>
                  <b>{t.repliedBy} {r.reply.staffName}:</b> {r.reply.body}
                  <div><button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => { setEditing(r.id); setDrafts((d) => ({ ...d, [r.id]: r.reply!.body })); }} data-testid={`review-edit-${r.id}`}>{t.editReply}</button></div>
                </div>
              )}
              {open && (
                <div className="stack">
                  <label className="sr-only" htmlFor={`rep-${r.id}`}>{t.reply}</label>
                  <textarea id={`rep-${r.id}`} className="input" rows={3} maxLength={2000} value={drafts[r.id] ?? ''} placeholder={t.reply}
                    onChange={(e) => setDrafts((d) => ({ ...d, [r.id]: e.target.value }))} data-testid={`review-input-${r.id}`} />
                  <div className={styles.actionsRow}>
                    <button className="btn btn-primary btn-sm" onClick={() => send(r.id)} data-testid={`review-send-${r.id}`}>{t.sendReply}</button>
                    {editing === r.id && <button className="btn btn-ghost btn-sm" onClick={() => setEditing(null)}>{t.cancel}</button>}
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>
    </>
  );
}
