import { json, route, body } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { SALES_ROLES } from '@/lib/services/admin/access';
import { getPromotion, updatePromotion } from '@/lib/services/admin/promos';

export const dynamic = 'force-dynamic';

export const GET = route<{ code: string }>(async ({ actor, params }) => {
  requireStaff(actor, SALES_ROLES);
  return json(await getPromotion(decodeURIComponent(params.code)));
});

/** Any subset of fields · { active:false } deactivates (gone from /api/promotions immediately). */
export const PATCH = route<{ code: string }>(async ({ req, actor, params }) => {
  const s = requireStaff(actor, SALES_ROLES);
  return json(await updatePromotion(s.id, decodeURIComponent(params.code), await body(req)));
});
