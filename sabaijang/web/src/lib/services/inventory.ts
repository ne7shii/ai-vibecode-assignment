import { query, Db } from '@/lib/db';

/** Release holds whose 15 minutes are up (DESIGN D-01: lazy sweep, works with a moved clock). */
export async function sweepExpired(now: Date, db?: Db) {
  for (let attempt = 0; ; attempt++) {
    try {
      await query(
        `WITH exp AS (
           UPDATE bookings SET status = 'EXPIRED'
           WHERE status = 'HELD' AND hold_expires_at <= $1
           RETURNING code
         ), n AS (
           SELECT br.room_type_code, bn.night, count(*)::int AS c
           FROM booking_rooms br JOIN booking_nights bn ON bn.booking_room_id = br.id
           WHERE br.booking_code IN (SELECT code FROM exp)
           GROUP BY 1, 2
         )
         UPDATE inventory_nights i SET held = i.held - n.c
         FROM n WHERE i.room_type_code = n.room_type_code AND i.night = n.night`,
        [now], db);
      return;
    } catch (e) {
      if ((e as { code?: string }).code === '40P01' && attempt < 5) continue;
      throw e;
    }
  }
}

/** Rooms left per type for every night (min over nights). Types missing a night are omitted. */
export async function availability(nights: string[], db?: Db): Promise<Record<string, number>> {
  const { rows } = await query<{ room_type_code: string; left: number; n: number }>(
    `SELECT room_type_code, min(total - sold - held - closed)::int AS left, count(*)::int AS n
     FROM inventory_nights WHERE night = ANY($1::date[]) GROUP BY 1`, [nights], db);
  const out: Record<string, number> = {};
  for (const r of rows) if (r.n === nights.length) out[r.room_type_code] = r.left;
  return out;
}

/** Retry a transaction on deadlock / serialization failure. */
export async function withRetry<T>(fn: () => Promise<T>, tries = 5): Promise<T> {
  for (let i = 0; ; i++) {
    try {
      return await fn();
    } catch (e) {
      const code = (e as { code?: string }).code;
      if ((code === '40P01' || code === '40001') && i < tries) continue;
      throw e;
    }
  }
}
