import { json, route, qs } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { FRONT_ROLES } from '@/lib/services/admin/access';
import { listOutbox } from '@/lib/services/admin/front';

export const dynamic = 'force-dynamic';

/** ?channel=EMAIL|LINE&q=&limit= · newest first. */
export const GET = route(async ({ req, actor }) => {
  requireStaff(actor, FRONT_ROLES);
  const q = qs(req);
  return json(await listOutbox({ channel: q.get('channel'), q: q.get('q'), limit: q.get('limit') ? Number(q.get('limit')) : undefined }));
});
