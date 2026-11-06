import { json, route } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { FRONT_ROLES } from '@/lib/services/admin/access';
import { noShow } from '@/lib/services/admin/front';

export const dynamic = 'force-dynamic';

/** Only after 23:59 of the check-in day (site clock). */
export const POST = route<{ code: string }>(async ({ actor, params }) => {
  const s = requireStaff(actor, FRONT_ROLES);
  return json(await noShow(s.id, decodeURIComponent(params.code)));
});
