import { json, route, body } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { SALES_ROLES } from '@/lib/services/admin/access';
import { updateCode } from '@/lib/services/admin/promos';

export const dynamic = 'force-dynamic';

export const PATCH = route<{ code: string }>(async ({ req, actor, params }) => {
  const s = requireStaff(actor, SALES_ROLES);
  return json(await updateCode(s.id, decodeURIComponent(params.code), await body(req)));
});
