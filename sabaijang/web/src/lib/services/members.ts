// Members (US-42 register/verify, US-43 points, US-44 stay history, US-56 delete account).
// Demo login replaces passwords (DESIGN §2.1): registering sets the demo cookie to the new user.
import crypto from 'node:crypto';
import { query, tx } from '@/lib/db';
import { getClock } from '@/lib/clock-db';
import { bkk } from '@/lib/clock';
import { loadMember, type MemberUser } from '@/lib/auth';
import { AppError } from '@/lib/http';
import { RuleError } from '@/lib/rules/types';
import { sendOutbox } from '@/lib/ports/notifier';
import { pointsBalance } from './data';
import { reviewWindowOpen } from './reviews';

const err = (code: string, th: string, en: string) => new RuleError(code, { th, en });
const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const LANGS = ['th', 'en'];

export interface RegisterInput {
  name?: string; email?: string; phone?: string; birthDate?: string | null; lang?: string; marketingConsent?: boolean;
}

function checkName(name: unknown): string {
  const n = typeof name === 'string' ? name.trim() : '';
  if (!n) throw err('NAME_REQUIRED', 'กรุณากรอกชื่อ', 'Please enter your name');
  if (n.length > 100) throw err('NAME_TOO_LONG', 'ชื่อยาวเกิน 100 ตัวอักษร', 'Name must be at most 100 characters');
  return n;
}

function checkLang(lang: unknown): string {
  if (typeof lang !== 'string' || !LANGS.includes(lang)) throw err('INVALID_LANG', 'ภาษาต้องเป็น th หรือ en', 'Language must be th or en');
  return lang;
}

/** US-42: create a MEMBER_UNVERIFIED user and "send" a verify link through the outbox. */
export async function registerMember(i: RegisterInput): Promise<{ userId: number }> {
  const name = checkName(i.name);
  const email = (i.email ?? '').trim().toLowerCase();
  if (!EMAIL_RE.test(email)) throw err('INVALID_EMAIL', 'รูปแบบอีเมลไม่ถูกต้อง', 'Please enter a valid email address');
  const lang = i.lang === undefined ? 'th' : checkLang(i.lang);
  const birthDate = i.birthDate || null;
  if (birthDate && !/^\d{4}-\d{2}-\d{2}$/.test(birthDate)) throw err('INVALID_BIRTH_DATE', 'วันเกิดไม่ถูกต้อง', 'Invalid birth date');
  const now = (await getClock()).now();
  const token = crypto.randomBytes(16).toString('hex');
  return tx(async (c) => {
    const taken = await c.query('SELECT 1 FROM users WHERE lower(email) = $1', [email]);
    if (taken.rowCount) throw err('EMAIL_TAKEN', 'อีเมลนี้สมัครสมาชิกแล้ว', 'This email is already registered');
    const { rows } = await c.query(
      `INSERT INTO users (email, display_name, phone, email_verified, verify_token, birth_date, lang, marketing_consent, created_at)
       VALUES ($1,$2,$3,false,$4,$5,$6,$7,$8) RETURNING id`,
      [email, name, (i.phone ?? '').trim(), token, birthDate, lang, i.marketingConsent === true, now]);
    const link = `/${lang}/account/verify?token=${token}`;
    await sendOutbox(c, {
      channel: 'EMAIL', recipient: email, lang, event: 'MEMBER_VERIFY',
      subject: lang === 'th' ? 'ยืนยันอีเมลสมาชิก CWN สบายจัง รีสอร์ท' : 'Confirm your CWN Sabai Jang Resort membership',
      body: lang === 'th'
        ? `สวัสดีคุณ${name}\n\nขอบคุณที่สมัครสมาชิก กรุณากดลิงก์เพื่อยืนยันอีเมลและรับราคาสมาชิก:\n${link}\n\nCWN สบายจัง รีสอร์ท`
        : `Hello ${name},\n\nThank you for joining. Please confirm your email to unlock member prices:\n${link}\n\nCWN Sabai Jang Resort`,
    }, now);
    return { userId: Number(rows[0].id) };
  });
}

/** US-42 ข้อ 1: verify link → email_verified (MEMBER). Token is single-use. */
export async function verifyEmail(token: string | undefined): Promise<{ ok: true }> {
  const t = typeof token === 'string' ? token.trim() : '';
  const { rowCount } = t
    ? await query(`UPDATE users SET email_verified = true, verify_token = NULL WHERE verify_token = $1 AND deleted_at IS NULL`, [t])
    : { rowCount: 0 };
  if (!rowCount) throw err('VERIFY_TOKEN_INVALID', 'ลิงก์ยืนยันไม่ถูกต้องหรือใช้ไปแล้ว', 'This verification link is invalid or has already been used');
  return { ok: true };
}

export interface ProfilePatch { name?: string; phone?: string; lang?: string; marketingConsent?: boolean }

export async function updateProfile(userId: number, p: ProfilePatch): Promise<MemberUser> {
  const sets: string[] = [];
  const vals: unknown[] = [userId];
  const set = (col: string, v: unknown) => { vals.push(v); sets.push(`${col} = $${vals.length}`); };
  if (p.name !== undefined) set('display_name', checkName(p.name));
  if (p.phone !== undefined) set('phone', String(p.phone).trim().slice(0, 30));
  if (p.lang !== undefined) set('lang', checkLang(p.lang));
  if (p.marketingConsent !== undefined) set('marketing_consent', p.marketingConsent === true);
  if (sets.length) await query(`UPDATE users SET ${sets.join(', ')} WHERE id = $1 AND deleted_at IS NULL`, vals);
  const user = await loadMember(userId);
  if (!user) throw new AppError(401, 'LOGIN_REQUIRED', { th: 'กรุณาเลือกผู้ใช้ (เข้าสู่ระบบ) ก่อน', en: 'Please choose a user (sign in) first' });
  return user;
}

/**
 * US-56 ข้อ 4 + D-07: soft delete and anonymise personal data. Bookings and tax invoices are kept
 * for the legally required period but unlinked from the person; reviews stay without name/photo.
 */
export async function deleteAccount(userId: number, i: { confirm?: boolean }): Promise<{ ok: true }> {
  if (i.confirm !== true) throw err('CONFIRM_REQUIRED', 'กรุณายืนยันการลบบัญชี', 'Please confirm that you want to delete your account');
  const now = (await getClock()).now();
  await tx(async (c) => {
    const { rowCount } = await c.query('SELECT 1 FROM users WHERE id = $1 AND deleted_at IS NULL FOR UPDATE', [userId]);
    if (!rowCount) throw new AppError(401, 'LOGIN_REQUIRED', { th: 'กรุณาเลือกผู้ใช้ (เข้าสู่ระบบ) ก่อน', en: 'Please choose a user (sign in) first' });
    await c.query(
      `UPDATE reviews SET author_name = 'ผู้เข้าพัก', author_photo = NULL
       WHERE booking_code IN (SELECT code FROM bookings WHERE user_id = $1)`, [userId]);
    await c.query('UPDATE bookings SET user_id = NULL WHERE user_id = $1', [userId]);
    await c.query(
      `UPDATE users SET deleted_at = $2, email = 'deleted-' || id || '@deleted.invalid', display_name = 'ผู้ใช้ที่ลบบัญชีแล้ว',
         phone = '', birth_date = NULL, photo = NULL, marketing_consent = false, verify_token = NULL, email_verified = false
       WHERE id = $1`, [userId, now]);
  });
  return { ok: true };
}

export interface MyBooking {
  code: string; status: string; checkIn: string; checkOut: string;
  rooms: { roomType: string; nameTh: string; nameEn: string; adults: number; childAges: number[] }[];
  total: number; plan: string; canReview: boolean;
}

/** US-44: own bookings split into upcoming / past / cancelled. Unpaid holds are not bookings yet. */
export async function myBookings(userId: number) {
  const today = bkk((await getClock()).now()).date;
  const [b, rooms, guests, reviewed] = await Promise.all([
    query(`SELECT code, status, check_in, check_out, total, plan, cancelled_at FROM bookings
           WHERE user_id = $1 AND status IN ('CONFIRMED','CHECKED_IN','CHECKED_OUT','NO_SHOW','CANCELLED')`, [userId]),
    query(`SELECT br.id, br.booking_code, br.room_type_code, br.adults, rt.name_th, rt.name_en
           FROM booking_rooms br JOIN room_types rt ON rt.code = br.room_type_code
           JOIN bookings b ON b.code = br.booking_code WHERE b.user_id = $1 ORDER BY br.id`, [userId]),
    query(`SELECT g.booking_room_id, g.age_at_checkin FROM booking_guests g JOIN booking_rooms br ON br.id = g.booking_room_id
           JOIN bookings b ON b.code = br.booking_code WHERE b.user_id = $1 AND g.kind = 'CHILD' ORDER BY g.id`, [userId]),
    query(`SELECT r.booking_code FROM reviews r JOIN bookings b ON b.code = r.booking_code WHERE b.user_id = $1`, [userId]),
  ]);
  const hasReview = new Set(reviewed.rows.map((r) => r.booking_code as string));
  const view = (r: Record<string, any>): MyBooking => ({
    code: r.code, status: r.status, checkIn: r.check_in, checkOut: r.check_out, total: r.total, plan: r.plan,
    rooms: rooms.rows.filter((x) => x.booking_code === r.code).map((x) => ({
      roomType: x.room_type_code, nameTh: x.name_th, nameEn: x.name_en, adults: x.adults,
      childAges: guests.rows.filter((g) => g.booking_room_id === x.id).map((g) => g.age_at_checkin as number),
    })),
    canReview: r.status === 'CHECKED_OUT' && !hasReview.has(r.code) && reviewWindowOpen(r.check_out, today),
  });
  const byCheckIn = (dir: 1 | -1) => (x: Record<string, any>, y: Record<string, any>) => dir * x.check_in.localeCompare(y.check_in) || x.code.localeCompare(y.code);
  const rows = b.rows;
  return {
    upcoming: rows.filter((r) => ['CONFIRMED', 'CHECKED_IN'].includes(r.status)).sort(byCheckIn(1)).map(view),
    past: rows.filter((r) => ['CHECKED_OUT', 'NO_SHOW'].includes(r.status)).sort(byCheckIn(-1)).map(view),
    cancelled: rows.filter((r) => r.status === 'CANCELLED')
      .sort((x, y) => (new Date(y.cancelled_at ?? 0).getTime() - new Date(x.cancelled_at ?? 0).getTime()) || y.check_in.localeCompare(x.check_in))
      .map(view),
  };
}

/** US-43: balance + ledger, newest first. Points are earned at check-out by the front office (admin). */
export async function myPoints(userId: number) {
  const [balance, { rows }] = await Promise.all([
    pointsBalance(userId),
    query(`SELECT delta, reason, booking_code, created_at FROM points_ledger WHERE user_id = $1 ORDER BY created_at DESC, id DESC`, [userId]),
  ]);
  return {
    balance,
    ledger: rows.map((r) => ({ delta: r.delta as number, reason: r.reason as string, bookingCode: (r.booking_code ?? null) as string | null, createdAt: new Date(r.created_at).toISOString() })),
  };
}
