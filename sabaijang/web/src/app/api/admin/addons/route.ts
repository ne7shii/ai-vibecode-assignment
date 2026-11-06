import { json, route, qs } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { FRONT_ROLES } from '@/lib/services/admin/access';
import { listAddons } from '@/lib/services/admin/front';

export const dynamic = 'force-dynamic';

/** ?status=PENDING|CONFIRMED|REJECTED */
export const GET = route(async ({ req, actor }) => {
  requireStaff(actor, FRONT_ROLES);
  return json(await listAddons({ status: qs(req).get('status') }));
});
