// Reports (US-54): occupancy per type per day/month, revenue + ADR by season, promotion and code usage, Excel export.
import ExcelJS from 'exceljs';
import { query } from '@/lib/db';
import { getClock } from '@/lib/clock-db';
import { bkk } from '@/lib/clock';
import { addDays, daysBetween } from '@/lib/rules/calendar';
import { RuleError, money } from '@/lib/rules/types';
import { isDate } from './common';

const SOLD = `('CONFIRMED','CHECKED_IN','CHECKED_OUT')`;
const rate = (sold: number, total: number) => (total ? Math.round((sold / total) * 10000) / 10000 : 0);

export async function reportRange(i: { from?: string | null; to?: string | null }) {
  let { from, to } = i;
  if (!from || !to) {
    const today = bkk((await getClock()).now()).date;
    from ||= `${today.slice(0, 7)}-01`;
    to ||= addDays(`${addDays(`${from.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1);
  }
  if (!isDate(from) || !isDate(to)) throw new RuleError('BAD_INPUT', { th: 'วันที่ไม่ถูกต้อง', en: 'Invalid date' });
  if (to < from) throw new RuleError('BAD_RANGE', { th: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', en: 'End date must not be before start date' });
  if (daysBetween(from, to) > 400) throw new RuleError('BAD_RANGE', { th: 'ช่วงรายงานยาวได้ไม่เกิน 400 วัน', en: 'Report range is limited to 400 days' });
  return { from, to };
}

export type Report = Awaited<ReturnType<typeof buildReport>>;

export async function buildReport(i: { from?: string | null; to?: string | null }) {
  const { from, to } = await reportRange(i);
  const [types, inv, rev, revType, promos, codes] = await Promise.all([
    query('SELECT code, name_th, name_en FROM room_types ORDER BY sort'),
    query(`SELECT room_type_code, night, total, sold, closed FROM inventory_nights WHERE night BETWEEN $1 AND $2 ORDER BY night, room_type_code`, [from, to]),
    query(nightRevenueSql('bn.season_kind'), [from, to]),
    query(nightRevenueSql('br.room_type_code'), [from, to]),
    query(
      `SELECT p.code, p.name_th, p.name_en, p.grp, p.active, COALESCE(u.bookings, 0)::int AS bookings, COALESCE(u.saved, 0) AS saved
       FROM promotions p LEFT JOIN (
         SELECT bp.promotion_code, count(DISTINCT b.code) AS bookings, SUM(bp.saved) AS saved
         FROM booking_promotions bp JOIN bookings b ON b.code = bp.booking_code
         WHERE b.status IN ${SOLD} AND b.check_in BETWEEN $1 AND $2 GROUP BY 1
       ) u ON u.promotion_code = p.code ORDER BY p.sort, p.code`, [from, to]),
    query(
      `SELECT c.code, c.active, COALESCE(u.bookings, 0)::int AS bookings, COALESCE(u.discount, 0) AS discount
       FROM promo_codes c LEFT JOIN (
         SELECT b.promo_code, count(DISTINCT b.code) AS bookings, -SUM(pl.amount) AS discount
         FROM bookings b JOIN booking_price_lines pl ON pl.booking_code = b.code AND pl.kind = 'CODE'
         WHERE b.status IN ${SOLD} AND b.check_in BETWEEN $1 AND $2 AND b.promo_code IS NOT NULL GROUP BY 1
       ) u ON u.promo_code = c.code ORDER BY bookings DESC, c.code`, [from, to]),
  ]);

  const typeCodes = types.rows.map((t) => t.code as string);
  const dailyMap = new Map<string, Record<string, { sold: number; total: number; rate: number }>>();
  for (const r of inv.rows) {
    const d = dailyMap.get(r.night) ?? {};
    d[r.room_type_code] = { sold: r.sold, total: r.total, rate: rate(r.sold, r.total) };
    dailyMap.set(r.night, d);
  }
  const daily = [];
  for (let d = from; d <= to; d = addDays(d, 1)) {
    const byType = dailyMap.get(d) ?? {};
    const sold = Object.values(byType).reduce((a, x) => a + x.sold, 0);
    const total = Object.values(byType).reduce((a, x) => a + x.total, 0);
    daily.push({ date: d, byType, sold, total, rate: rate(sold, total) });
  }
  const monthMap = new Map<string, Record<string, { sold: number; total: number; rate: number }>>();
  for (const day of daily) {
    const m = monthMap.get(day.date.slice(0, 7)) ?? {};
    for (const [t, v] of Object.entries(day.byType)) {
      const cur = (m[t] ??= { sold: 0, total: 0, rate: 0 });
      cur.sold += v.sold; cur.total += v.total; cur.rate = rate(cur.sold, cur.total);
    }
    monthMap.set(day.date.slice(0, 7), m);
  }
  const monthly = [...monthMap.entries()].map(([month, byType]) => {
    const sold = Object.values(byType).reduce((a, x) => a + x.sold, 0);
    const total = Object.values(byType).reduce((a, x) => a + x.total, 0);
    return { month, byType, sold, total, rate: rate(sold, total) };
  });

  const seasonOrder = ['LOW', 'HIGH', 'PEAK'];
  const bySeason = seasonOrder.map((s) => {
    const r = rev.rows.find((x) => x.k === s);
    const roomNights = r ? Number(r.nights) : 0;
    const revenue = r ? money(Number(r.revenue)) : 0;
    return { season: s, roomNights, revenue, adr: roomNights ? money(revenue / roomNights) : 0 };
  });
  const totalNights = bySeason.reduce((a, s) => a + s.roomNights, 0);
  const totalRevenue = money(bySeason.reduce((a, s) => a + s.revenue, 0));
  const byRoomType = typeCodes.map((t) => {
    const r = revType.rows.find((x) => x.k === t);
    const roomNights = r ? Number(r.nights) : 0;
    const revenue = r ? money(Number(r.revenue)) : 0;
    return { roomType: t, roomNights, revenue, adr: roomNights ? money(revenue / roomNights) : 0 };
  });

  return {
    from, to,
    roomTypes: types.rows.map((t) => ({ code: t.code as string, nameTh: t.name_th as string, nameEn: t.name_en as string })),
    occupancy: { daily, monthly },
    revenue: { bySeason, byRoomType, total: { roomNights: totalNights, revenue: totalRevenue, adr: totalNights ? money(totalRevenue / totalNights) : 0 } },
    promotions: promos.rows.map((p) => ({ code: p.code as string, nameTh: p.name_th as string, nameEn: p.name_en as string, grp: p.grp as string, active: p.active as boolean, bookings: p.bookings as number, discount: money(Number(p.saved)) })),
    codes: codes.rows.map((c) => ({ code: c.code as string, active: c.active as boolean, bookings: c.bookings as number, discount: money(Number(c.discount)) })),
  };
}

/** Room revenue per sold night: the booking's room total after discounts spread over its nights by base price. */
function nightRevenueSql(groupBy: string) {
  return `WITH bk AS (
      SELECT b.code, b.room_total, SUM(bn.base_price) AS base, count(*) AS n
      FROM bookings b JOIN booking_rooms br ON br.booking_code = b.code JOIN booking_nights bn ON bn.booking_room_id = br.id
      WHERE b.status IN ${SOLD} GROUP BY b.code, b.room_total)
    SELECT ${groupBy} AS k, count(*) AS nights,
      SUM(CASE WHEN bk.base > 0 THEN bn.base_price * bk.room_total / bk.base ELSE bk.room_total / bk.n END) AS revenue
    FROM booking_nights bn JOIN booking_rooms br ON br.id = bn.booking_room_id JOIN bk ON bk.code = br.booking_code
    WHERE bn.night BETWEEN $1 AND $2 GROUP BY 1`;
}

/** US-54 ข้อ 4: same data as an .xlsx workbook. */
export async function exportReport(i: { from?: string | null; to?: string | null }): Promise<Buffer> {
  const r = await buildReport(i);
  const wb = new ExcelJS.Workbook();
  wb.creator = 'CWN Sabai Jang Resort';
  const types = r.roomTypes.map((t) => t.code);
  const head = (ws: ExcelJS.Worksheet) => { ws.getRow(1).font = { bold: true }; ws.views = [{ state: 'frozen', ySplit: 1 }]; };
  const pct = '0.0%';

  const d = wb.addWorksheet('Occupancy daily');
  d.columns = [{ header: 'Date', key: 'date', width: 12 }, ...types.flatMap((t) => [{ header: `${t} sold`, key: `${t}s`, width: 9 }, { header: `${t} %`, key: `${t}r`, width: 8, style: { numFmt: pct } }]),
    { header: 'Sold', key: 'sold', width: 8 }, { header: 'Total', key: 'total', width: 8 }, { header: 'Occupancy', key: 'rate', width: 11, style: { numFmt: pct } }];
  for (const day of r.occupancy.daily) d.addRow({ date: day.date, sold: day.sold, total: day.total, rate: day.rate, ...Object.fromEntries(types.flatMap((t) => [[`${t}s`, day.byType[t]?.sold ?? 0], [`${t}r`, day.byType[t]?.rate ?? 0]])) });
  head(d);

  const m = wb.addWorksheet('Occupancy monthly');
  m.columns = [{ header: 'Month', key: 'month', width: 10 }, ...types.flatMap((t) => [{ header: `${t} sold`, key: `${t}s`, width: 9 }, { header: `${t} %`, key: `${t}r`, width: 8, style: { numFmt: pct } }]),
    { header: 'Sold', key: 'sold', width: 8 }, { header: 'Total', key: 'total', width: 8 }, { header: 'Occupancy', key: 'rate', width: 11, style: { numFmt: pct } }];
  for (const mo of r.occupancy.monthly) m.addRow({ month: mo.month, sold: mo.sold, total: mo.total, rate: mo.rate, ...Object.fromEntries(types.flatMap((t) => [[`${t}s`, mo.byType[t]?.sold ?? 0], [`${t}r`, mo.byType[t]?.rate ?? 0]])) });
  head(m);

  const v = wb.addWorksheet('Revenue by season');
  v.columns = [{ header: 'Season', key: 'season', width: 12 }, { header: 'Room nights', key: 'roomNights', width: 12 }, { header: 'Room revenue (THB)', key: 'revenue', width: 18, style: { numFmt: '#,##0.00' } }, { header: 'ADR (THB)', key: 'adr', width: 12, style: { numFmt: '#,##0.00' } }];
  for (const s of r.revenue.bySeason) v.addRow(s);
  v.addRow({ season: 'Total', ...r.revenue.total }).font = { bold: true };
  v.addRow({});
  v.addRow({ season: 'Room type', roomNights: 'Room nights', revenue: 'Room revenue (THB)', adr: 'ADR (THB)' }).font = { bold: true };
  for (const t of r.revenue.byRoomType) v.addRow({ season: t.roomType, roomNights: t.roomNights, revenue: t.revenue, adr: t.adr });
  head(v);

  const p = wb.addWorksheet('Promotions');
  p.columns = [{ header: 'Code', key: 'code', width: 10 }, { header: 'Name (TH)', key: 'nameTh', width: 28 }, { header: 'Name (EN)', key: 'nameEn', width: 28 }, { header: 'Group', key: 'grp', width: 8 }, { header: 'Active', key: 'active', width: 8 }, { header: 'Bookings', key: 'bookings', width: 10 }, { header: 'Discount (THB)', key: 'discount', width: 15, style: { numFmt: '#,##0.00' } }];
  for (const x of r.promotions) p.addRow({ ...x, active: x.active ? 'yes' : 'no' });
  head(p);

  const c = wb.addWorksheet('Codes');
  c.columns = [{ header: 'Code', key: 'code', width: 14 }, { header: 'Active', key: 'active', width: 8 }, { header: 'Bookings', key: 'bookings', width: 10 }, { header: 'Discount (THB)', key: 'discount', width: 15, style: { numFmt: '#,##0.00' } }];
  for (const x of r.codes) c.addRow({ ...x, active: x.active ? 'yes' : 'no' });
  head(c);

  for (const ws of wb.worksheets) ws.headerFooter.oddHeader = `CWN Sabai Jang Resort · ${r.from} – ${r.to}`;
  return Buffer.from(await wb.xlsx.writeBuffer());
}
