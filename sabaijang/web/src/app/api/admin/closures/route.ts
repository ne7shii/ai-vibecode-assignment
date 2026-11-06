import { json, route, body } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { ROOMS_ROLES } from '@/lib/services/admin/access';
import { createClosure, listClosuresAdmin } from '@/lib/services/admin/rooms';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ actor }) => {
  requireStaff(actor, ROOMS_ROLES);
  return json(await listClosuresAdmin());
});

/** US-51 · Body: { roomNo, from, to, reason } · 422 ROOM_HAS_BOOKING lists the bookings in the way. */
export const POST = route(async ({ req, actor }) => {
  const s = requireStaff(actor, ROOMS_ROLES);
  return json(await createClosure(s.id, await body(req)), 201);
});
