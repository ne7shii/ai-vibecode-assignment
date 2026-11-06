'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { pick, type Lang } from '@/i18n';
import { admin } from '@/i18n/admin';
import { common } from '@/i18n/common';
import type { AdminArea } from '@/lib/services/admin/access';
import styles from './admin.module.css';

const ITEMS: { area: AdminArea; path: string; icon: string }[] = [
  { area: 'dashboard', path: '', icon: '◎' },
  { area: 'arrivals', path: '/arrivals', icon: '🛎' },
  { area: 'addons', path: '/addons', icon: '✚' },
  { area: 'outbox', path: '/outbox', icon: '✉' },
  { area: 'reviews', path: '/reviews', icon: '★' },
  { area: 'seasons', path: '/seasons', icon: '▦' },
  { area: 'promotions', path: '/promotions', icon: '％' },
  { area: 'codes', path: '/codes', icon: '#' },
  { area: 'reports', path: '/reports', icon: '▤' },
  { area: 'rooms', path: '/rooms', icon: '⌂' },
];

export interface ShellStaff { name: string; role: string; photo: string | null }

export default function AdminShell({ lang, staff, areas, children }: { lang: Lang; staff: ShellStaff | null; areas: AdminArea[]; children: React.ReactNode }) {
  const t = pick(admin, lang);
  const path = usePathname() ?? '';
  const base = `/${lang}/admin`;
  const items = ITEMS.filter((i) => areas.includes(i.area));
  return (
    <div className={styles.shell} data-testid="admin-shell">
      <aside className={styles.side} aria-label={t.menu}>
        <div className={styles.sideHead}>
          <span className={styles.sideTitle}>{t.backOffice}</span>
          {staff && (
            <span className={styles.who} data-testid="admin-who">
              {staff.photo ? <img src={staff.photo} alt="" className={styles.avatar} /> : null}
              <span>
                <strong>{staff.name}</strong>
                <span className={styles.role}>{common[lang][staff.role] ?? staff.role}</span>
              </span>
            </span>
          )}
        </div>
        <nav className={styles.menu} data-testid="admin-menu">
          {items.map((i) => {
            const href = base + i.path;
            const active = i.path ? path.startsWith(href) : path === base || path === `${base}/`;
            return (
              <Link key={i.area} href={href} className={`${styles.menuItem} ${active ? styles.menuActive : ''}`} aria-current={active ? 'page' : undefined} data-testid={`admin-nav-${i.area}`}>
                <span className={styles.menuIcon} aria-hidden>{i.icon}</span>
                {t[`nav_${i.area}` as keyof typeof t]}
              </Link>
            );
          })}
        </nav>
      </aside>
      <section className={styles.content}>{children}</section>
    </div>
  );
}
