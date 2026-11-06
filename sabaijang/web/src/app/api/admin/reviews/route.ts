import { json, route, qs } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { FRONT_ROLES } from '@/lib/services/admin/access';
import { listReviewsAdmin } from '@/lib/services/admin/reviews';

export const dynamic = 'force-dynamic';

/** ?unreplied=1 */
export const GET = route(async ({ req, actor }) => {
  requireStaff(actor, FRONT_ROLES);
  return json(await listReviewsAdmin({ unreplied: qs(req).get('unreplied') === '1' }));
});
