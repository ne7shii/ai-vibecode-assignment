import { body, bookingToken, json, route } from '@/lib/http';
import { getBooking, updateDetails, type DetailsInput } from '@/lib/services/bookings';

export const dynamic = 'force-dynamic';

export const GET = route<{ code: string }>(async ({ req, actor, params }) =>
  json(await getBooking(params.code, { token: bookingToken(req) }, actor)));

/** PATCH /api/bookings/:code — step 3 details (contact, requests, add-ons, tax invoice, code, points). */
export const PATCH = route<{ code: string }>(async ({ req, actor, params }) =>
  json(await updateDetails(params.code, bookingToken(req), await body<DetailsInput>(req), actor)));
