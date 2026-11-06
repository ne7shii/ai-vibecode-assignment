import { getClock } from '@/lib/clock-db';
import { bkk } from '@/lib/clock';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** The site's "today" (locked in the demo to 1 Mar 2027 10:00). */
export const GET = route(async () => {
  const now = (await getClock()).now();
  return json({ now: now.toISOString(), ...bkk(now) });
});
