import { body, bookingToken, json, route } from '@/lib/http';
import { changeDates } from '@/lib/services/manage';

export const dynamic = 'force-dynamic';

export const POST = route<{ code: string }>(async ({ req, actor, params }) =>
  json(await changeDates(params.code, { token: bookingToken(req) }, actor, await body<{ checkIn: string; checkOut: string }>(req))));
