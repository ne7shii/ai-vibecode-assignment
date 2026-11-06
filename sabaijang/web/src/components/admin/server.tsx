// Server-only helpers for admin pages: who is signed in, and the "no access" gate (DESIGN §2.3).
import { cookies } from 'next/headers';
import { actorFromCookieValue, COOKIE, type StaffUser } from '@/lib/auth';
import { canUse, type AdminArea } from '@/lib/services/admin/access';
import { pick, type Lang } from '@/i18n';
import { admin } from '@/i18n/admin';
import styles from './admin.module.css';

export async function currentStaff(): Promise<StaffUser | null> {
  const jar = await cookies();
  const actor = await actorFromCookieValue(jar.get(COOKIE)?.value ?? null);
  return actor.kind === 'staff' ? actor.staff : null;
}

export function NoAccess({ lang, notStaff }: { lang: Lang; notStaff?: boolean }) {
  const t = pick(admin, lang);
  return (
    <div className={styles.noAccess} data-testid="admin-no-access" role="alert">
      <div className={styles.noAccessIcon} aria-hidden>🔒</div>
      <h1 className={styles.pageTitle}>{t.noAccess}</h1>
      <p className="muted">{notStaff ? t.notStaff : t.noAccessBody}</p>
    </div>
  );
}

/** Direct URL to a page the role may not use → "ไม่มีสิทธิ์เข้าถึง / You do not have access". */
export async function Gate({ lang, area, children }: { lang: Lang; area: AdminArea; children: React.ReactNode }) {
  const staff = await currentStaff();
  if (!staff) return <NoAccess lang={lang} notStaff />;
  if (!canUse(staff.role, area)) return <NoAccess lang={lang} />;
  return <>{children}</>;
}
