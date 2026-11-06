import { bkk } from '../clock';
import { daysBetween, nightlyRate, stayNights } from './calendar';
import { fitsRoom, freeCancelUntil, RULES } from './stay';
import {
  RuleError, money, baht,
  type Msg, type Promotion, type PromoCode, type RateTable, type RoomTypeSpec, type Season, type SeasonKind,
} from './types';

export const PRICES = {
  breakfastAdult: 400,  // §2 / story ข้อมูลตั้งต้น
  breakfastChild: 200,  // เด็ก 4–11 ปี
  breakfastFreeUnder: 4,
  extraBed: 800,
};

export type Plan = 'ROOM_ONLY' | 'BREAKFAST' | 'GREEN' | 'HONEYMOON' | 'FESTIVAL';

export interface RoomSel { roomType: string; adults: number; childAges: number[]; extraBed?: boolean }
export interface MemberCtx { verified: boolean; birthDate?: string | null; birthdayUsedYears?: number[] }
export interface Addon { kind: string; labelTh: string; labelEn: string; price: number }

export interface QuoteInput {
  now: Date;
  checkIn: string;
  checkOut: string;
  rooms: RoomSel[];
  plan: Plan;
  nonref?: boolean;
  festivalCode?: string;
  member?: MemberCtx | null;
  code?: PromoCode | null;
  redeemPoints?: number;
  addons?: Addon[];
  data: { seasons: Season[]; rates: RateTable; roomTypes: Record<string, RoomTypeSpec>; promotions: Promotion[] };
}

export interface PriceLine { kind: string; labelTh: string; labelEn: string; amount: number }
export interface NightPrice { room: number; roomType: string; night: string; season: SeasonKind; price: number; override: boolean }

export interface Quote {
  nights: NightPrice[];
  rooms: { roomType: string; adults: number; children: number; childAges: number[]; extraBed: boolean }[];
  hasPeak: boolean;
  baseRoomTotal: number;
  pricePromo: { code: string; nameTh: string; nameEn: string; saved: number } | null;
  appliedPromos: { code: string; saved: number }[];
  lines: PriceLine[];
  roomTotal: number;
  total: number;
  deposit: number;
  dueAtHotel: number;
  saved: number;
  pointsToEarn: number;
  memberPrice: number | null;
  freeCancelUntil: Date | null;
  codeError?: Msg;
  codeApplied: boolean;
}

const notEligible = (th: string, en: string) => new RuleError('PLAN_NOT_ELIGIBLE', { th, en });

interface Ctx {
  nights: NightPrice[];
  nightList: string[];
  today: string;
  lead: number;
  hasPeak: boolean;
  now: Date;
  checkIn: string;
  member: MemberCtx | null;
}

function seasonsOk(p: Promotion, ctx: Ctx) {
  const r = p.rules;
  if (r.noPeak && ctx.hasPeak) return false;
  if (r.allSeasons && !ctx.nights.every((n) => r.allSeasons!.includes(n.season))) return false;
  return true;
}

function windowOk(p: Promotion, ctx: Ctx) {
  const r = p.rules;
  if (r.minLeadDays !== undefined && ctx.lead < r.minLeadDays) return false;
  if (r.maxLeadDays !== undefined && ctx.lead > r.maxLeadDays) return false;
  if (r.minNights !== undefined && ctx.nightList.length < r.minNights) return false;
  if (r.stayFrom && ctx.nightList.some((n) => n < r.stayFrom!)) return false;
  if (r.stayTo && ctx.nightList.some((n) => n > r.stayTo!)) return false;
  if (r.saleFrom && ctx.now < new Date(r.saleFrom)) return false;
  if (r.saleTo && ctx.now >= new Date(r.saleTo)) return false;
  if (r.bookFrom && ctx.today < r.bookFrom) return false;
  if (r.bookTo && ctx.today > r.bookTo) return false;
  if (r.blackout?.some((d) => ctx.nightList.includes(d))) return false;
  return true;
}

function birthdayOk(p: Promotion, ctx: Ctx) {
  if (!p.rules.birthday) return true;
  const m = ctx.member;
  if (!m?.verified || !m.birthDate) return false;
  const year = Number(ctx.checkIn.slice(0, 4));
  if (m.birthdayUsedYears?.includes(year)) return false;
  const month = m.birthDate.slice(5, 7);
  return ctx.nightList.some((n) => n.slice(5, 7) === month);
}

/** Saving of one price promotion, or null when not eligible. */
function priceSaving(p: Promotion, ctx: Ctx, rooms: RoomSel[]): number | null {
  if (!p.active || p.grp !== 'PRICE') return null;
  if (p.memberOnly && !ctx.member?.verified) return null;
  if (!seasonsOk(p, ctx) || !windowOk(p, ctx) || !birthdayOk(p, ctx)) return null;
  const matching = rooms.map((r, i) => ({ r, i })).filter(({ r }) => !p.rules.roomTypes || p.rules.roomTypes.includes(r.roomType));
  if (!matching.length) return null;
  if (p.quota !== null && p.quota - p.used < matching.length) return null;
  let saving = 0;
  for (const { i } of matching) {
    const prices = ctx.nights.filter((n) => n.room === i).map((n) => n.price);
    if (p.kind === 'PERCENT') saving += prices.reduce((a, b) => a + b, 0) * p.value / 100;
    else if (p.kind === 'FREE_NIGHT') {
      const every = p.rules.every ?? p.value;
      const free = Math.floor(prices.length / every);
      saving += [...prices].sort((a, b) => a - b).slice(0, free).reduce((a, b) => a + b, 0);
    }
  }
  if (p.kind === 'AMOUNT') saving = p.value;
  return saving > 0 ? money(saving) : null;
}

function codeCheck(code: PromoCode, roomAfter: number, today: string): Msg | null {
  if (!code.active) return { th: `โค้ด ${code.code} ปิดใช้งานแล้ว`, en: `Code ${code.code} is no longer active` };
  if (today > code.validUntil) return { th: `โค้ด ${code.code} หมดอายุแล้ว`, en: `Code ${code.code} has expired` };
  if (code.maxUses !== null && code.used >= code.maxUses) return { th: `โค้ด ${code.code} ถูกใช้ครบสิทธิ์แล้ว`, en: `Code ${code.code} has been fully used` };
  if (roomAfter < code.minRoomTotal) {
    const short = code.minRoomTotal - roomAfter;
    return { th: `ยอดขั้นต่ำ ${baht(code.minRoomTotal)} (ขาดอีก ${baht(Math.ceil(short))})`, en: `Minimum spend ${baht(code.minRoomTotal)} (${baht(Math.ceil(short))} short)` };
  }
  return null;
}

export function taxBreakdown(price: number) {
  // ราคารวมค่าบริการ 10% และ VAT 7% ของ (ห้อง + ค่าบริการ) แล้ว (US-14)
  const base = money(price / 1.177);
  const service = money(base * 0.1);
  return { base, service, vat: money(price - base - service) };
}

export function quote(i: QuoteInput): Quote {
  const nightList = stayNights(i.checkIn, i.checkOut);
  if (!nightList.length) throw new RuleError('CHECKOUT_NOT_AFTER', { th: 'กรุณาเลือกวันเช็กเอาต์หลังวันเช็กอิน', en: 'Please choose a check-out date after check-in' });
  if (!i.rooms.length || i.rooms.length > RULES.maxRoomsPerBooking) {
    throw new RuleError('ROOM_COUNT', { th: 'จองได้ 1–5 ห้องต่อการจอง', en: 'You can book 1–5 rooms per booking' });
  }
  const { seasons, rates, roomTypes, promotions } = i.data;
  const today = bkk(i.now).date;

  // 1 · capacity and nightly rates
  const rooms = i.rooms.map((sel) => {
    const rt = roomTypes[sel.roomType];
    if (!rt) throw new RuleError('UNKNOWN_ROOM', { th: 'ไม่พบประเภทห้อง', en: 'Unknown room type' });
    const adults = sel.adults + sel.childAges.filter((a) => a > RULES.childMaxAge).length;
    const childAges = sel.childAges.filter((a) => a <= RULES.childMaxAge);
    const fit = fitsRoom(rt, adults, childAges.length);
    if (!fit.fits || sel.adults < 1) {
      throw new RuleError('OVER_CAPACITY', { th: `ห้อง ${rt.code} รับจำนวนผู้เข้าพักนี้ไม่ได้`, en: `Room ${rt.code} cannot take this many guests` });
    }
    return { roomType: sel.roomType, adults, children: childAges.length, childAges, extraBed: fit.needsExtraBed || (!!sel.extraBed && rt.extraBedAllowed) };
  });
  const nights: NightPrice[] = rooms.flatMap((r, room) =>
    nightList.map((night) => ({ room, roomType: r.roomType, ...nightlyRate(r.roomType, night, seasons, rates) })));
  const baseRoomTotal = money(nights.reduce((a, n) => a + n.price, 0));
  const hasPeak = nights.some((n) => n.season === 'PEAK');
  const ctx: Ctx = { nights, nightList, today, lead: daysBetween(today, i.checkIn), hasPeak, now: i.now, checkIn: i.checkIn, member: i.member ?? null };
  const active = promotions.filter((p) => p.active);

  // plan eligibility (US-05 ข้อ 3)
  const planPromo = (kind: Promotion['kind'], code?: string) => active.find((p) => p.grp === 'PLAN' && p.kind === kind && (!code || p.code === code));
  let packagePrice = 0;
  let packageLabel: { th: string; en: string } | null = null;
  let packageCode: string | null = null;
  if (i.plan === 'GREEN') {
    const p = planPromo('GREEN');
    if (!p || !seasonsOk(p, ctx) || !windowOk(p, ctx)) throw notEligible('แพ็กเกจ Green Season ใช้ได้เมื่อพักช่วง Low ทุกคืนและอย่างน้อย 2 คืน', 'Green Season Getaway needs 2+ nights, all in Low season');
    packageCode = p.code;
  }
  if (i.plan === 'HONEYMOON') {
    const p = planPromo('HONEYMOON');
    if (!p || !rooms.every((r) => p.rules.roomTypes?.includes(r.roomType)) || !windowOk(p, ctx)) {
      throw notEligible('แพ็กเกจฮันนีมูนใช้ได้กับ Pool Access และ Pool Villa พัก 2 คืนขึ้นไป จองล่วงหน้าอย่างน้อย 3 วัน', 'Honeymoon needs Pool Access or Pool Villa, 2+ nights, booked 3+ days ahead');
    }
    packagePrice = p.value; packageLabel = { th: p.nameTh, en: p.nameEn }; packageCode = p.code;
  }
  if (i.plan === 'FESTIVAL') {
    const p = planPromo('FESTIVAL', i.festivalCode);
    const inWindow = p && nightList.some((n) => n >= (p.rules.stayFrom ?? '') && n <= (p.rules.stayTo ?? '9999'));
    if (!p || !inWindow) throw notEligible('แพ็กเกจเทศกาลนี้ไม่ตรงกับวันที่เข้าพัก', 'This festival package does not match your dates');
    packagePrice = p.value; packageLabel = { th: p.nameTh, en: p.nameEn }; packageCode = p.code;
  }

  // 2 · best single price promotion (US-16)
  let pricePromo: Quote['pricePromo'] = null;
  for (const p of active) {
    const s = priceSaving(p, ctx, i.rooms);
    if (s !== null && (!pricePromo || s > pricePromo.saved)) pricePromo = { code: p.code, nameTh: p.nameTh, nameEn: p.nameEn, saved: s };
  }

  const stackNonref = active.find((p) => p.grp === 'STACK' && !p.memberOnly);
  const stackMember = active.find((p) => p.grp === 'STACK' && p.memberOnly);
  if (i.nonref && !stackNonref) throw notEligible('ไม่มีราคาไม่คืนเงินในขณะนี้', 'Non-refundable rate is not available');
  if (i.redeemPoints && i.redeemPoints % 100 !== 0) {
    throw new RuleError('POINTS_STEP', { th: 'แลกแต้มได้ชุดละ 100 แต้ม', en: 'Points can be redeemed in sets of 100' });
  }

  // extras that are never discounted (step 6)
  const breakfastLines = (() => {
    const famSummer = planPromo('FAMILY_SUMMER');
    let amount = 0;
    if (i.plan === 'BREAKFAST') {
      for (const r of rooms) for (const n of nightList) {
        const kidsFree = famSummer && n >= (famSummer.rules.stayFrom ?? '') && n <= (famSummer.rules.stayTo ?? '');
        amount += r.adults * PRICES.breakfastAdult;
        if (!kidsFree) amount += r.childAges.filter((a) => a >= PRICES.breakfastFreeUnder).length * PRICES.breakfastChild;
      }
    }
    return amount;
  })();
  const extraBedTotal = rooms.filter((r) => r.extraBed).length * nightList.length * PRICES.extraBed;
  const addonTotal = (i.addons ?? []).reduce((a, x) => a + x.price, 0);

  const run = (asMember: boolean) => {
    const lines: PriceLine[] = [];
    const applied: { code: string; saved: number }[] = [];
    lines.push({ kind: 'NIGHTS', labelTh: `ค่าห้อง ${nightList.length} คืน × ${rooms.length} ห้อง`, labelEn: `Room ${nightList.length} night(s) × ${rooms.length} room(s)`, amount: baseRoomTotal });
    let room = baseRoomTotal;
    if (pricePromo) {
      room = money(room - pricePromo.saved);
      lines.push({ kind: 'PROMO', labelTh: pricePromo.nameTh, labelEn: pricePromo.nameEn, amount: -pricePromo.saved });
      applied.push({ code: pricePromo.code, saved: pricePromo.saved });
    }
    if (i.nonref && stackNonref) {
      const d = money(room * stackNonref.value / 100);
      room = money(room - d);
      lines.push({ kind: 'NONREF', labelTh: `${stackNonref.nameTh} −${stackNonref.value}%`, labelEn: `${stackNonref.nameEn} −${stackNonref.value}%`, amount: -d });
      applied.push({ code: stackNonref.code, saved: d });
    }
    if (asMember && stackMember) {
      const d = money(room * stackMember.value / 100);
      room = money(room - d);
      lines.push({ kind: 'MEMBER', labelTh: `${stackMember.nameTh} −${stackMember.value}%`, labelEn: `${stackMember.nameEn} −${stackMember.value}%`, amount: -d });
      applied.push({ code: stackMember.code, saved: d });
    }
    let codeError: Msg | undefined;
    let codeApplied = false;
    if (i.code) {
      const err = codeCheck(i.code, room, today);
      if (err) codeError = err;
      else {
        const d = money(Math.min(i.code.discount, room));
        room = money(room - d);
        codeApplied = true;
        lines.push({ kind: 'CODE', labelTh: `โค้ด ${i.code.code}`, labelEn: `Code ${i.code.code}`, amount: -d });
      }
    }
    if (i.redeemPoints) {
      const d = money(Math.min(i.redeemPoints, room));
      room = money(room - d);
      lines.push({ kind: 'POINTS', labelTh: `แลก ${i.redeemPoints} แต้ม`, labelEn: `Redeem ${i.redeemPoints} points`, amount: -d });
    }
    if (breakfastLines) lines.push({ kind: 'BREAKFAST', labelTh: 'อาหารเช้า', labelEn: 'Breakfast', amount: breakfastLines });
    if (i.plan === 'GREEN') lines.push({ kind: 'BREAKFAST', labelTh: 'อาหารเช้า 2 ท่าน + Late check-out 15:00 (รวมในแพ็กเกจ)', labelEn: 'Breakfast for 2 + 15:00 late check-out (included)', amount: 0 });
    if (extraBedTotal) lines.push({ kind: 'EXTRA_BED', labelTh: 'เตียงเสริม', labelEn: 'Extra bed', amount: extraBedTotal });
    if (packageLabel) lines.push({ kind: 'PACKAGE', labelTh: packageLabel.th, labelEn: packageLabel.en, amount: packagePrice });
    for (const a of i.addons ?? []) lines.push({ kind: 'ADDON', labelTh: a.labelTh, labelEn: a.labelEn, amount: a.price });
    const sum = money(room + breakfastLines + extraBedTotal + packagePrice + addonTotal);
    const total = Math.floor(sum + 1e-9); // ปัดลงครั้งเดียวที่ยอดสุดท้าย (§5)
    if (total !== sum) lines.push({ kind: 'ROUNDING', labelTh: 'ปัดเศษสตางค์', labelEn: 'Rounding', amount: money(total - sum) });
    return { lines, applied, room, total, codeError, codeApplied };
  };

  const isMember = !!i.member?.verified;
  const r = run(isMember);
  const memberPrice = !isMember && stackMember ? run(true).total : null;
  const deposit = i.nonref ? r.total : Math.floor(r.total * RULES.depositRate);
  if (packageCode) r.applied.push({ code: packageCode, saved: 0 });
  return {
    nights,
    rooms,
    hasPeak,
    baseRoomTotal,
    pricePromo,
    appliedPromos: r.applied,
    lines: r.lines,
    roomTotal: r.room,
    total: r.total,
    deposit,
    dueAtHotel: r.total - deposit,
    saved: money(baseRoomTotal - r.room),
    pointsToEarn: Math.floor(r.room / 100),
    memberPrice,
    freeCancelUntil: i.nonref ? null : freeCancelUntil(i.checkIn, hasPeak),
    codeError: r.codeError,
    codeApplied: r.codeApplied,
  };
}
