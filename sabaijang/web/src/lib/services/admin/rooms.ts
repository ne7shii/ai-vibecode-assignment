// Rooms: repair closures (US-51 ข้อ 1–2) and room-type content in both languages (US-51 ข้อ 3).
import { query, tx } from '@/lib/db';
import { closeRoom, reopenRoom } from '../rooms-admin';
import { audit, bad, ensureAdminSchema, needDate, notFound } from './common';

export async function listClosuresAdmin() {
  const [cl, rooms] = await Promise.all([
    query(`SELECT c.id, c.room_no, c.from_date, c.to_date, c.reason, r.room_type_code
           FROM room_closures c JOIN rooms r USING (room_no) ORDER BY c.from_date, c.room_no`),
    query(`SELECT r.room_no, r.room_type_code, rt.name_th, rt.name_en FROM rooms r JOIN room_types rt ON rt.code = r.room_type_code ORDER BY rt.sort, r.room_no`),
  ]);
  return {
    closures: cl.rows.map((r) => ({ id: r.id as number, roomNo: r.room_no as string, roomType: r.room_type_code as string, from: r.from_date as string, to: r.to_date as string, reason: r.reason as string })),
    rooms: rooms.rows.map((r) => ({ roomNo: r.room_no as string, roomType: r.room_type_code as string, nameTh: r.name_th as string, nameEn: r.name_en as string })),
  };
}

/** closeRoom() writes audit_log (CLOSE_ROOM) in its own transaction. */
export async function createClosure(staffId: number, i: { roomNo?: string; from?: string; to?: string; reason?: string }) {
  const from = needDate(i.from, 'from');
  const to = needDate(i.to ?? i.from, 'to');
  if (!i.roomNo?.trim()) throw bad('กรุณาเลือกเลขห้อง', 'Please choose a room', { field: 'roomNo' });
  if ((i.reason ?? '').length > 200) throw bad('เหตุผลยาวเกินไป', 'Reason is too long', { field: 'reason' });
  return closeRoom({ roomNo: i.roomNo.trim(), from, to, reason: (i.reason ?? '').trim(), staffId });
}

export async function deleteClosure(staffId: number, id: number) {
  await reopenRoom(id, staffId);
  return { ok: true };
}

export async function listRoomTypesAdmin() {
  await ensureAdminSchema();
  const [types, photos] = await Promise.all([
    query('SELECT * FROM room_types ORDER BY sort'),
    query('SELECT * FROM room_photos ORDER BY room_type_code, sort'),
  ]);
  return {
    roomTypes: types.rows.map((r) => ({
      code: r.code as string, nameTh: r.name_th as string, nameEn: r.name_en as string, descTh: r.desc_th as string, descEn: r.desc_en as string,
      bedTh: r.bed_th as string, bedEn: r.bed_en as string, viewTh: r.view_th as string, viewEn: r.view_en as string,
      sizeSqm: r.size_sqm as number, totalRooms: r.total_rooms as number,
      amenities: r.amenities as string[], amenitiesEn: (r.amenities_en ?? []) as string[],
      photos: photos.rows.filter((p) => p.room_type_code === r.code).map((p) => ({ sort: p.sort as number, file: p.file as string, captionTh: p.caption_th as string, captionEn: p.caption_en as string })),
    })),
  };
}

export interface RoomTypePatch {
  nameTh?: string; nameEn?: string; descTh?: string; descEn?: string; bedTh?: string; bedEn?: string; viewTh?: string; viewEn?: string;
  amenities?: string[]; amenitiesEn?: string[];
  photos?: { sort: number; file?: string; captionTh?: string; captionEn?: string }[];
}

const TEXT: [keyof RoomTypePatch, string, number][] = [
  ['nameTh', 'name_th', 60], ['nameEn', 'name_en', 60], ['descTh', 'desc_th', 1000], ['descEn', 'desc_en', 1000],
  ['bedTh', 'bed_th', 80], ['bedEn', 'bed_en', 80], ['viewTh', 'view_th', 80], ['viewEn', 'view_en', 80],
];
const REQUIRED = new Set(['nameTh', 'nameEn', 'bedTh', 'bedEn', 'viewTh', 'viewEn']);

function cleanList(v: unknown, field: string) {
  if (!Array.isArray(v) || v.some((x) => typeof x !== 'string')) throw bad('รายการไม่ถูกต้อง', 'Invalid list', { field });
  const out = v.map((x: string) => x.trim()).filter(Boolean);
  if (out.length > 30 || out.some((x) => x.length > 60)) throw bad('รายการยาวเกินไป', 'List is too long', { field });
  return out;
}

export async function updateRoomType(staffId: number, code: string, p: RoomTypePatch) {
  await ensureAdminSchema();
  return tx(async (c) => {
    const { rows } = await c.query('SELECT code FROM room_types WHERE code = $1 FOR UPDATE', [code]);
    if (!rows.length) throw notFound('ไม่พบประเภทห้อง', 'Room type not found');
    for (const [key, col, max] of TEXT) {
      const v = p[key];
      if (v === undefined) continue;
      if (typeof v !== 'string') throw bad('ข้อมูลไม่ถูกต้อง', 'Invalid value', { field: key });
      const s = v.trim();
      if (REQUIRED.has(key) && !s) throw bad('ห้ามเว้นว่าง', 'This field is required', { field: key });
      if (s.length > max) throw bad('ยาวเกินไป', 'Too long', { field: key });
      await c.query(`UPDATE room_types SET ${col} = $2 WHERE code = $1`, [code, s]);
    }
    if (p.amenities !== undefined) await c.query('UPDATE room_types SET amenities = $2 WHERE code = $1', [code, cleanList(p.amenities, 'amenities')]);
    if (p.amenitiesEn !== undefined) await c.query('UPDATE room_types SET amenities_en = $2 WHERE code = $1', [code, cleanList(p.amenitiesEn, 'amenitiesEn')]);
    for (const ph of p.photos ?? []) {
      if (!Number.isInteger(ph.sort)) throw bad('ลำดับรูปไม่ถูกต้อง', 'Invalid photo order', { field: 'photos' });
      if (ph.file !== undefined && !/^\/brand\/[\w\-/.]+\.(jpg|jpeg|png|webp)$/i.test(ph.file)) throw bad('ไฟล์รูปต้องอยู่ใน /brand/', 'Photo must be a file under /brand/', { field: 'photos' });
      const { rowCount } = await c.query(
        `UPDATE room_photos SET caption_th = COALESCE($3, caption_th), caption_en = COALESCE($4, caption_en), file = COALESCE($5, file)
         WHERE room_type_code = $1 AND sort = $2`, [code, ph.sort, ph.captionTh?.trim() ?? null, ph.captionEn?.trim() ?? null, ph.file ?? null]);
      if (!rowCount && ph.file) {
        await c.query('INSERT INTO room_photos (room_type_code, sort, file, caption_th, caption_en) VALUES ($1,$2,$3,$4,$5)', [code, ph.sort, ph.file, ph.captionTh ?? '', ph.captionEn ?? '']);
      }
    }
    await audit(c, staffId, 'ROOM_TYPE_UPDATE', { code, patch: p });
    return { ok: true };
  }).then(async () => ({ roomType: (await listRoomTypesAdmin()).roomTypes.find((r) => r.code === code)! }));
}
