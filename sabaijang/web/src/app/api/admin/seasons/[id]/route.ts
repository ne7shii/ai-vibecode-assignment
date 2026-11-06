import { json, route, body } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { SALES_ROLES } from '@/lib/services/admin/access';
import { parseId } from '@/lib/services/admin/common';
import { deleteSeason, updateSeason } from '@/lib/services/admin/seasons';

export const dynamic = 'force-dynamic';

export const PATCH = route<{ id: string }>(async ({ req, actor, params }) => {
  const s = requireStaff(actor, SALES_ROLES);
  return json(await updateSeason(s.id, parseId(params.id), await body(req)));
});

export const DELETE = route<{ id: string }>(async ({ actor, params }) => {
  const s = requireStaff(actor, SALES_ROLES);
  return json(await deleteSeason(s.id, parseId(params.id)));
});
