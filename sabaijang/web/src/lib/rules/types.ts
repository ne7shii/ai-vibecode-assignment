export type SeasonKind = 'LOW' | 'HIGH' | 'PEAK';
export type Msg = { th: string; en: string };

export interface Season { kind: SeasonKind; start: string; end: string }

export interface RateTable {
  season: Record<string, Record<SeasonKind, number>>;
  date: Record<string, Record<string, number>>;
}

export interface RoomTypeSpec { code: string; maxAdults: number; maxTotal: number; extraBedAllowed: boolean }

export interface PromoRules {
  minLeadDays?: number;
  maxLeadDays?: number;
  minNights?: number;
  allSeasons?: SeasonKind[];
  noPeak?: boolean;
  roomTypes?: string[];
  stayFrom?: string;
  stayTo?: string;
  saleFrom?: string;   // ISO instant
  saleTo?: string;
  bookFrom?: string;   // date
  bookTo?: string;
  blackout?: string[];
  birthday?: boolean;
  every?: number;
  flash?: boolean;
}

export interface Promotion {
  code: string;
  grp: 'PRICE' | 'STACK' | 'PLAN';
  kind: 'PERCENT' | 'AMOUNT' | 'FREE_NIGHT' | 'GREEN' | 'HONEYMOON' | 'FAMILY_SUMMER' | 'FESTIVAL';
  nameTh: string;
  nameEn: string;
  value: number;
  rules: PromoRules;
  quota: number | null;
  used: number;
  memberOnly: boolean;
  active: boolean;
}

export interface PromoCode {
  code: string;
  discount: number;
  minRoomTotal: number;
  validUntil: string;
  maxUses: number | null;
  used: number;
  active: boolean;
}

export class RuleError extends Error {
  constructor(public code: string, public msg: Msg, public extra: Record<string, unknown> = {}) {
    super(`${code}: ${msg.en}`);
  }
}

export const money = (n: number) => Math.round(n * 100) / 100;
export const baht = (n: number) => `฿${Math.round(n).toLocaleString('en-US')}`;
