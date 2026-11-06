'use client';
import Link from 'next/link';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import type { Lang } from '@/i18n';
import { tp } from '@/i18n/public';
import { api } from '@/lib/client/api';
import s from './public.module.css';

type Msg = { from: 'bot' | 'user'; text: string; links?: { label: string; href: string }[] };

/** Floating rule-based assistant (US-50) → POST /api/chat {message, lang} → {reply, links}. */
export default function ChatWidget({ lang }: { lang: Lang }) {
  const t = tp(lang);
  const [open, setOpen] = useState(false);
  const [msgs, setMsgs] = useState<Msg[]>([{ from: 'bot', text: t.chatHello }]);
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const log = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);

  useEffect(() => { setMsgs((m) => (m.length === 1 ? [{ from: 'bot', text: t.chatHello }] : m)); }, [t.chatHello]);
  useEffect(() => { log.current?.scrollTo({ top: log.current.scrollHeight, behavior: 'smooth' }); }, [msgs, busy]);
  useEffect(() => {
    if (!open) return;
    input.current?.focus();
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open]);

  async function send(message: string) {
    const q = message.trim();
    if (!q || busy) return;
    setText('');
    setMsgs((m) => [...m, { from: 'user', text: q }]);
    setBusy(true);
    try {
      const r = await api<{ reply: string; links?: { label: string; href: string }[] }>('/api/chat', { body: { message: q, lang } });
      setMsgs((m) => [...m, { from: 'bot', text: r.reply || t.chatFallback, links: r.links ?? [] }]);
    } catch {
      setMsgs((m) => [...m, { from: 'bot', text: t.chatFallback }]);
    } finally {
      setBusy(false);
    }
  }

  function submit(e: FormEvent) { e.preventDefault(); void send(text); }

  if (!open) {
    return (
      <button type="button" className={s.chatFab} onClick={() => setOpen(true)} aria-label={t.chatOpen} data-testid="chat-open">
        <span className={s.chatFabIcon} aria-hidden>
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12z" /></svg>
        </span>
        <span className={s.chatFabText}>{t.chatOpen}</span>
      </button>
    );
  }

  return (
    <section className={s.chatPanel} role="dialog" aria-label={t.chatTitle} data-testid="chat-panel">
      <header className={s.chatHead}>
        <img src="/brand/people/staff-front-muk.jpg" alt="" />
        <div style={{ minWidth: 0 }}>
          <strong>{t.chatTitle}</strong>
          <small>{t.chatSub}</small>
        </div>
        <button type="button" className={s.chatClose} onClick={() => setOpen(false)} aria-label={t.close} data-testid="chat-close">×</button>
      </header>
      <div className={s.chatLog} ref={log} aria-live="polite" data-testid="chat-log">
        {msgs.map((m, i) => (
          <div key={i} className={`${s.msg} ${m.from === 'bot' ? s.msgBot : s.msgUser}`} data-testid={m.from === 'bot' ? 'chat-msg-bot' : 'chat-msg-user'}>
            {m.text}
            {m.links && m.links.length > 0 && (
              <div className={s.msgLinks}>
                {m.links.map((l) => (
                  l.href.startsWith('/') ? <Link key={l.href + l.label} href={l.href} data-testid="chat-link">{l.label}</Link>
                    : <a key={l.href + l.label} href={l.href} target="_blank" rel="noreferrer" data-testid="chat-link">{l.label}</a>
                ))}
              </div>
            )}
          </div>
        ))}
        {busy && <div className={`${s.msg} ${s.msgBot}`} data-testid="chat-typing"><span className="muted">{t.chatTyping}</span></div>}
      </div>
      <div className={s.quick}>
        {t.chatQuick.map((q) => <button key={q} type="button" onClick={() => void send(q)} data-testid="chat-quick">{q}</button>)}
      </div>
      <form className={s.chatForm} onSubmit={submit}>
        <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={t.chatPlaceholder} aria-label={t.chatPlaceholder} data-testid="chat-input" maxLength={300} />
        <button className="btn btn-primary" type="submit" disabled={busy || !text.trim()} data-testid="chat-send">{t.chatSend}</button>
      </form>
    </section>
  );
}
