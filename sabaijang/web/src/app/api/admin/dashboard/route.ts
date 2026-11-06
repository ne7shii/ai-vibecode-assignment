import { json, route } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { ALL_STAFF } from '@/lib/services/admin/access';
import { dashboard } from '@/lib/services/admin/front';

export const dynamic = 'force-dynamic';

/** Today's arrivals / departures / in-house counts for every staff role. */
export const GET = route(async ({ actor }) => {
  const staff = requireStaff(actor, ALL_STAFF);
  return json({ ...(await dashboard()), staff });
});
