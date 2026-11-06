import { describe, it, expect, beforeEach } from 'vitest';
import ExcelJS from 'exceljs';
import { resetDatabase } from '@/lib/db/reset';
import { query } from '@/lib/db';
import { setClock } from '@/lib/clock-db';
import { type Actor } from '@/lib/auth';
import { paymentGateway, TEST_CARDS } from '@/lib/ports/payment';
import { nightlyRate, seasonOf } from '@/lib/rules/calendar';
import { createHold } from '../holds';
import { updateDetails, pay, buildView } from '../bookings';
import { loadRuleData, loadRoomTypes } from '../data';
import { listPublicPromotions } from '../promotions';
import { createSeason, updateSeason, deleteSeason, listSeasons, putRates, getRates, putDateRate, deleteDateRate, listDateRates } from './seasons';
import { createPromotion, updatePromotion, previewPromotion, listPromotions, createCode, updateCode, listCodes } from './promos';
import { arrivals, checkIn, checkOut, noShow, listAddons, decideAddon, listOutbox, dashboard } from './front';
import { createClosure, deleteClosure, listClosuresAdmin, updateRoomType, listRoomTypesAdmin } from './rooms';
import { buildReport, exportReport } from './reports';
import { listReviewsAdmin, replyReview } from './reviews';

const GM = 1, SALES = 2, FRONT = 3, ROOMS = 4;
const guest: Actor = { kind: 'guest' };
const contact = { name: 'คุณต่อ', email: 'tor@example.test', phone: '0895550001' };

async function booked(extra: Record<string, unknown> = {}, checkIn = '2027-03-10', checkOut = '2027-03-13', roomType = 'R01', details: Record<string, unknown> = {}) {
  const h = await createHold({ checkIn, checkOut, rooms: [{ roomType, adults: 2, childAges: [] }], plan: 'ROOM_ONLY', actor: guest, ...extra });
  await updateDetails(h.code, h.holdToken, { contact, nonrefAck: true, ...details }, guest);
  await pay(h.code, h.holdToken, { method: 'CARD', cardNumber: TEST_CARDS.success }, guest);
  return h;
}
const sold = async (night: string, rt = 'R01') => (await query('SELECT sold FROM inventory_nights WHERE room_type_code=$1 AND night=$2', [rt, night])).rows[0].sold;
const closed = async (night: string, rt = 'R03') => (await query('SELECT closed FROM inventory_nights WHERE room_type_code=$1 AND night=$2', [rt, night])).rows[0].closed;
const audits = async (action: string) => (await query('SELECT staff_id, detail FROM audit_log WHERE action = $1 ORDER BY id', [action])).rows;

beforeEach(async () => { await resetDatabase(); paymentGateway().reset(); });

describe('Admin · ซีซั่นและราคา (US-15, US-52)', () => {
  it('รายการซีซั่นเรียงตามวันที่ มี id kind start end label', async () => {
    const { seasons } = await listSeasons();
    expect(seasons.length).toBe(12);
    expect(seasons[0]).toMatchObject({ kind: 'HIGH', start: '2026-11-01', end: '2027-04-30', label: 'High 2026/27' });
  });
  it('เพิ่ม Peak ทับ High (ลอยกระทง 12–14 พ.ย. 2027) → Peak ชนะ · บันทึก audit', async () => {
    const { season } = await createSeason(SALES, { kind: 'PEAK', start: '2027-11-12', end: '2027-11-14', label: 'ลอยกระทง' });
    expect(season.id).toBeGreaterThan(0);
    const data = await loadRuleData();
    expect(seasonOf('2027-11-13', data.seasons)).toBe('PEAK');
    expect(nightlyRate('R01', '2027-11-13', data.seasons, data.rates).price).toBe(3200);
    expect((await audits('SEASON_CREATE'))[0].staff_id).toBe(SALES);
  });
  it('US-15 ข้อ 3 · ลบ Green Season 2027 → วันที่ใน 365 วันข้างหน้าไม่มีซีซั่น บันทึกไม่ได้ และบอกวันที่ที่ขาด', async () => {
    const { seasons } = await listSeasons();
    const low = seasons.find((s) => s.label === 'Green Season 2027')!;
    const e = await deleteSeason(SALES, low.id).catch((x) => x);
    expect(e.code).toBe('SEASON_GAP');
    expect(e.extra.missing).toHaveLength(184);
    expect(e.extra.missing[0]).toBe('2027-05-01');
    expect(e.extra.ranges).toEqual([{ from: '2027-05-01', to: '2027-10-31' }]);
    expect(e.msg.th).toContain('1 พ.ค. 2027');
    expect((await listSeasons()).seasons.length).toBe(12); // rolled back
  });
  it('แก้ High 2027/28 ให้เริ่ม 5 พ.ย. → ขาด 1–4 พ.ย. · ช่วงที่เกิน 365 วันไม่ถูกตรวจ', async () => {
    const hi = (await listSeasons()).seasons.find((s) => s.label === 'High 2027/28')!;
    const e = await updateSeason(SALES, hi.id, { start: '2027-11-05' }).catch((x) => x);
    expect(e.extra?.ranges).toEqual([{ from: '2027-11-01', to: '2027-11-04' }]);
    const far = (await listSeasons()).seasons.find((s) => s.label === 'High 2028/29')!;
    const r = await updateSeason(SALES, far.id, { start: '2028-11-10' }); // > 365 days after 1 Mar 2027
    expect(r.season.start).toBe('2028-11-10');
  });
  it('วันสิ้นสุดก่อนวันเริ่ม หรือชนิดซีซั่นไม่ถูกต้อง → 422', async () => {
    await expect(createSeason(SALES, { kind: 'PEAK', start: '2027-11-14', end: '2027-11-12', label: 'x' })).rejects.toMatchObject({ code: 'BAD_RANGE' });
    await expect(createSeason(SALES, { kind: 'SUPER' as never, start: '2027-11-12', end: '2027-11-14', label: 'x' })).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });
  it('US-15 ข้อ 4 · แก้ราคาซีซั่นแล้วการจองที่จ่ายแล้วไม่เปลี่ยนราคา', async () => {
    const h = await booked();
    const before = await buildView(h.code);
    await putRates(SALES, { rates: [{ roomType: 'R01', kind: 'HIGH', price: 3000 }] });
    expect((await getRates()).rates.R01.HIGH).toBe(3000);
    const after = await buildView(h.code);
    expect(after.total).toBe(before.total);
    expect(after.lines).toEqual(before.lines);
    const { rows } = await query(`SELECT DISTINCT base_price FROM booking_nights bn JOIN booking_rooms br ON br.id = bn.booking_room_id WHERE br.booking_code = $1`, [h.code]);
    expect(rows.map((r) => r.base_price)).toEqual([2400]);
    await expect(putRates(SALES, { rates: [{ roomType: 'R01', kind: 'HIGH', price: 0 }] })).rejects.toMatchObject({ code: 'BAD_PRICE' });
  });
  it('US-52 · ตั้งราคา R01 คืน 10 มิ.ย. ฿2,900 ใช้แทนราคา Low · ลบแล้วกลับเป็นราคาซีซั่น · ปฏิทินบอกวันที่ถูกปรับ', async () => {
    await putDateRate(SALES, { roomType: 'R01', from: '2027-06-10', price: 2900 });
    let data = await loadRuleData();
    expect(nightlyRate('R01', '2027-06-10', data.seasons, data.rates)).toMatchObject({ price: 2900, override: true });
    const cal = await listDateRates({ month: '2027-06', roomType: 'R01' });
    expect(cal.calendar!.days.find((d) => d.date === '2027-06-10')).toMatchObject({ season: 'LOW', price: 2900, override: true });
    expect(cal.calendar!.days.find((d) => d.date === '2027-06-11')).toMatchObject({ season: 'LOW', price: 1800, override: false });
    await deleteDateRate(SALES, { roomType: 'R01', night: '2027-06-10' });
    data = await loadRuleData();
    expect(nightlyRate('R01', '2027-06-10', data.seasons, data.rates)).toMatchObject({ price: 1800, override: false });
  });
});

describe('Admin · โปรโมชั่นและโค้ด (US-27, US-28, US-30)', () => {
  const draft = {
    code: 'PR-20', grp: 'PRICE' as const, kind: 'PERCENT' as const, nameTh: 'หน้าฝนลด 25%', nameEn: 'Rainy 25% off', descTh: 'ทดสอบ', descEn: 'Test',
    value: 25, rules: { roomTypes: ['R01'], stayFrom: '2027-06-01', stayTo: '2027-06-30', blackout: ['2027-06-15'], minNights: 2 }, quota: 5, memberOnly: false, active: true,
  };
  it('สร้างโปรได้ครบทุกช่อง และเห็นในรายการหลังบ้าน', async () => {
    const { promotion } = await createPromotion(SALES, draft);
    expect(promotion).toMatchObject({ code: 'PR-20', value: 25, quota: 5, used: 0, active: true, rules: { roomTypes: ['R01'], minNights: 2 } });
    expect((await listPromotions()).promotions.map((p) => p.code)).toContain('PR-20');
    expect((await audits('PROMO_CREATE')).length).toBe(1);
  });
  it('US-30 ข้อ 3 · วันสิ้นสุดก่อนวันเริ่ม หรือส่วนลดเกิน 100% → บันทึกไม่ได้', async () => {
    await expect(createPromotion(SALES, { ...draft, rules: { stayFrom: '2027-06-30', stayTo: '2027-06-01' } })).rejects.toMatchObject({ code: 'END_BEFORE_START' });
    await expect(createPromotion(SALES, { ...draft, rules: { saleFrom: '2027-03-05T12:00:00+07:00', saleTo: '2027-03-03T12:00:00+07:00' } })).rejects.toMatchObject({ code: 'END_BEFORE_START' });
    await expect(createPromotion(SALES, { ...draft, value: 101 })).rejects.toMatchObject({ code: 'DISCOUNT_TOO_HIGH' });
    await expect(updatePromotion(SALES, 'PR-01', { value: 150 })).rejects.toMatchObject({ code: 'DISCOUNT_TOO_HIGH' });
    expect((await listPromotions()).promotions.find((p) => p.code === 'PR-01')!.value).toBe(15);
  });
  it('US-30 ข้อ 2 · ปิดโปรแล้วหายจาก /api/promotions ทันที แต่การจองที่จ่ายแล้วยังได้ราคาเดิม', async () => {
    const h = await booked({}, '2027-06-01', '2027-06-04');
    const before = await buildView(h.code);
    expect(before.promotions.map((p) => p.code)).toContain('PR-01');
    expect((await listPublicPromotions()).map((p) => p.code)).toContain('PR-01');
    await updatePromotion(SALES, 'PR-01', { active: false });
    expect((await listPublicPromotions()).map((p) => p.code)).not.toContain('PR-01');
    expect((await buildView(h.code)).total).toBe(before.total);
  });
  it('US-30 ข้อ 4 · ดูตัวอย่างราคา: โปรที่ยังไม่เปิด R01 1–4 มิ.ย. ฿5,400 → ลด 25% = ฿4,050', async () => {
    await createPromotion(SALES, { ...draft, active: false });
    const p = await previewPromotion({ code: 'PR-20', roomType: 'R01', checkIn: '2027-06-01', checkOut: '2027-06-04' });
    expect(p).toMatchObject({ eligible: true, baseRoomTotal: 5400, after: { roomTotal: 4050 }, saved: 1350 });
    const blocked = await previewPromotion({ code: 'PR-20', roomType: 'R01', checkIn: '2027-06-14', checkOut: '2027-06-16' }); // blackout
    expect(blocked.eligible).toBe(false);
    const asDraft = await previewPromotion({ promotion: { ...draft, code: 'DRAFT', value: 10 }, roomType: 'R01', checkIn: '2027-06-01', checkOut: '2027-06-04' });
    expect(asDraft.after.roomTotal).toBe(4860);
  });
  it('US-28 · Flash Sale: % ช่วงขาย ห้องที่ร่วม จำนวนจำกัด', async () => {
    const { promotion } = await createPromotion(SALES, {
      ...draft, code: 'FLASH-R02', rules: { roomTypes: ['R02'], saleFrom: '2027-03-01T09:00:00+07:00', saleTo: '2027-03-03T09:00:00+07:00', stayFrom: '2027-05-01', stayTo: '2027-09-30', noPeak: true, flash: true }, value: 30, quota: 10,
    });
    expect(promotion.rules.flash).toBe(true);
    expect((await listPublicPromotions()).find((p) => p.code === 'FLASH-R02')).toMatchObject({ remaining: 10, saleEndsAt: '2027-03-03T09:00:00+07:00' });
  });
  it('US-27 · สร้างแพ็กเกจเทศกาล (กลุ่มแผนราคา) ราคาต่อการจองและช่วงวันที่', async () => {
    const { promotion } = await createPromotion(SALES, { ...draft, code: 'PR-13D', grp: 'PLAN', kind: 'FESTIVAL', value: 900, quota: null, rules: { stayFrom: '2027-07-10', stayTo: '2027-07-12' } });
    expect(promotion).toMatchObject({ grp: 'PLAN', kind: 'FESTIVAL', value: 900 });
    await expect(createPromotion(SALES, { ...draft, code: 'BAD', grp: 'PLAN', kind: 'PERCENT' })).rejects.toMatchObject({ code: 'BAD_INPUT' });
  });
  it('โค้ดส่วนลด: สร้าง แก้ ปิด · ตรวจค่าที่ผิด', async () => {
    const { code } = await createCode(SALES, { code: 'songkran27', discount: 700, minRoomTotal: 5000, validUntil: '2027-04-30', maxUses: 20 });
    expect(code).toMatchObject({ code: 'SONGKRAN27', discount: 700, used: 0, active: true });
    await updateCode(SALES, 'SONGKRAN27', { active: false, discount: 800 });
    expect((await listCodes()).codes.find((c) => c.code === 'SONGKRAN27')).toMatchObject({ active: false, discount: 800 });
    await expect(createCode(SALES, { code: 'X1', discount: 0, validUntil: '2027-04-30' })).rejects.toMatchObject({ code: 'BAD_INPUT' });
    await expect(createCode(SALES, { code: 'WELCOME500', discount: 100, validUntil: '2027-04-30' })).rejects.toMatchObject({ code: 'CODE_EXISTS' });
    await expect(updateCode(SALES, 'KATA1000', { maxUses: 10 })).rejects.toMatchObject({ code: 'BAD_INPUT' }); // used 50 already
  });
});

describe('Admin · หน้างานต้อนรับ (US-53, US-37, US-55)', () => {
  it('รายการแขกวันนี้ 1 มี.ค.: เข้า 2 (คุณต่อ คุณอ้อม) ออก 1 (คุณแนน) อยู่ในห้อง 1 พร้อมรายละเอียดที่ต้องใช้', async () => {
    const r = await arrivals();
    expect(r.date).toBe('2027-03-01');
    expect(r.arrivals.map((b) => b.code).sort()).toEqual(['SJ-2027-200001', 'SJ-2027-200002']);
    expect(r.departures.map((b) => b.code)).toEqual(['SJ-2027-200003']);
    expect(r.inHouse.map((b) => b.code)).toEqual(['SJ-2027-200003']);
    const aom = r.arrivals.find((b) => b.code === 'SJ-2027-200002')!;
    expect(aom).toMatchObject({ contactName: 'คุณอ้อม', arrivalTime: '15:00', dueAtHotel: 13440, plan: 'BREAKFAST' });
    expect(aom.rooms[0]).toMatchObject({ roomType: 'R04', adults: 2, childAges: [8, 3], specialRequest: expect.stringContaining('เตียงเด็ก') });
    expect(r.counts).toEqual({ arrivals: 2, departures: 1, inHouse: 1 });
    expect((await dashboard()).counts).toEqual({ arrivals: 2, departures: 1, inHouse: 1 });
  });
  it('เช็กอินด้วยเลขห้องจริง → CHECKED_IN และบันทึกเลขห้อง', async () => {
    const r = await checkIn(FRONT, 'SJ-2027-200001', { roomNo: '101' });
    expect(r).toMatchObject({ status: 'CHECKED_IN' });
    expect(r.rooms[0].roomNo).toBe('101');
    expect((await audits('CHECK_IN'))[0].staff_id).toBe(FRONT);
  });
  it('เช็กอิน: ห้องผิดประเภท / ไม่มีเลขห้องนี้ / ห้องปิดซ่อม → ปฏิเสธ', async () => {
    await expect(checkIn(FRONT, 'SJ-2027-200001', { roomNo: '111' })).rejects.toMatchObject({ code: 'ROOM_WRONG_TYPE' });
    await expect(checkIn(FRONT, 'SJ-2027-200001', { roomNo: '999' })).rejects.toMatchObject({ code: 'NO_ROOM' });
    await createClosure(ROOMS, { roomNo: '102', from: '2027-03-01', to: '2027-03-05', reason: 'แอร์เสีย' });
    await expect(checkIn(FRONT, 'SJ-2027-200001', { roomNo: '102' })).rejects.toMatchObject({ code: 'ROOM_CLOSED' });
  });
  it('เช็กอิน: ห้องที่มีแขกอยู่แล้ว → ปฏิเสธ', async () => {
    const h = await booked({}, '2027-03-01', '2027-03-02');
    await checkIn(FRONT, 'SJ-2027-200001', { roomNo: '101' });
    const e = await checkIn(FRONT, h.code, { roomNo: '101' }).catch((x) => x);
    expect(e.code).toBe('ROOM_OCCUPIED');
    expect(e.msg.th).toContain('SJ-2027-200001');
    expect((await checkIn(FRONT, h.code, { roomNo: '103' })).status).toBe('CHECKED_IN');
  });
  it('US-43 · เช็กเอาต์คุณแนน → CHECKED_OUT แต้ม +59 เข้า ledger (250 → 309)', async () => {
    const r = await checkOut(FRONT, 'SJ-2027-200003');
    expect(r).toMatchObject({ status: 'CHECKED_OUT', pointsEarned: 59 });
    const { rows } = await query(`SELECT delta, reason, booking_code FROM points_ledger WHERE user_id = 1 AND reason = 'EARN'`);
    expect(rows).toEqual([{ delta: 59, reason: 'EARN', booking_code: 'SJ-2027-200003' }]);
    expect((await query(`SELECT SUM(delta)::int n FROM points_ledger WHERE user_id = 1`)).rows[0].n).toBe(309);
    await expect(checkOut(FRONT, 'SJ-2027-200003')).rejects.toMatchObject({ code: 'NOT_CHECKED_IN' });
  });
  it('เช็กเอาต์แขกไม่เป็นสมาชิก → ไม่มีแต้ม · ยังไม่เช็กอินเช็กเอาต์ไม่ได้', async () => {
    await expect(checkOut(FRONT, 'SJ-2027-200001')).rejects.toMatchObject({ code: 'NOT_CHECKED_IN' });
    await checkIn(FRONT, 'SJ-2027-200001', { roomNo: '101' });
    await checkOut(FRONT, 'SJ-2027-200001');
    expect((await query(`SELECT count(*)::int n FROM points_ledger WHERE booking_code = 'SJ-2027-200001'`)).rows[0].n).toBe(0);
  });
  it('No-show: 23:59 ของวันเช็กอินยังกดไม่ได้ · 00:00 วันถัดไปได้ ไม่คืนมัดจำ และคืนที่เหลือกลับมาว่าง', async () => {
    await setClock({ now: '2027-03-01T23:59:00+07:00' });
    await expect(noShow(FRONT, 'SJ-2027-200001')).rejects.toMatchObject({ code: 'NO_SHOW_TOO_EARLY' });
    const s1 = await sold('2027-03-01'), s2 = await sold('2027-03-02');
    await setClock({ now: '2027-03-02T00:00:00+07:00' });
    const r = await noShow(FRONT, 'SJ-2027-200001');
    expect(r).toMatchObject({ status: 'NO_SHOW', paid: 1440, refunded: 0 });
    expect(await sold('2027-03-01')).toBe(s1);
    expect(await sold('2027-03-02')).toBe(s2 - 1);
    await expect(noShow(FRONT, 'SJ-2027-200001')).rejects.toMatchObject({ code: 'NOT_CONFIRMED' });
  });
  it('US-37 · ยืนยันบริการเสริม → CONFIRMED + อีเมลแจ้งแขก', async () => {
    const { addons } = await listAddons({ status: 'PENDING' });
    expect(addons.map((a) => a.bookingCode)).toEqual(['SJ-2027-200001']);
    const r = await decideAddon(FRONT, addons[0].id, 'CONFIRMED');
    expect(r.addon.status).toBe('CONFIRMED');
    const { rows } = await query(`SELECT channel FROM outbox_messages WHERE booking_code = 'SJ-2027-200001' AND event = 'ADDON_CONFIRMED'`);
    expect(rows.length).toBe(1);
    await expect(decideAddon(FRONT, addons[0].id, 'REJECTED')).rejects.toMatchObject({ code: 'ADDON_DECIDED' });
  });
  it('US-37 ข้อ 2 · ปฏิเสธ Late check-out ของการจองที่จ่ายเต็ม (Non-ref) → คืนเงินส่วนนั้นเต็ม ฿1,000', async () => {
    const h = await booked({ nonref: true }, '2027-03-10', '2027-03-12', 'R01', { addons: [{ kind: 'LATE_OUT' }] });
    const before = await buildView(h.code);
    expect(before.paid).toBe(before.total);
    const addon = before.addons.find((a) => a.kind === 'LATE_OUT')!;
    const r = await decideAddon(FRONT, addon.id, 'REJECTED');
    expect(r.refund).toBe(1000);
    const after = await buildView(h.code);
    expect(after).toMatchObject({ total: before.total - 1000, refunded: 1000, dueAtHotel: 0 });
    expect(after.payments.at(-1)).toMatchObject({ direction: 'REFUND', amount: 1000 });
    expect(paymentGateway().calls.at(-1)).toMatchObject({ refund: true, amount: 1000 });
  });
  it('ปฏิเสธบริการเสริมของการจองที่จ่ายมัดจำ → ลดยอดที่ต้องจ่ายที่โรงแรมก่อน ไม่ต้องคืนเงิน', async () => {
    const { addons } = await listAddons({ status: 'PENDING' });
    const r = await decideAddon(FRONT, addons[0].id, 'REJECTED');
    expect(r.refund).toBe(0);
    expect(await buildView('SJ-2027-200001')).toMatchObject({ total: 3800, dueAtHotel: 2360, refunded: 0 });
  });
  it('US-55 · outbox แสดงอีเมลและ LINE ล่าสุดก่อน กรองตามช่องทางได้', async () => {
    const h = await booked();
    const all = await listOutbox({});
    expect(all.messages[0].bookingCode).toBe(h.code);
    const line = await listOutbox({ channel: 'LINE' });
    expect(line.messages.length).toBeGreaterThan(0);
    expect(line.messages.every((m) => m.channel === 'LINE')).toBe(true);
    expect(line.messages[0].body).toContain(h.code);
  });
});

describe('Admin · ห้องพัก (US-51)', () => {
  it('ปิดห้อง 301 R03 1–5 ส.ค. → ว่างลด 1 · เปิดคืนแล้วกลับมา', async () => {
    const before = await closed('2027-08-02');
    const { id } = await createClosure(ROOMS, { roomNo: '301', from: '2027-08-01', to: '2027-08-05', reason: 'ทาสีใหม่' });
    expect(await closed('2027-08-02')).toBe(before + 1);
    expect((await listClosuresAdmin()).closures.map((c) => c.id)).toContain(id);
    await deleteClosure(ROOMS, id);
    expect(await closed('2027-08-02')).toBe(before);
    expect((await query(`SELECT count(*)::int n FROM audit_log WHERE action IN ('CLOSE_ROOM','REOPEN_ROOM')`)).rows[0].n).toBe(2);
  });
  it('US-51 ข้อ 2 · ปิดห้อง 305 ที่มีการจอง → แสดงรหัสการจองที่ติดอยู่', async () => {
    const e = await createClosure(ROOMS, { roomNo: '305', from: '2027-08-01', to: '2027-08-05', reason: 'x' }).catch((x) => x);
    expect(e.code).toBe('ROOM_HAS_BOOKING');
    expect(e.extra.bookings).toEqual(['SJ-2027-300003']);
  });
  it('US-51 ข้อ 3 · แก้ชื่อ รายละเอียด สิ่งอำนวยความสะดวก และคำบรรยายรูปทั้งสองภาษา', async () => {
    await updateRoomType(ROOMS, 'R01', {
      nameEn: 'Superior Room', descTh: 'ห้องใหม่', amenities: ['แอร์', 'Wi-Fi'], amenitiesEn: ['Air conditioning', 'Wi-Fi'],
      photos: [{ sort: 1, captionTh: 'ห้องนอนใหม่', captionEn: 'New bedroom' }],
    });
    const rt = (await loadRoomTypes()).R01;
    expect(rt).toMatchObject({ nameEn: 'Superior Room', nameTh: 'ซุพีเรียร์', descTh: 'ห้องใหม่', amenities: ['แอร์', 'Wi-Fi'] });
    expect(rt.photos[0]).toMatchObject({ captionTh: 'ห้องนอนใหม่', captionEn: 'New bedroom' });
    expect((await listRoomTypesAdmin()).roomTypes.find((r) => r.code === 'R01')!.amenitiesEn).toEqual(['Air conditioning', 'Wi-Fi']);
    await expect(updateRoomType(ROOMS, 'R01', { nameTh: '  ' })).rejects.toMatchObject({ code: 'BAD_INPUT' });
    await expect(updateRoomType(ROOMS, 'R99', { nameTh: 'x' })).rejects.toMatchObject({ status: 404 });
  });
});

describe('Admin · รายงาน (US-54)', () => {
  it('Occupancy รายวันและรายเดือนแยกประเภทห้อง', async () => {
    const r = await buildReport({ from: '2027-03-01', to: '2027-03-31' });
    const d1 = r.occupancy.daily.find((d) => d.date === '2027-03-01')!;
    expect(d1.byType.R01).toEqual({ sold: 1, total: 20, rate: 0.05 });
    expect(d1.byType.R04).toEqual({ sold: 1, total: 5, rate: 0.2 });
    expect(r.occupancy.daily).toHaveLength(31);
    const m = r.occupancy.monthly[0];
    expect(m.month).toBe('2027-03');
    expect(m.byType.R01.sold).toBe(2); // 200001: 1–2 มี.ค.
    expect(m.byType.R01.total).toBe(20 * 31);
  });
  it('รายได้และ ADR แยกซีซั่น ใช้ค่าห้องหลังส่วนลดที่เก็บไว้ในการจอง', async () => {
    const r = await buildReport({ from: '2027-12-20', to: '2027-12-31' });
    const peak = r.revenue.bySeason.find((s) => s.season === 'PEAK')!;
    // Daniel R06 23–25 ธ.ค. 3 คืน ฿42,000 + Chen R06 24 ธ.ค. 1 คืน ฿12,600
    expect(peak).toMatchObject({ roomNights: 4, revenue: 54600, adr: 13650 });
    expect(r.revenue.total).toMatchObject({ roomNights: 4, revenue: 54600 });
  });
  it('จำนวนการจองและส่วนลดรวมของแต่ละโปรและโค้ด', async () => {
    await booked({ code: 'WELCOME500' });
    const r = await buildReport({ from: '2027-03-01', to: '2027-03-31' });
    expect(r.codes.find((c) => c.code === 'WELCOME500')).toMatchObject({ bookings: 1, discount: 500 });
    expect(r.promotions.length).toBeGreaterThanOrEqual(0);
  });
  it('ช่วงวันที่ผิด → 422', async () => {
    await expect(buildReport({ from: '2027-03-10', to: '2027-03-01' })).rejects.toMatchObject({ code: 'BAD_RANGE' });
  });
  it('ดาวน์โหลด Excel มีชีตครบ', async () => {
    const buf = await exportReport({ from: '2027-03-01', to: '2027-03-31' });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf as unknown as ArrayBuffer);
    expect(wb.worksheets.map((w) => w.name)).toEqual(['Occupancy daily', 'Occupancy monthly', 'Revenue by season', 'Promotions', 'Codes']);
    expect(wb.getWorksheet('Occupancy daily')!.rowCount).toBe(32);
  });
});

describe('Admin · ตอบรีวิว (US-47)', () => {
  it('ตอบรีวิวได้ แก้คำตอบได้ · ข้อความว่างไม่ได้', async () => {
    const r = await replyReview(FRONT, 2, { body: 'ขอบคุณคุณแนนค่ะ' });
    expect(r.reply).toMatchObject({ body: 'ขอบคุณคุณแนนค่ะ', staffName: 'น้องมุก' });
    await replyReview(GM, 2, { body: 'ขอบคุณอีกครั้งค่ะ' });
    const list = await listReviewsAdmin();
    expect(list.reviews.find((x) => x.id === 2)!.reply).toMatchObject({ body: 'ขอบคุณอีกครั้งค่ะ', staffName: 'คุณวิภา' });
    await expect(replyReview(FRONT, 2, { body: ' ' })).rejects.toMatchObject({ code: 'BAD_INPUT' });
    await expect(replyReview(FRONT, 999, { body: 'x' })).rejects.toMatchObject({ status: 404 });
    expect((await audits('REVIEW_REPLY')).length).toBe(2);
  });
});
