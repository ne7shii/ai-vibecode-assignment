import { body, bookingToken, json, route } from '@/lib/http';
import { cancelBooking } from '@/lib/services/manage';

export const dynamic = 'force-dynamic';

export const POST = route<{ code: string }>(async ({ req, actor, params }) =>
  json(await cancelBooking(params.code, { token: bookingToken(req) }, actor, await body<{ confirmNonref?: boolean }>(req))));
