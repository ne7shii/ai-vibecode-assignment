import { bookingToken, json, route } from '@/lib/http';
import { cancelPreview } from '@/lib/services/manage';

export const dynamic = 'force-dynamic';

export const GET = route<{ code: string }>(async ({ req, actor, params }) =>
  json(await cancelPreview(params.code, { token: bookingToken(req) }, actor)));
