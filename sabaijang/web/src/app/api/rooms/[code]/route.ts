import { AppError, json, route } from '@/lib/http';
import { loadRuleData } from '@/lib/services/data';

export const dynamic = 'force-dynamic';

export const GET = route<{ code: string }>(async ({ params }) => {
  const data = await loadRuleData();
  const rt = data.roomTypes[params.code.toUpperCase()];
  if (!rt) throw new AppError(404, 'NOT_FOUND', { th: 'ไม่พบห้อง', en: 'Room not found' });
  return json({ room: { ...rt, rates: data.rates.season[rt.code] } });
});
