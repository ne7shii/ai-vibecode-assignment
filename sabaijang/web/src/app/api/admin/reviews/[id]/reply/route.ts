import { json, route, body } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { FRONT_ROLES } from '@/lib/services/admin/access';
import { parseId } from '@/lib/services/admin/common';
import { replyReview } from '@/lib/services/admin/reviews';

export const dynamic = 'force-dynamic';

/** US-47 ข้อ 3 · Body: { body } · creates or replaces the hotel's reply. */
export const POST = route<{ id: string }>(async ({ req, actor, params }) => {
  const s = requireStaff(actor, FRONT_ROLES);
  return json(await replyReview(s.id, parseId(params.id), await body(req)));
});
