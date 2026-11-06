import { query } from '@/lib/db';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Fixed demo rates (US-46). Always charged in THB. */
export const GET = route(async () => {
  const { rows } = await query('SELECT currency, thb_per_unit FROM fx_rates ORDER BY currency');
  return json({ base: 'THB', rates: Object.fromEntries(rows.map((r) => [r.currency, r.thb_per_unit])) });
});
