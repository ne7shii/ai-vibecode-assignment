import { json, route } from '@/lib/http';
import { loadRuleData } from '@/lib/services/data';

export const dynamic = 'force-dynamic';

export const GET = route(async () => {
  const data = await loadRuleData();
  return json({
    rooms: Object.values(data.roomTypes).sort((a, b) => a.sort - b.sort).map((rt) => ({
      ...rt, rates: data.rates.season[rt.code],
    })),
  });
});
