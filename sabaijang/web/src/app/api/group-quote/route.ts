import { body, json, route } from '@/lib/http';
import { requestGroupQuote } from '@/lib/services/bookings';

export const dynamic = 'force-dynamic';

export const POST = route(async ({ req }) =>
  json(await requestGroupQuote(await body<{ name: string; email: string; rooms: number; checkIn?: string; checkOut?: string; note?: string }>(req)), 201));
