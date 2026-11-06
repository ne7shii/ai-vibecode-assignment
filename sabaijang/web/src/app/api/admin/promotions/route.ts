import { json, route, body } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { SALES_ROLES } from '@/lib/services/admin/access';
import { createPromotion, listPromotions } from '@/lib/services/admin/promos';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ actor }) => {
  requireStaff(actor, SALES_ROLES);
  return json(await listPromotions());
});

/** US-30 / US-28 / US-27: create a promotion, Flash Sale or festival package. */
export const POST = route(async ({ req, actor }) => {
  const s = requireStaff(actor, SALES_ROLES);
  return json(await createPromotion(s.id, await body(req)), 201);
});
