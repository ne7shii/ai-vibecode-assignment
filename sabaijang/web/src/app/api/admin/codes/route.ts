import { json, route, body } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { SALES_ROLES } from '@/lib/services/admin/access';
import { createCode, listCodes } from '@/lib/services/admin/promos';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ actor }) => {
  requireStaff(actor, SALES_ROLES);
  return json(await listCodes());
});

/** Body: { code, discount, minRoomTotal?, validUntil, maxUses?, active? } */
export const POST = route(async ({ req, actor }) => {
  const s = requireStaff(actor, SALES_ROLES);
  return json(await createCode(s.id, await body(req)), 201);
});
