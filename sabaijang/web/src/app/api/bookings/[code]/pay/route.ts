import { body, bookingToken, json, route } from '@/lib/http';
import { pay, type PayInput } from '@/lib/services/bookings';

export const dynamic = 'force-dynamic';

export const POST = route<{ code: string }>(async ({ req, actor, params }) =>
  json(await pay(params.code, bookingToken(req), await body<PayInput>(req), actor)));
