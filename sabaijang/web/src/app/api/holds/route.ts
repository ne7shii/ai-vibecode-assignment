import { body, json, route } from '@/lib/http';
import { createHold, type HoldInput } from '@/lib/services/holds';

export const dynamic = 'force-dynamic';

/** POST /api/holds — lock rooms for 15 minutes and freeze the price. */
export const POST = route(async ({ req, actor }) => {
  const b = await body<Omit<HoldInput, 'actor' | 'addons'>>(req);
  const h = await createHold({ ...b, addons: [], actor });
  return json(h, 201);
});
