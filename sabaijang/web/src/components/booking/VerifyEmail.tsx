'use client';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import { pick, type Lang } from '@/i18n';
import { booking } from '@/i18n/booking';
import { api, msgOf } from '@/lib/client/api';
import { Alert } from './common';
import s from './booking.module.css';

export default function VerifyEmail({ lang, token }: { lang: Lang; token: string }) {
  const t = pick(booking, lang);
  const router = useRouter();
  const [state, setState] = useState<{ kind: 'wait' | 'ok' | 'bad'; text: string }>({ kind: 'wait', text: t.verifying });
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;
    if (!token) { setState({ kind: 'bad', text: t.verifyFail }); return; }
    api('/api/members/verify', { body: { token } })
      .then(() => {
        setState({ kind: 'ok', text: t.verified });
        window.dispatchEvent(new CustomEvent('sj-user-changed'));
        router.refresh();
      })
      .catch((e) => setState({ kind: 'bad', text: `${t.verifyFail} (${msgOf(e, lang)})` }));
  }, [token, lang, router, t.verified, t.verifyFail]);

  return (
    <div className={`container ${s.page}`} data-testid="verify-page">
      <h1>{t.verifyTitle}</h1>
      {state.kind === 'wait' ? <p className="muted" data-testid="msg-verifying">{state.text}</p> : <Alert kind={state.kind} testId="msg-verify">{state.text}</Alert>}
      <p className="row" style={{ marginTop: 16 }}>
        <Link href={`/${lang}/account`} className="btn btn-primary" data-testid="link-account">{t.goAccount}</Link>
        <Link href={`/${lang}/book`} className="btn btn-ghost" data-testid="link-book">{t.goBook}</Link>
      </p>
    </div>
  );
}
