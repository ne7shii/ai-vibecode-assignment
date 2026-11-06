import { json, parseAges, qs, route } from '@/lib/http';
import { priceCalendar } from '@/lib/services/search';

export const dynamic = 'force-dynamic';

/** GET /api/calendar?month=2027-06&adults=2&children= */
export const GET = route(async ({ req }) => {
  const p = qs(req);
  return json(await priceCalendar({ month: p.get('month') ?? '', adults: Number(p.get('adults') ?? 2), childAges: parseAges(p.get('children')) }));
});
