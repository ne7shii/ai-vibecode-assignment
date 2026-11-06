import { bookingToken, body, json, qs, route } from '@/lib/http';
import { createReview, listReviews, type ReviewInput } from '@/lib/services/reviews';

export const dynamic = 'force-dynamic';

/** GET /api/reviews?roomType=R02 */
export const GET = route(async ({ req }) => json(await listReviews({ roomType: qs(req).get('roomType') })));

/** POST /api/reviews · member who owns the booking, or the booking token (x-booking-token / ?token=). */
export const POST = route(async ({ req, actor }) => {
  const review = await createReview(await body<ReviewInput>(req), actor, bookingToken(req));
  return json({ review }, 201);
});
