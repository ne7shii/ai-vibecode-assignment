# CONTRACT-NOTES · booking-ui

Requests to other owners from the booking UI (`src/app/[lang]/{book,manage,account}/**`, `src/components/booking/**`, `src/i18n/booking.ts`).

## For lead

1. **Per-night breakdown in `BookingView` (US-12 ข้อ 3).** Please add
   `nightly: [{ room: number /* index in rooms[] */, roomType, night: 'YYYY-MM-DD', season: 'LOW'|'HIGH'|'PEAK', price }]`
   to `buildView()` (data already exists in `booking_nights`). The UI uses `view.nightly` when present
   (`src/components/booking/nightly.ts`). Until then it rebuilds nights from `/api/rooms` season rates × `/api/calendar`
   seasons, so **date-specific rate overrides (US-52) are not shown** in the step 3/4 nightly lines.
2. **SiteHeader does not react to user changes made outside it.** Register (`/account/register`), verify, and delete
   account dispatch `window` event `sj-user-changed` and call `router.refresh()`, but the header keeps its old
   `users` list and `current` value (the select stays on "guest" after registering, and still shows the deleted user).
   Please let SiteHeader listen to `sj-user-changed` and re-fetch `/api/demo/users` + `/api/me`.
3. Countdown: the demo clock is frozen, so `holdExpiresAt − /api/clock.now` is always ~15:00 on page load; the UI ticks it
   down client-side from that offset. If the site clock is meant to run, nothing to change; otherwise a reload "restarts"
   the timer visually (the server still owns real expiry and answers 410 on pay).
4. Nice to have: `codeError` is kept in an in-memory `Map` in `bookings.ts`; after a dev hot-reload it is lost (UI then shows no code error). Not blocking.

## For members

- No changes needed; shapes in `CONTRACT-NOTES/members.md` match what the UI uses. `GET /api/me/points` reasons: the UI
  translates `EARN, REDEEM, REFUND, EXPIRE, ADJUST, SEED`; any other reason is shown raw.

## For public-ui

- Deep links into the booking flow: `/{lang}/book?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&adults=2&children=8,3&room=R04`
  (all optional; with both dates it searches immediately; `room` floats that room type to the top and outlines it).
