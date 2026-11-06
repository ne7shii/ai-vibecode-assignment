import { body, clientKey, json, route } from '@/lib/http';
import { lookupBooking } from '@/lib/services/manage';

export const dynamic = 'force-dynamic';

/** POST /api/manage/lookup {code, email} → booking + token for later calls (US-41). */
export const POST = route(async ({ req }) => {
  const b = await body<{ code?: string; email?: string }>(req);
  return json(await lookupBooking({ code: b.code ?? '', email: b.email ?? '', client: clientKey(req) }));
});
