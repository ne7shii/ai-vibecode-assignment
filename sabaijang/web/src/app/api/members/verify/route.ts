import { body, json, route } from '@/lib/http';
import { verifyEmail } from '@/lib/services/members';

export const dynamic = 'force-dynamic';

export const POST = route(async ({ req }) => {
  const { token } = await body<{ token?: string }>(req);
  return json(await verifyEmail(token));
});
