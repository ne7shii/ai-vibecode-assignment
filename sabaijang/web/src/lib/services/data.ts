import { query, Db } from '@/lib/db';
import type { Promotion, PromoCode, RateTable, RoomTypeSpec, Season } from '@/lib/rules/types';
import type { Actor } from '@/lib/auth';
import type { MemberCtx } from '@/lib/rules/pricing';

export interface RoomTypeInfo extends RoomTypeSpec {
  nameTh: string; nameEn: string; descTh: string; descEn: string;
  sizeSqm: number; bedTh: string; bedEn: string; viewTh: string; viewEn: string;
  totalRooms: number; amenities: string[]; amenitiesEn: string[]; pano: string | null; sort: number;
  photos: { file: string; captionTh: string; captionEn: string }[];
}

export interface RuleData {
  seasons: Season[];
  rates: RateTable;
  roomTypes: Record<string, RoomTypeInfo>;
  promotions: Promotion[];
}

export async function loadRoomTypes(db?: Db): Promise<Record<string, RoomTypeInfo>> {
  const [{ rows }, photos] = await Promise.all([
    query('SELECT * FROM room_types ORDER BY sort', [], db),
    query('SELECT * FROM room_photos ORDER BY room_type_code, sort', [], db),
  ]);
  const out: Record<string, RoomTypeInfo> = {};
  for (const r of rows) {
    out[r.code] = {
      code: r.code, maxAdults: r.max_adults, maxTotal: r.max_total, extraBedAllowed: r.extra_bed_allowed,
      nameTh: r.name_th, nameEn: r.name_en, descTh: r.desc_th, descEn: r.desc_en, sizeSqm: r.size_sqm,
      bedTh: r.bed_th, bedEn: r.bed_en, viewTh: r.view_th, viewEn: r.view_en, totalRooms: r.total_rooms,
      amenities: r.amenities, amenitiesEn: r.amenities_en ?? r.amenities, pano: r.pano_file, sort: r.sort,
      photos: photos.rows.filter((p) => p.room_type_code === r.code).map((p) => ({ file: p.file, captionTh: p.caption_th, captionEn: p.caption_en })),
    };
  }
  return out;
}

export function mapPromotion(r: Record<string, any>): Promotion {
  return {
    code: r.code, grp: r.grp, kind: r.kind, nameTh: r.name_th, nameEn: r.name_en, value: r.value,
    rules: r.rules ?? {}, quota: r.quota, used: r.used, memberOnly: r.member_only, active: r.active,
  };
}

export async function loadRuleData(db?: Db): Promise<RuleData> {
  const [seasons, rates, dates, promos, roomTypes] = await Promise.all([
    query('SELECT kind, start_date, end_date FROM seasons', [], db),
    query('SELECT room_type_code, kind, price FROM season_rates', [], db),
    query('SELECT room_type_code, night, price FROM date_rates', [], db),
    query('SELECT * FROM promotions ORDER BY sort, code', [], db),
    loadRoomTypes(db),
  ]);
  const table: RateTable = { season: {}, date: {} };
  for (const r of rates.rows) (table.season[r.room_type_code] ??= {} as RateTable['season'][string])[r.kind as 'LOW'] = r.price;
  for (const r of dates.rows) (table.date[r.room_type_code] ??= {})[r.night] = r.price;
  return {
    seasons: seasons.rows.map((s) => ({ kind: s.kind, start: s.start_date, end: s.end_date })),
    rates: table,
    roomTypes,
    promotions: promos.rows.map(mapPromotion),
  };
}

export async function loadCode(code: string | null | undefined, db?: Db): Promise<PromoCode | null> {
  if (!code) return null;
  const { rows } = await query('SELECT * FROM promo_codes WHERE code = upper($1)', [code.trim()], db);
  const r = rows[0];
  if (!r) return { code: code.trim().toUpperCase(), discount: 0, minRoomTotal: 0, validUntil: '1970-01-01', maxUses: 0, used: 0, active: false };
  return { code: r.code, discount: r.discount, minRoomTotal: r.min_room_total, validUntil: r.valid_until, maxUses: r.max_uses, used: r.used, active: r.active };
}

export async function memberCtx(actor: Actor, db?: Db): Promise<MemberCtx | null> {
  if (actor.kind !== 'member') return null;
  const { rows } = await query<{ year: number }>('SELECT year FROM birthday_redemptions WHERE user_id = $1', [actor.user.id], db);
  return { verified: actor.user.verified, birthDate: actor.user.birthDate, birthdayUsedYears: rows.map((r) => r.year) };
}

export async function pointsBalance(userId: number, db?: Db): Promise<number> {
  const { rows } = await query<{ n: number }>('SELECT COALESCE(SUM(delta),0)::int AS n FROM points_ledger WHERE user_id = $1', [userId], db);
  return rows[0].n;
}
