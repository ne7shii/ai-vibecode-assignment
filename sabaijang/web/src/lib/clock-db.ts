import { Clock, FixedClock, SystemClock } from './clock';
import { query, Db } from './db';

/**
 * The site clock.
 * - frozen_now set + CLOCK_MODE != 'ticking' (tests): time stands still at frozen_now.
 * - frozen_now set + CLOCK_MODE == 'ticking' (live demo): starts at frozen_now and runs in real time,
 *   so a 15-minute hold really expires on the demo site.
 * - frozen_now null: real time + clock_offset_ms.
 */
export async function getClock(db?: Db): Promise<Clock> {
  const { rows } = await query<{ frozen_now: Date | null; ticking_now: Date | null; clock_offset_ms: number }>(
    `SELECT frozen_now, frozen_now + (clock_timestamp() - anchor_real) AS ticking_now, clock_offset_ms
     FROM app_settings WHERE id = 1`, [], db,
  );
  const s = rows[0];
  if (s?.frozen_now) {
    const at = process.env.CLOCK_MODE === 'ticking' && s.ticking_now ? s.ticking_now : s.frozen_now;
    return new FixedClock(new Date(at));
  }
  return new SystemClock(s?.clock_offset_ms ?? 0);
}

export async function setClock(opts: { now?: string; advanceMinutes?: number }) {
  if (opts.now) {
    await query('UPDATE app_settings SET frozen_now = $1, anchor_real = clock_timestamp(), clock_offset_ms = 0 WHERE id = 1', [new Date(opts.now)]);
  }
  if (opts.advanceMinutes) {
    const ms = Math.round(opts.advanceMinutes * 60_000);
    await query(
      `UPDATE app_settings SET
         frozen_now = CASE WHEN frozen_now IS NULL THEN NULL ELSE frozen_now + ($1 || ' milliseconds')::interval END,
         clock_offset_ms = CASE WHEN frozen_now IS NULL THEN clock_offset_ms + $1::bigint ELSE clock_offset_ms END
       WHERE id = 1`,
      [ms],
    );
  }
}
