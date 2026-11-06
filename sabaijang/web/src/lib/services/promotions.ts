import { query } from '@/lib/db';
import { getClock } from '@/lib/clock-db';
import { bkk } from '@/lib/clock';
import { addDays } from '@/lib/rules/calendar';
import { validateStay } from '@/lib/rules/stay';
import { quote, type Plan } from '@/lib/rules/pricing';
import { RuleError, type Promotion } from '@/lib/rules/types';
import { loadRuleData, mapPromotion } from './data';

export interface PublicPromotion {
  code: string; grp: string; kind: string; nameTh: string; nameEn: string; descTh: string; descEn: string;
  value: number; memberOnly: boolean; image: string | null; endsOn: string | null; saleEndsAt: string | null;
  remaining: number | null; suggestion: { checkIn: string; checkOut: string; roomType: string; plan: Plan } | null;
}

/** Earliest stay that satisfies the promotion on its own (US-31 ข้อ 2). */
function suggest(p: Promotion, data: Awaited<ReturnType<typeof loadRuleData>>, now: Date) {
  const today = bkk(now).date;
  const rooms = p.rules.roomTypes ?? ['R01'];
  const nights = Math.max(p.rules.minNights ?? (p.grp === 'PLAN' ? 2 : 1), p.kind === 'FREE_NIGHT' ? (p.rules.every ?? 4) : 1, 2);
  const plan: Plan = p.kind === 'GREEN' ? 'GREEN' : p.kind === 'HONEYMOON' ? 'HONEYMOON' : p.kind === 'FESTIVAL' ? 'FESTIVAL' : p.kind === 'FAMILY_SUMMER' ? 'BREAKFAST' : 'ROOM_ONLY';
  const start = p.rules.stayFrom && p.rules.stayFrom > today ? p.rules.stayFrom : today;
  for (let k = 0; k <= 365; k++) {
    let checkIn = addDays(start, k);
    if (p.kind === 'FESTIVAL' && p.rules.stayTo && checkIn > p.rules.stayTo) break;
    if (p.kind === 'FESTIVAL' && p.rules.stayFrom && p.rules.stayFrom === p.rules.stayTo) checkIn = addDays(p.rules.stayFrom, -1);
    const checkOut = addDays(checkIn, nights);
    if (validateStay({ checkIn, checkOut, now, seasons: data.seasons }).length) continue;
    for (const roomType of rooms) {
      try {
        const q = quote({
          now, checkIn, checkOut, rooms: [{ roomType, adults: 2, childAges: p.kind === 'FAMILY_SUMMER' ? [6] : [] }],
          plan, festivalCode: p.kind === 'FESTIVAL' ? p.code : undefined, nonref: p.grp === 'STACK' && !p.memberOnly,
          member: p.memberOnly ? { verified: true, birthDate: null } : null, data: { ...data, promotions: data.promotions.filter((x) => x.code === p.code || x.grp === 'STACK') },
        });
        const ok = p.grp === 'PRICE' ? q.pricePromo?.code === p.code : true;
        if (ok) return { checkIn, checkOut, roomType, plan };
      } catch (e) {
        if (!(e instanceof RuleError)) throw e;
      }
    }
    if (p.kind === 'FESTIVAL') break;
  }
  return null;
}

export async function listPublicPromotions(): Promise<PublicPromotion[]> {
  const now = (await getClock()).now();
  const today = bkk(now).date;
  const data = await loadRuleData();
  const { rows } = await query(`SELECT * FROM promotions WHERE active ORDER BY sort, code`);
  const out: PublicPromotion[] = [];
  for (const r of rows) {
    const p = mapPromotion(r);
    if (p.rules.saleTo && new Date(p.rules.saleTo) <= now) continue;
    if (p.rules.stayTo && p.rules.stayTo < today) continue; // US-27 ข้อ 3: festival ended → hidden
    if (p.quota !== null && p.used >= p.quota) continue;
    const birthday = !!p.rules.birthday;
    const s = birthday ? null : suggest(p, data, now);
    if (!s && !birthday && p.grp !== 'STACK') continue; // US-31 ข้อ 1: only promotions usable now
    out.push({
      code: p.code, grp: p.grp, kind: p.kind, nameTh: p.nameTh, nameEn: p.nameEn, descTh: r.desc_th, descEn: r.desc_en,
      value: p.value, memberOnly: p.memberOnly, image: r.image, endsOn: p.rules.stayTo ?? null, saleEndsAt: p.rules.saleTo ?? null,
      remaining: p.quota !== null ? p.quota - p.used : null, suggestion: s,
    });
  }
  return out;
}
