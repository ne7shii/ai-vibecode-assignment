import { json, route } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { FRONT_ROLES } from '@/lib/services/admin/access';
import { checkOut } from '@/lib/services/admin/front';

export const dynamic = 'force-dynamic';

/** CHECKED_OUT · members earn points (points_ledger EARN). */
export const POST = route<{ code: string }>(async ({ actor, params }) => {
  const s = requireStaff(actor, FRONT_ROLES);
  return json(await checkOut(s.id, decodeURIComponent(params.code)));
});
