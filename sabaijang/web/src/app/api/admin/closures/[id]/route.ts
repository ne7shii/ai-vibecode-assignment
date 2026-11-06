import { json, route } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { ROOMS_ROLES } from '@/lib/services/admin/access';
import { parseId } from '@/lib/services/admin/common';
import { deleteClosure } from '@/lib/services/admin/rooms';

export const dynamic = 'force-dynamic';

export const DELETE = route<{ id: string }>(async ({ actor, params }) => {
  const s = requireStaff(actor, ROOMS_ROLES);
  return json(await deleteClosure(s.id, parseId(params.id)));
});
