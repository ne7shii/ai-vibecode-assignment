import { json, route, qs } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { SALES_ROLES } from '@/lib/services/admin/access';
import { buildReport } from '@/lib/services/admin/reports';

export const dynamic = 'force-dynamic';

/** US-54 · ?from=&to= (default: this month by site clock). */
export const GET = route(async ({ req, actor }) => {
  requireStaff(actor, SALES_ROLES);
  const q = qs(req);
  return json(await buildReport({ from: q.get('from'), to: q.get('to') }));
});
