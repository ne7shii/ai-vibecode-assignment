// Demo login (DESIGN §2.1): pick a user from a dropdown; no passwords.
// Cookie sj_user = "m:<userId>" (member) or "s:<staffId>" (staff). API still enforces roles.
import { query, Db } from './db';
import { AppError } from './http';

export type StaffRole = 'GM' | 'SALES' | 'FRONT' | 'ROOMS';
export interface MemberUser { id: number; email: string; displayName: string; phone: string; verified: boolean; birthDate: string | null; lang: string; photo: string | null; marketingConsent: boolean }
export interface StaffUser { id: number; email: string; displayName: string; role: StaffRole; photo: string | null }

export type Actor =
  | { kind: 'guest' }
  | { kind: 'member'; user: MemberUser }
  | { kind: 'staff'; staff: StaffUser };

export const COOKIE = 'sj_user';

export function parseCookie(header: string | null, name = COOKIE): string | null {
  if (!header) return null;
  for (const part of header.split(';')) {
    const [k, ...v] = part.trim().split('=');
    if (k === name) return decodeURIComponent(v.join('='));
  }
  return null;
}

export async function loadMember(id: number, db?: Db): Promise<MemberUser | null> {
  const { rows } = await query(
    `SELECT id, email, display_name, phone, email_verified, birth_date, lang, photo, marketing_consent
     FROM users WHERE id = $1 AND deleted_at IS NULL`, [id], db);
  const r = rows[0];
  return r ? { id: r.id, email: r.email, displayName: r.display_name, phone: r.phone, verified: r.email_verified, birthDate: r.birth_date, lang: r.lang, photo: r.photo, marketingConsent: r.marketing_consent } : null;
}

export async function loadStaff(id: number, db?: Db): Promise<StaffUser | null> {
  const { rows } = await query('SELECT id, email, display_name, role, photo FROM staff_users WHERE id = $1', [id], db);
  const r = rows[0];
  return r ? { id: r.id, email: r.email, displayName: r.display_name, role: r.role, photo: r.photo } : null;
}

export async function actorFromCookieValue(v: string | null): Promise<Actor> {
  const m = v?.match(/^([ms]):(\d+)$/);
  if (!m) return { kind: 'guest' };
  if (m[1] === 'm') {
    const user = await loadMember(Number(m[2]));
    return user ? { kind: 'member', user } : { kind: 'guest' };
  }
  const staff = await loadStaff(Number(m[2]));
  return staff ? { kind: 'staff', staff } : { kind: 'guest' };
}

export const actorFromRequest = (req: Request) => actorFromCookieValue(parseCookie(req.headers.get('cookie')));

export function requireMember(a: Actor): MemberUser {
  if (a.kind !== 'member') throw new AppError(401, 'LOGIN_REQUIRED', { th: 'กรุณาเลือกผู้ใช้ (เข้าสู่ระบบ) ก่อน', en: 'Please choose a user (sign in) first' });
  return a.user;
}

export function requireStaff(a: Actor, roles: StaffRole[]): StaffUser {
  if (a.kind === 'guest') throw new AppError(401, 'LOGIN_REQUIRED', { th: 'กรุณาเข้าสู่ระบบ', en: 'Please sign in' });
  if (a.kind !== 'staff' || !(a.staff.role === 'GM' || roles.includes(a.staff.role))) {
    throw new AppError(403, 'FORBIDDEN', { th: 'ไม่มีสิทธิ์เข้าถึง', en: 'You do not have access' });
  }
  return a.staff;
}
