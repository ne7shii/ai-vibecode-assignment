'use client';
import { useState } from 'react';
import type { Lang } from '@/i18n';
import { fmtDateTime } from '@/lib/format';
import { LoadError, PageHead, useLoad, useT } from './ui';
import styles from './admin.module.css';

interface Msg { id: number; channel: 'EMAIL' | 'LINE'; recipient: string; lang: string; subject: string; body: string; bookingCode: string | null; event: string; createdAt: string }

export default function Outbox({ lang }: { lang: Lang }) {
  const t = useT(lang);
  const [channel, setChannel] = useState('');
  const [q, setQ] = useState('');
  const [query, setQuery] = useState('');
  const params = new URLSearchParams();
  if (channel) params.set('channel', channel);
  if (query) params.set('q', query);
  const { data, error, reload } = useLoad<{ messages: Msg[] }>(`/api/admin/outbox?${params}`);

  return (
    <>
      <PageHead title={t.obTitle}>
        <button className="btn btn-ghost btn-sm" onClick={() => reload()} data-testid="outbox-refresh">{t.refresh}</button>
      </PageHead>
      <form className={styles.form} onSubmit={(e) => { e.preventDefault(); setQuery(q.trim()); }}>
        <div className="field">
          <label htmlFor="ob-ch">{t.channel}</label>
          <select id="ob-ch" className="input" value={channel} onChange={(e) => setChannel(e.target.value)} data-testid="outbox-channel">
            <option value="">{t.all}</option><option value="EMAIL">Email</option><option value="LINE">LINE</option>
          </select>
        </div>
        <div className="field">
          <label htmlFor="ob-q">{t.search}</label>
          <input id="ob-q" className="input" value={q} placeholder={t.searchHint} onChange={(e) => setQ(e.target.value)} data-testid="outbox-search" />
        </div>
        <button className="btn btn-primary" type="submit" data-testid="outbox-search-btn">{t.search}</button>
      </form>
      <LoadError error={error} lang={lang} />
      <div className="stack" data-testid="outbox-list">
        {data && !data.messages.length && <p className="muted" data-testid="outbox-empty">{t.none}</p>}
        {data?.messages.map((m) => (
          <article key={m.id} className={styles.msg} data-testid={`outbox-msg-${m.id}`} data-channel={m.channel}>
            <div className={styles.guestTop}>
              <span className="row" style={{ gap: 8 }}>
                <span className={`badge ${m.channel === 'LINE' ? styles.chLINE : styles.chEMAIL}`}>{m.channel === 'LINE' ? 'LINE' : 'Email'}</span>
                <strong data-testid="outbox-subject">{m.subject}</strong>
              </span>
              <span className="muted small">{fmtDateTime(m.createdAt, lang)}</span>
            </div>
            <div className={styles.meta}>
              <span>{t.recipient}: <b>{m.recipient}</b></span>
              <span>{t.event}: <b>{m.event}</b></span>
              {m.bookingCode && <span>{t.booking}: <b><code>{m.bookingCode}</code></b></span>}
            </div>
            <pre className={styles.msgBody}>{m.body}</pre>
          </article>
        ))}
      </div>
    </>
  );
}
