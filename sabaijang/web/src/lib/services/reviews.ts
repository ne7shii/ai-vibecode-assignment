// Reviews (US-47): only checked-out stays, within 30 days after check-out, one per booking, 4 scores 1–5.
import { query, tx } from '@/lib/db';
import { getClock } from '@/lib/clock-db';
import { bkk } from '@/lib/clock';
import { addDays } from '@/lib/rules/calendar';
import { AppError } from '@/lib/http';
import { RuleError } from '@/lib/rules/types';
import type { Actor } from '@/lib/auth';

export const REVIEW_WINDOW_DAYS = 30;
const err = (code: string, th: string, en: string) => new RuleError(code, { th, en });
const notFound = () => new AppError(404, 'NOT_FOUND', { th: 'ไม่พบการจอง', en: 'Booking not found' });
const round1 = (n: number) => Math.round(n * 10) / 10;

/** Day 30 after check-out (Bangkok date) is the last day a review can be written. */
export function reviewWindowOpen(checkOut: string, today: string) {
  return today <= addDays(checkOut, REVIEW_WINDOW_DAYS);
}

export interface ReviewView {
  id: number; roomType: string; authorName: string; authorPhoto: string | null;
  scores: { room: number; service: number; clean: number; location: number }; avg: number;
  body: string; lang: string; createdAt: string;
  reply: { body: string; staffName: string; createdAt: string } | null;
}

const SELECT = `SELECT r.*, rr.body AS reply_body, rr.created_at AS reply_at, s.display_name AS staff_name
  FROM reviews r LEFT JOIN review_replies rr ON rr.review_id = r.id LEFT JOIN staff_users s ON s.id = rr.staff_id`;

function toView(r: Record<string, any>): ReviewView {
  const scores = { room: r.room_score, service: r.service_score, clean: r.clean_score, location: r.location_score };
  return {
    id: Number(r.id), roomType: r.room_type_code, authorName: r.author_name, authorPhoto: r.author_photo ?? null,
    scores, avg: round1((scores.room + scores.service + scores.clean + scores.location) / 4),
    body: r.body, lang: r.lang, createdAt: new Date(r.created_at).toISOString(),
    reply: r.reply_body != null ? { body: r.reply_body, staffName: r.staff_name, createdAt: new Date(r.reply_at).toISOString() } : null,
  };
}

/** US-47 ข้อ 3: newest first, average scores, filter by room type, hotel replies. */
export async function listReviews(i: { roomType?: string | null }) {
  const rt = i.roomType || null;
  const { rows } = await query(`${SELECT} WHERE ($1::text IS NULL OR r.room_type_code = $1) ORDER BY r.created_at DESC, r.id DESC`, [rt]);
  const reviews = rows.map(toView);
  const n = reviews.length;
  const mean = (f: (v: ReviewView) => number) => (n ? round1(reviews.reduce((a, v) => a + f(v), 0) / n) : 0);
  const s = (v: ReviewView) => v.scores;
  return {
    summary: {
      count: n,
      avg: mean((v) => (s(v).room + s(v).service + s(v).clean + s(v).location) / 4),
      room: mean((v) => s(v).room), service: mean((v) => s(v).service), clean: mean((v) => s(v).clean), location: mean((v) => s(v).location),
    },
    reviews,
  };
}

export interface ReviewInput { bookingCode: string; room: number; service: number; clean: number; location: number; body: string; lang?: string }

/** US-47 ข้อ 1–2. Access: the member who owns the booking, or the booking token (guests). */
export async function createReview(i: ReviewInput, actor: Actor, token: string | null | undefined): Promise<ReviewView> {
  const code = String(i.bookingCode ?? '').trim().toUpperCase();
  const now = (await getClock()).now();
  const today = bkk(now).date;
  const id = await tx(async (c) => {
    const { rows } = await c.query(
      `SELECT b.code, b.user_id, b.hold_token, b.status, b.check_out, b.contact_name, b.lang, u.display_name, u.photo
       FROM bookings b LEFT JOIN users u ON u.id = b.user_id AND u.deleted_at IS NULL WHERE b.code = $1 FOR UPDATE OF b`, [code]);
    const b = rows[0];
    if (!b) throw notFound();
    const owner = actor.kind === 'member' && b.user_id != null && Number(b.user_id) === actor.user.id;
    if (!owner && !(token && token === b.hold_token)) throw notFound();

    const scores = [i.room, i.service, i.clean, i.location];
    if (scores.some((v) => !Number.isInteger(v) || v < 1 || v > 5)) {
      throw err('INVALID_SCORE', 'กรุณาให้คะแนน 1–5 ดาวครบทั้ง 4 ด้าน', 'Please rate all 4 areas from 1 to 5 stars');
    }
    const body = typeof i.body === 'string' ? i.body.trim() : '';
    if (!body) throw err('REVIEW_BODY_REQUIRED', 'กรุณาเขียนรีวิว', 'Please write your review');
    if (body.length > 2000) throw err('REVIEW_TOO_LONG', 'รีวิวยาวได้ไม่เกิน 2,000 ตัวอักษร', 'Reviews can be at most 2,000 characters');

    if (b.status !== 'CHECKED_OUT') throw err('NOT_CHECKED_OUT', 'รีวิวได้หลังเช็กเอาต์แล้วเท่านั้น', 'You can review your stay after check-out');
    const dup = await c.query('SELECT 1 FROM reviews WHERE booking_code = $1', [code]);
    if (dup.rowCount) throw err('ALREADY_REVIEWED', 'การจองนี้รีวิวไปแล้ว', 'This booking has already been reviewed');
    if (!reviewWindowOpen(b.check_out, today)) {
      throw err('REVIEW_WINDOW_CLOSED', 'เขียนรีวิวได้ภายใน 30 วันหลังเช็กเอาต์', 'Reviews can be written within 30 days after check-out');
    }
    const room = await c.query('SELECT room_type_code FROM booking_rooms WHERE booking_code = $1 ORDER BY id LIMIT 1', [code]);
    const lang = i.lang === 'en' || i.lang === 'th' ? i.lang : b.lang;
    const ins = await c.query(
      `INSERT INTO reviews (booking_code, room_type_code, author_name, author_photo, room_score, service_score, clean_score, location_score, body, lang, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) RETURNING id`,
      [code, room.rows[0].room_type_code, b.display_name || b.contact_name || 'ผู้เข้าพัก', b.photo ?? null, i.room, i.service, i.clean, i.location, body, lang, now]);
    return ins.rows[0].id;
  });
  const { rows } = await query(`${SELECT} WHERE r.id = $1`, [id]);
  return toView(rows[0]);
}
