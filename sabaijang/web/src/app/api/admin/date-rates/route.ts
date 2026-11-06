import { json, route, body, qs } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { SALES_ROLES } from '@/lib/services/admin/access';
import { deleteDateRate, listDateRates, putDateRate } from '@/lib/services/admin/seasons';

export const dynamic = 'force-dynamic';

/** ?month=YYYY-MM&roomType=R01 → overrides + calendar coloured by season (US-52 ข้อ 3). */
export const GET = route(async ({ req, actor }) => {
  requireStaff(actor, SALES_ROLES);
  const q = qs(req);
  return json(await listDateRates({ month: q.get('month'), roomType: q.get('roomType') }));
});

/** Body: { roomType, from, to?, price } */
export const PUT = route(async ({ req, actor }) => {
  const s = requireStaff(actor, SALES_ROLES);
  return json(await putDateRate(s.id, await body(req)));
});

/** ?roomType=R01&night=YYYY-MM-DD (or the same in the body) */
export const DELETE = route(async ({ req, actor }) => {
  const s = requireStaff(actor, SALES_ROLES);
  const q = qs(req);
  const b = await body<{ roomType?: string; night?: string }>(req);
  return json(await deleteDateRate(s.id, { roomType: q.get('roomType') ?? b.roomType, night: q.get('night') ?? b.night }));
});
