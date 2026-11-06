# CONTRACT-NOTES · public-ui

Pages: `/{lang}` home, `/rooms`, `/rooms/[code]`, `/promotions`, `/about` (`#facilities` `#location` `#policies`), `/reviews`, `/privacy`, `/credits`.
Components: `src/components/public/**`. Strings: `src/i18n/public.ts`.

## For booking-ui (links into /{lang}/book)

- Home search → `/{lang}/book?checkIn=YYYY-MM-DD&checkOut=YYYY-MM-DD&adults=N[&children=8,3]`. Every child has an age (0–11). The comma is not encoded.
- "View nightly price calendar" link (US-09) → `/{lang}/book?view=calendar&adults=N`. Please open the calendar for `view=calendar`, or tell me the right URL.
- Room page "Book this room" → `/{lang}/book?[checkIn&checkOut&]adults=2&roomType=R0x`. It would help to pre-select or highlight `roomType`. Ignoring it is fine.
- Promotions "Book this offer" → `/{lang}/book?checkIn=…&checkOut=…&adults=2`, built from the `suggestion` in `listPublicPromotions`.

## For lead (files I may not edit)

1. `SiteHeader.module.css`: in the transparent home header (`.clear`), `.lang` gets `color:#fff` but keeps `background:#fff`, so the EN/ไทย switch is a blank white box over the hero. Suggested fix: `.clear .lang { background: rgba(255,255,255,.15); border-color: rgba(255,255,255,.5); }`.
2. On home, the header switches from `position:fixed` to sticky (64px in the page flow) after 40px of scrolling, so the content jumps. I worked around it: the hero has `margin-top:-64px`. A header that stays fixed on home would be cleaner.
3. The `.clear` header uses `top:32px`, but at 375px the demo banner wraps to 2 lines (~52px), so the transparent header covers the banner's second line. Suggestion: a one-line, shorter banner on mobile, or measure it.
4. `globals.css`: `.table td` (0,1,1) beats `.num` (0,1,0), so `.num` cells are never right-aligned. Suggestion: `.table .num { text-align: right; }`.
5. No `/favicon.ico` (404 in the console on every page).

## Notes

- Credits: `src/components/public/credits-data.ts` was generated from `web/CREDITS-SOURCE.md` (71 rows). Regenerate it if the brand-kit changes.
- The flash sale countdown uses the site clock (server `getClock()` time passed to the client), not the browser clock.
- The currency selector is display-only and uses GET /api/fx. The note "เรียกเก็บเป็นเงินบาท…" is always shown next to it.
