import { json, route, body } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { SALES_ROLES } from '@/lib/services/admin/access';
import { previewPromotion } from '@/lib/services/admin/promos';

export const dynamic = 'force-dynamic';

/** US-30 ข้อ 4 · Body: { code } or { promotion: draft }, roomType, checkIn, checkOut, adults? */
export const POST = route(async ({ req, actor }) => {
  requireStaff(actor, SALES_ROLES);
  return json(await previewPromotion(await body(req)));
});
