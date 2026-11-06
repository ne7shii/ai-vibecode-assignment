// Notifier port → OutboxNotifier: email and LINE are written to outbox_messages inside the
// same transaction as the state change (DESIGN D-06). Shown at /admin/outbox.
import type { Db } from '@/lib/db';
import { query } from '@/lib/db';

export const HOTEL_LINE_GROUP = 'LINE กลุ่ม CWN สบายจัง (Front Office)';
export const SALES_EMAIL = 'sales@sabaijang.test';
export const RESERVATION_EMAIL = 'reservation@sabaijang.test';

export interface OutboxMessage {
  channel: 'EMAIL' | 'LINE';
  recipient: string;
  lang: string;
  subject: string;
  body: string;
  bookingCode?: string | null;
  event: string;
}

export async function sendOutbox(db: Db, m: OutboxMessage, now: Date) {
  await query(
    `INSERT INTO outbox_messages (channel, recipient, lang, subject, body, booking_code, event, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8)`,
    [m.channel, m.recipient, m.lang, m.subject, m.body, m.bookingCode ?? null, m.event, now], db);
}
