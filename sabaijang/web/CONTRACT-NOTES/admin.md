# CONTRACT-NOTES · admin

All "Back office" endpoints in API-CONTRACT are built and tested (`src/lib/services/admin/admin.int.test.ts` 34 tests, `src/app/api/admin/admin-auth.int.test.ts` 35 tests = role table for every route × guest/member/GM/SALES/FRONT/ROOMS).

## Extra endpoints (additions to the contract)

| Method | Path | Roles | Notes |
|---|---|---|---|
| GET | `/api/admin/dashboard` | every staff role | `{today, counts{arrivals,departures,inHouse}, pendingAddons, outboxToday, staff}` |
| GET | `/api/admin/addons?status=` | GM, FRONT | queue for the add-on page |
| GET | `/api/admin/promotions/:code` | GM, SALES | one promotion |
| GET | `/api/admin/room-types` | GM, ROOMS | content incl. `amenitiesEn`, photos |
| GET | `/api/admin/reviews?unreplied=1` | GM, FRONT | reviews with replies |

Response details: `GET /api/admin/arrivals` also returns `overdue` (CONFIRMED, check-in in the last 7 days, not arrived → No-show candidates) and `freeRooms {R01:['101',…]}`. `GET /api/admin/date-rates?month=&roomType=` returns `calendar.days[{date,season,price,seasonPrice,override}]`. Season errors: 422 `SEASON_GAP` with `missing[]` and `ranges[{from,to}]`. Promotion errors: `END_BEFORE_START`, `DISCOUNT_TOO_HIGH`, `BAD_INPUT`, `CODE_EXISTS`. Check-in errors: `NO_ROOM`, `ROOM_WRONG_TYPE`, `ROOM_CLOSED`, `ROOM_OCCUPIED`, `NOT_CONFIRMED`, `TOO_EARLY`. No-show: `NO_SHOW_TOO_EARLY` until 00:00 the day after check-in.

## Decisions (⚠️ assumptions)

- Rejected add-on (US-37 ข้อ 2): total − price; the amount due at the hotel is reduced first, anything left is refunded to the original payment (`payments` REFUND, key `<code>:addon:<id>`). A price line `ADDON_REJECTED` (negative) is added. A full-pay (Non-ref) booking gets the full add-on price back.
- Check-out works any time while CHECKED_IN; money fields are not changed. Members get `points_ledger EARN = points_to_earn` (created_at = site clock) and `points_earned` is set. A thank-you email with the review hint goes to the outbox (`event CHECKED_OUT`).
- No-show: status NO_SHOW, `due_at_hotel = 0`, deposit kept, nights from site-today onward released (sold − 1), LINE message `event NO_SHOW`.
- Reports: revenue = booking `room_total` spread over its nights by base price, statuses CONFIRMED/CHECKED_IN/CHECKED_OUT; promotions and codes are counted by bookings whose check-in is in the range. Occupancy = sold / total from `inventory_nights`.
- Every admin write inserts `audit_log` in the same transaction.

## For lead / public-ui

- `db/init/04-admin.sql` (additive) adds `room_types.amenities_en text[]` with English names for the seeded amenities, so ROOMS can edit amenities in both languages (US-51 ข้อ 3). A DB built before the file existed gets it applied once at runtime by the admin service. **Request:** `loadRoomTypes()` / `GET /api/rooms` could expose `amenitiesEn` so the English room page can show it (now only the Thai `amenities` array is returned).
- Header (`SiteHeader`) already links staff to `/{lang}/admin` — nothing else needed.
