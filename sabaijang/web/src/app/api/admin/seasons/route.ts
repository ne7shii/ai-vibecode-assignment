import { json, route, body } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { SALES_ROLES } from '@/lib/services/admin/access';
import { createSeason, listSeasons } from '@/lib/services/admin/seasons';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ actor }) => {
  requireStaff(actor, SALES_ROLES);
  return json(await listSeasons());
});

/** US-15: add a season · rejects any date in the next 365 days without a season. */
export const POST = route(async ({ req, actor }) => {
  const s = requireStaff(actor, SALES_ROLES);
  return json(await createSeason(s.id, await body(req)), 201);
});
