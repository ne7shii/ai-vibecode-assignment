import { json, route, body } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { SALES_ROLES } from '@/lib/services/admin/access';
import { getRates, putRates } from '@/lib/services/admin/seasons';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ actor }) => {
  requireStaff(actor, SALES_ROLES);
  return json(await getRates());
});

/** Body: { rates: [{ roomType, kind: LOW|HIGH|PEAK, price }] } */
export const PUT = route(async ({ req, actor }) => {
  const s = requireStaff(actor, SALES_ROLES);
  return json(await putRates(s.id, await body(req)));
});
