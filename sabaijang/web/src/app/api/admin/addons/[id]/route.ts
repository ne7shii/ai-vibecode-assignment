import { json, route, body } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { FRONT_ROLES } from '@/lib/services/admin/access';
import { parseId } from '@/lib/services/admin/common';
import { decideAddon } from '@/lib/services/admin/front';

export const dynamic = 'force-dynamic';

/** US-37 · Body: { status: CONFIRMED | REJECTED } · rejected → not charged, refunded if already paid. */
export const POST = route<{ id: string }>(async ({ req, actor, params }) => {
  const s = requireStaff(actor, FRONT_ROLES);
  const b = await body<{ status?: string }>(req);
  return json(await decideAddon(s.id, parseId(params.id), String(b.status ?? '')));
});
