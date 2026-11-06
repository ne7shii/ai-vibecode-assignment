import { json, route, qs } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { FRONT_ROLES } from '@/lib/services/admin/access';
import { arrivals } from '@/lib/services/admin/front';

export const dynamic = 'force-dynamic';

/** US-53 · ?date=YYYY-MM-DD (default: site today) → arrivals, departures, in-house, overdue. */
export const GET = route(async ({ req, actor }) => {
  requireStaff(actor, FRONT_ROLES);
  return json(await arrivals(qs(req).get('date')));
});
