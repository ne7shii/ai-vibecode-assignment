// Hotel replies to guest reviews (US-47 ข้อ 3).
import { query, tx } from '@/lib/db';
import { getClock } from '@/lib/clock-db';
import { audit, bad, notFound } from './common';

export async function listReviewsAdmin(i: { unreplied?: boolean } = {}) {
  const { rows } = await query(
    `SELECT r.*, rp.body AS reply_body, rp.created_at AS reply_at, s.display_name AS reply_staff
     FROM reviews r LEFT JOIN review_replies rp ON rp.review_id = r.id LEFT JOIN staff_users s ON s.id = rp.staff_id
     WHERE ($1::boolean IS NOT TRUE OR rp.review_id IS NULL)
     ORDER BY r.created_at DESC, r.id DESC`, [i.unreplied ?? null]);
  return {
    reviews: rows.map((r) => ({
      id: r.id as number, bookingCode: r.booking_code as string, roomType: r.room_type_code as string, authorName: r.author_name as string,
      scores: { room: r.room_score as number, service: r.service_score as number, clean: r.clean_score as number, location: r.location_score as number },
      avg: Math.round(((r.room_score + r.service_score + r.clean_score + r.location_score) / 4) * 10) / 10,
      body: r.body as string, lang: r.lang as string, createdAt: new Date(r.created_at).toISOString(),
      reply: r.reply_body ? { body: r.reply_body as string, staffName: r.reply_staff as string, createdAt: new Date(r.reply_at).toISOString() } : null,
    })),
  };
}

/** Create or replace the hotel's reply. */
export async function replyReview(staffId: number, id: number, i: { body?: string }) {
  const body = typeof i.body === 'string' ? i.body.trim() : '';
  if (!body) throw bad('กรุณาพิมพ์คำตอบ', 'Please write a reply', { field: 'body' });
  if (body.length > 2000) throw bad('คำตอบยาวได้ไม่เกิน 2,000 ตัวอักษร', 'Replies are limited to 2,000 characters', { field: 'body' });
  const now = (await getClock()).now();
  await tx(async (c) => {
    const { rowCount } = await c.query('SELECT 1 FROM reviews WHERE id = $1', [id]);
    if (!rowCount) throw notFound('ไม่พบรีวิว', 'Review not found');
    await c.query(`INSERT INTO review_replies (review_id, staff_id, body, created_at) VALUES ($1,$2,$3,$4)
                   ON CONFLICT (review_id) DO UPDATE SET staff_id = EXCLUDED.staff_id, body = EXCLUDED.body, created_at = EXCLUDED.created_at`, [id, staffId, body, now]);
    await audit(c, staffId, 'REVIEW_REPLY', { id, body });
  });
  const review = (await listReviewsAdmin()).reviews.find((r) => r.id === id)!;
  return { review, reply: review.reply! };
}
