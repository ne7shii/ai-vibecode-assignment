import { json, parseAges, qs, route } from '@/lib/http';
import { searchRooms } from '@/lib/services/search';

export const dynamic = 'force-dynamic';

/** GET /api/search?checkIn=2027-06-01&checkOut=2027-06-03&adults=2&children=8,3 */
export const GET = route(async ({ req, actor }) => {
  const p = qs(req);
  const r = await searchRooms({
    checkIn: p.get('checkIn') ?? '', checkOut: p.get('checkOut') ?? '',
    adults: Number(p.get('adults') ?? 2), childAges: parseAges(p.get('children')), actor,
  });
  return json(r);
});
