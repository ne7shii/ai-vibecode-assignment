'use client';
import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useState } from 'react';
import { pick, type Lang } from '@/i18n';
import { common } from '@/i18n/common';
import { api } from '@/lib/client/api';
import styles from './SiteHeader.module.css';

type DemoUser = { id: string; name: string; email: string; role: string; photo: string | null };

export default function SiteHeader({ lang }: { lang: Lang }) {
  const t = pick(common, lang);
  const path = usePathname() ?? `/${lang}`;
  const search = useSearchParams();
  const router = useRouter();
  const [users, setUsers] = useState<DemoUser[]>([]);
  const [current, setCurrent] = useState<string>('');
  const [open, setOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    // Re-read the user list and current user; also when register / verify / delete account
    // elsewhere on the page fire `sj-user-changed`.
    const load = () => {
      api<{ users: DemoUser[] }>('/api/demo/users').then((r) => setUsers(r.users)).catch(() => undefined);
      api<{ kind: string; user?: { id: number }; staff?: { id: number } }>('/api/me')
        .then((m) => setCurrent(m.kind === 'member' ? `m:${m.user!.id}` : `s:${m.staff!.id}`))
        .catch(() => setCurrent(''));
    };
    load();
    const onScroll = () => setScrolled(window.scrollY > 40);
    onScroll();
    window.addEventListener('scroll', onScroll, { passive: true });
    window.addEventListener('sj-user-changed', load);
    return () => {
      window.removeEventListener('scroll', onScroll);
      window.removeEventListener('sj-user-changed', load);
    };
  }, []);

  async function switchUser(id: string) {
    if (id) await api('/api/demo/login', { body: { userId: id } });
    else await api('/api/demo/logout', { body: {} });
    setCurrent(id);
    router.refresh();
    window.dispatchEvent(new CustomEvent('sj-user-changed', { detail: id }));
  }

  const other: Lang = lang === 'th' ? 'en' : 'th';
  const qs = search?.toString();
  const switchHref = path.replace(/^\/(th|en)/, `/${other}`) + (qs ? `?${qs}` : '');
  const me = users.find((u) => u.id === current);
  const isStaff = current.startsWith('s:');
  const isMember = current.startsWith('m:');
  const home = path === `/${lang}` || path === `/${lang}/`;

  const nav = [
    { href: `/${lang}/rooms`, label: t.rooms },
    { href: `/${lang}/promotions`, label: t.promotions },
    { href: `/${lang}/about`, label: t.about },
    { href: `/${lang}/reviews`, label: t.reviews },
    { href: `/${lang}/manage`, label: t.manage },
  ];

  return (
    <header className={`${styles.header} ${home && !scrolled ? styles.clear : ''}`} data-testid="site-header">
      <div className={`container ${styles.bar}`}>
        <Link href={`/${lang}`} className={styles.brand} aria-label={t.hotel}>
          <span className={styles.mark}>CWN</span>
          <span className={styles.name}>{lang === 'th' ? 'สบายจัง รีสอร์ท' : 'Sabai Jang Resort'}</span>
        </Link>
        <button className={styles.burger} aria-label="menu" aria-expanded={open} onClick={() => setOpen(!open)} data-testid="nav-toggle">☰</button>
        <nav className={`${styles.nav} ${open ? styles.open : ''}`} aria-label="main">
          {nav.map((n) => (
            <Link key={n.href} href={n.href} className={path.startsWith(n.href) ? styles.active : ''} onClick={() => setOpen(false)}>{n.label}</Link>
          ))}
          {isMember && <Link href={`/${lang}/account`} onClick={() => setOpen(false)} data-testid="nav-account">{t.account}</Link>}
          {isStaff && <Link href={`/${lang}/admin`} onClick={() => setOpen(false)} data-testid="nav-admin">{t.admin}</Link>}
          <div className={styles.tools}>
            <label className={styles.picker}>
              <span className="sr-only">{t.actingAs}</span>
              {me?.photo ? <img src={me.photo} alt="" className={styles.avatar} /> : <span className={styles.avatarEmpty}>👤</span>}
              <select value={current} onChange={(e) => switchUser(e.target.value)} data-testid="demo-user-select" aria-label={t.actingAs}>
                <option value="">{t.guest}</option>
                {users.map((u) => (
                  <option key={u.id} value={u.id}>{u.name} · {common[lang][u.role] ?? u.role}</option>
                ))}
              </select>
            </label>
            <Link href={switchHref} className={styles.lang} data-testid="lang-switch" hrefLang={other}>{other === 'en' ? 'EN' : 'ไทย'}</Link>
            <Link href={`/${lang}/book`} className="btn btn-gold btn-sm" data-testid="nav-book">{t.book}</Link>
          </div>
        </nav>
      </div>
    </header>
  );
}
