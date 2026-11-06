import { json, route } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { ROOMS_ROLES } from '@/lib/services/admin/access';
import { listRoomTypesAdmin } from '@/lib/services/admin/rooms';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ actor }) => {
  requireStaff(actor, ROOMS_ROLES);
  return json(await listRoomTypesAdmin());
});
