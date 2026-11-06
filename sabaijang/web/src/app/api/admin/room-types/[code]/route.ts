import { json, route, body } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { ROOMS_ROLES } from '@/lib/services/admin/access';
import { updateRoomType } from '@/lib/services/admin/rooms';

export const dynamic = 'force-dynamic';

/** US-51 ข้อ 3 · names, descriptions, bed, view, amenities (th + en), photo captions. */
export const PATCH = route<{ code: string }>(async ({ req, actor, params }) => {
  const s = requireStaff(actor, ROOMS_ROLES);
  return json(await updateRoomType(s.id, decodeURIComponent(params.code), await body(req)));
});
