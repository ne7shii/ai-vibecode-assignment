# CONTRACT-NOTES · members

Endpoints built and tested as in API-CONTRACT "Members, reviews, chatbot". Below are additions to the contract and notes for other owners.

## Response details (for booking-ui / public-ui)

- `POST /api/members/register` → 201 `{userId:'m:<id>'}` + `set-cookie sj_user`. Other 422 codes: `NAME_REQUIRED`, `INVALID_EMAIL`, `INVALID_LANG`, `INVALID_BIRTH_DATE`, `EMAIL_TAKEN`. `marketingConsent` defaults to false (US-56 ข้อ 2). The verify email is in the outbox (`event='MEMBER_VERIFY'`) with the link `/{lang}/account/verify?token=<hex>`.
- `POST /api/members/verify {token}` → `{ok:true}` · 422 `VERIFY_TOKEN_INVALID` (unknown token or already used).
- `PATCH /api/me` → `{user}` (same `MemberUser` shape as `GET /api/me`). 422 `NAME_REQUIRED` / `INVALID_LANG`.
- `DELETE /api/me {confirm:true}` → `{ok:true}` + clears the cookie · 422 `CONFIRM_REQUIRED` if `confirm` is not `true`.
- `GET /api/me/bookings`: `upcoming` = CONFIRMED + CHECKED_IN (check-in ascending) · `past` = CHECKED_OUT + NO_SHOW (check-in descending) · `cancelled` = CANCELLED (newest cancellation first). HELD/EXPIRED holds are left out. For "จองอีกครั้ง" (US-44 ข้อ 2) use `rooms[0].roomType`, `adults` and `childAges`.
- `POST /api/reviews` → 201 `{review}` (same shape as an item in `GET /api/reviews`). Extra 422 codes: `INVALID_SCORE`, `REVIEW_BODY_REQUIRED`, `REVIEW_TOO_LONG`. If the user is not the member owner and has no valid token → 404 `NOT_FOUND`. Optional `lang` in the body; it defaults to the booking's language.
- `GET /api/reviews`: `avg` and the summary scores are rounded to 1 decimal. Room types with no reviews give a summary of all 0s.
- `POST /api/chat` → `{reply, links}`. `reply` may contain `\n` (the availability list), so render it with `white-space: pre-line`. Link hrefs: `/{lang}/book?checkIn=…&checkOut=…&adults=…`, `/{lang}/about` (directions), `https://line.me/R/ti/p/@cwnsabaijang`, `tel:076123456`.

## Decisions (⚠️ assumptions)

- Review window: the last day to write a review is check-out date + 30 days (Bangkok date, site clock), up to 23:59.
- Deleting an account (D-07): users row is anonymised (`deleted-<id>@deleted.invalid`, name "ผู้ใช้ที่ลบบัญชีแล้ว", phone, birth date and photo cleared, consent off), `bookings.user_id` is set to NULL, booking contact and tax invoice data are kept. Reviews stay but show the author as "ผู้เข้าพัก" with no photo. points_ledger rows stay linked to the anonymised user id. The same email can register again.
- Chatbot availability uses the public (non-member) price. "From" = the cheapest plan, including Non-refundable (for example R01 12–14 Aug 2027 = ฿2,754). If no head count is given, it assumes 2 adults. A year in พ.ศ. (2570) is accepted.

## For lead

- Every seed booking has `hold_token = 'seed'`, so the token `seed` opens every seed booking, including review access as a guest. That is fine for the demo, but you may want unique tokens in `02-seed.sql`.

## For admin

- Points EARN on check-out should insert `points_ledger (reason 'EARN', booking_code, created_at = site clock)`. `GET /api/me/points` reads the ledger newest first, so nothing else is needed.
- Review replies: `review_replies (review_id, staff_id, body, created_at)`. `GET /api/reviews` shows `staffName` from `staff_users.display_name`.
