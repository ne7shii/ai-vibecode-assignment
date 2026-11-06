# API-CONTRACT · CWN สบายจัง รีสอร์ท

All endpoints are Next.js route handlers under `src/app/api/**/route.ts`, built with `route()` from `src/lib/http.ts`
(resolves the demo-login actor, turns `AppError`/`RuleError` into JSON). Money is THB numbers. Dates `YYYY-MM-DD`,
instants ISO-8601. Every error body: `{ error: CODE, message: { th, en }, ...extra }`.

Status: ✅ built and tested · 🔨 to build (owner in brackets)

## Conventions

- **Actor** (demo login, DESIGN §2.1): cookie `sj_user` = `m:<userId>` member or `s:<staffId>` staff. `src/lib/auth.ts`:
  `requireMember(actor)` → 401, `requireStaff(actor, roles)` → 401/403 (GM always passes).
- **Booking access token**: header `x-booking-token` (or `?token=`). Returned by `POST /api/holds` and `POST /api/manage/lookup`.
- **Status codes**: 401 not signed in · 403 wrong role · 404 not found / someone else's data · 409 room gone · 410 hold expired ·
  402 payment declined · 422 business-rule error (`RuleError`) · 429 too many attempts.
- **Clock**: never `new Date()` in business code. `await getClock()` (`src/lib/clock-db.ts`).
- **Outbox**: email + LINE via `sendOutbox(db, msg, now)` (`src/lib/ports/notifier.ts`) inside the same transaction.
- Every user-visible string is bilingual (th/en).

## Public / booking ✅ (owner: lead)

| Method | Path | Body / query | Response |
|---|---|---|---|
| GET | `/api/health` | | `{ok,db}` |
| GET | `/api/clock` | | `{now,date,time,minutes}` site "today" |
| POST | `/api/test/reset` | `{now?}` (needs `ALLOW_TEST_RESET=1`) | `{ok}` |
| POST | `/api/test/clock` | `{now?}` or `{advanceMinutes}` | `{ok,now}` |
| GET | `/api/demo/users` | | `{users:[{id:'m:1'|'s:1',name,email,role,photo}]}` role ∈ MEMBER, MEMBER_UNVERIFIED, GM, SALES, FRONT, ROOMS |
| POST | `/api/demo/login` | `{userId}` | sets cookie |
| POST | `/api/demo/logout` | | clears cookie |
| GET | `/api/me` | | `{kind:'member',user,points}` / `{kind:'staff',staff}` / 401 |
| GET | `/api/rooms` | | `{rooms:[RoomTypeInfo + rates{LOW,HIGH,PEAK}]}` RoomTypeInfo: code,nameTh,nameEn,descTh,descEn,sizeSqm,bedTh,bedEn,viewTh,viewEn,maxAdults,maxTotal,extraBedAllowed,totalRooms,amenities[],pano,photos[{file,captionTh,captionEn}] |
| GET | `/api/rooms/:code` | | `{room}` |
| GET | `/api/search` | `checkIn,checkOut,adults,children=8,3` | `{checkIn,checkOut,nights,results:[{roomType,left,lowStock,needsExtraBed,nights[{night,season,price}],plans[{plan,nonref,festivalCode?,labelTh,labelEn,refundable,total,perNight,memberPrice,pricePromo{code,nameTh,nameEn,saved}|null,saved,freeCancelUntil}]}],suggestions[{checkIn,checkOut}],message|null}` |
| GET | `/api/calendar` | `month=2027-06,adults,children` | `{month,days:[{date,season,from,full,bookable}]}` |
| POST | `/api/holds` | `{checkIn,checkOut,rooms:[{roomType,adults,childAges[]}],plan:'ROOM_ONLY'|'BREAKFAST'|'GREEN'|'HONEYMOON'|'FESTIVAL',nonref?,festivalCode?,code?,redeemPoints?}` | 201 `{code,holdToken,holdExpiresAt,status:'HELD',quote}` |
| GET | `/api/bookings/:code` | token | `BookingView` (see `src/lib/services/bookings.ts buildView`) |
| PATCH | `/api/bookings/:code` | token · `DetailsInput` {contact{name,email,phone},rooms[{specialRequest,bedPref,highFloor}],arrivalTime,marketingConsent,nonrefAck,taxInvoice{company,address,taxId,branch}|null,dinnerNight,addons[{kind:'TRANSFER'|'EARLY_IN'|'LATE_OUT',flightNo?,arriveTime?}],code,redeemPoints,lang} | `BookingView & {codeError}` |
| POST | `/api/bookings/:code/pay` | token · `{method:'CARD',cardNumber}` or `{method:'PROMPTPAY',confirmed}` | `BookingView` · 402 declined · 410 expired |
| GET | `/api/bookings/:code/cancel-preview` | token | `{nonref,inTime,freeCancelUntil,refundAmount,paid,canChange}` |
| POST | `/api/bookings/:code/cancel` | token · `{confirmNonref?}` | `BookingView` |
| POST | `/api/bookings/:code/change-dates` | token · `{checkIn,checkOut}` | `BookingView` · 409 `{alternatives[]}` |
| POST | `/api/manage/lookup` | `{code,email}` | `{booking,token}` · 404 · 429 |
| POST | `/api/group-quote` | `{name,email,rooms,checkIn?,checkOut?,note?}` | 201 `{id}` |
| GET | `/api/promotions` | | `{promotions:[{code,grp,kind,nameTh,nameEn,descTh,descEn,value,memberOnly,image,endsOn,saleEndsAt,remaining,suggestion{checkIn,checkOut,roomType,plan}|null}]}` |
| GET | `/api/fx` | | `{base:'THB',rates:{USD,EUR,CNY}}` (THB per unit) |

Test cards: `4242 4242 4242 4242` success · `4000 0000 0000 0002` declined. PromptPay: `{confirmed:true}` = "จ่ายแล้ว".

## Members, reviews, chatbot 🔨 (owner: agent `members`)

| Method | Path | Auth | Body / query | Response |
|---|---|---|---|---|
| POST | `/api/members/register` | none | `{name,email,phone?,birthDate?,lang?,marketingConsent?}` | 201 `{userId:'m:<id>'}` · creates MEMBER_UNVERIFIED, sets demo cookie to the new user, outbox email with verify link `/{lang}/account/verify?token=…` · 422 `EMAIL_TAKEN` |
| POST | `/api/members/verify` | none | `{token}` | `{ok}` → email_verified = true |
| PATCH | `/api/me` | member | `{name?,phone?,lang?,marketingConsent?}` | `{user}` |
| DELETE | `/api/me` | member | `{confirm:true}` | `{ok}` → soft delete (deleted_at, anonymise name/email/phone), clears cookie; bookings + tax invoices kept unlinked (D-07) |
| GET | `/api/me/bookings` | member | | `{upcoming:[],past:[],cancelled:[]}` each `{code,status,checkIn,checkOut,rooms:[{roomType,nameTh,nameEn,adults,childAges}],total,plan,canReview}` |
| GET | `/api/me/points` | member | | `{balance,ledger:[{delta,reason,bookingCode,createdAt}]}` |
| GET | `/api/reviews` | none | `roomType?` | `{summary:{count,avg,room,service,clean,location},reviews:[{id,roomType,authorName,authorPhoto,scores{room,service,clean,location},avg,body,lang,createdAt,reply{body,staffName,createdAt}|null}]}` newest first |
| POST | `/api/reviews` | member owner or booking token | `{bookingCode, room, service, clean, location (1–5), body}` | 201 · 422 `NOT_CHECKED_OUT` / `REVIEW_WINDOW_CLOSED` (> 30 days after check-out) / `ALREADY_REVIEWED` |
| POST | `/api/chat` | none | `{message, lang}` | `{reply, links:[{label,href}]}` rule-based, deterministic (US-50); handles check-in/out time, breakfast price, child policy, how to get here, "2 คน 12–14 ส.ค." style availability (calls searchRooms), fallback with LINE/phone |

## Back office 🔨 (owner: agent `admin`) — all under `/api/admin/*`, roles per DESIGN §2.2–2.3

| Area | Endpoints (method path) | Roles |
|---|---|---|
| Seasons & rates | GET/POST/PATCH/DELETE `/api/admin/seasons[/:id]` (save rejects gaps in next 365 days, US-15) · GET/PUT `/api/admin/rates` (season_rates) · GET/PUT/DELETE `/api/admin/date-rates` | GM, SALES |
| Promotions | GET/POST/PATCH `/api/admin/promotions[/:code]` (validation US-30 ข้อ 3) · POST `/api/admin/promotions/preview` (price preview, US-30 ข้อ 4) · GET/POST/PATCH `/api/admin/codes[/:code]` | GM, SALES |
| Front office | GET `/api/admin/arrivals?date=` (arrivals, departures, in-house) · POST `/api/admin/bookings/:code/check-in {roomNo}` · `/check-out` (points EARN → ledger) · `/no-show` (after 23:59 of check-in day) · POST `/api/admin/addons/:id {status}` | GM, FRONT |
| Outbox | GET `/api/admin/outbox` | GM, FRONT |
| Rooms | GET/POST/DELETE `/api/admin/closures[/:id]` (uses `closeRoom/reopenRoom`) · PATCH `/api/admin/room-types/:code` (names, descriptions, amenities both languages) | GM, ROOMS |
| Reports | GET `/api/admin/reports?from=&to=` occupancy by type/day/month, revenue & ADR by season, promo + code usage · GET `/api/admin/reports/export` → .xlsx (exceljs) | GM, SALES |
| Reviews | POST `/api/admin/reviews/:id/reply {body}` | GM, FRONT |
| Audit | every admin write inserts `audit_log` | — |

## File ownership

| Owner | Owns |
|---|---|
| lead | `src/lib/rules/**`, `src/lib/services/{data,search,holds,inventory,bookings,manage,promotions,emails,rooms-admin}.ts`, public API above, `src/app/[lang]/layout.tsx`, `src/components/Site*`, `globals.css`, `src/i18n/{index,common}.ts`, `src/lib/client/api.ts`, `db/init/01-02` |
| members | `src/lib/services/{members,reviews,chat}.ts` + tests, `src/app/api/{members,me/bookings,me/points,reviews,chat}/**`, PATCH/DELETE in `src/app/api/me/route.ts`, `db/init/03-members.sql` (additive only) |
| admin | `src/lib/services/admin/**` + tests, `src/app/api/admin/**`, `src/app/[lang]/admin/**`, `src/components/admin/**`, `src/i18n/admin.ts`, `db/init/04-admin.sql` (additive only) |
| public-ui | `src/app/[lang]/{page,rooms,promotions,about,reviews,privacy,credits}/**`, `src/components/public/**`, `src/i18n/public.ts` |
| booking-ui | `src/app/[lang]/{book,manage,account}/**`, `src/components/booking/**`, `src/i18n/booking.ts` |

If you need something from a file you don't own, write it in `CONTRACT-NOTES/<owner>.md` instead of editing it.
