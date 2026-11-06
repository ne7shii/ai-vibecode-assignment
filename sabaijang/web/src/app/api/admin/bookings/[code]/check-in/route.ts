import { json, route, body } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { FRONT_ROLES } from '@/lib/services/admin/access';
import { checkIn } from '@/lib/services/admin/front';

export const dynamic = 'force-dynamic';

/** Body: { roomNo } or { roomNos: [] } for multi-room bookings. */
export const POST = route<{ code: string }>(async ({ req, actor, params }) => {
  const s = requireStaff(actor, FRONT_ROLES);
  return json(await checkIn(s.id, decodeURIComponent(params.code), await body(req)));
});
