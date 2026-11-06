import { query, tx } from '@/lib/db';
import { addDays, daysBetween } from '@/lib/rules/calendar';
import { RuleError } from '@/lib/rules/types';
import { adjustInventory } from './holds';
import { withRetry } from './inventory';

/** Close one physical room for repair (US-51). Inclusive date range. */
export async function closeRoom(i: { roomNo: string; from: string; to: string; reason: string; staffId?: number }) {
  if (i.to < i.from) throw new RuleError('BAD_RANGE', { th: 'วันสิ้นสุดต้องไม่ก่อนวันเริ่ม', en: 'End date must not be before start date' });
  return withRetry(() => tx(async (c) => {
    const { rows: room } = await c.query('SELECT room_type_code FROM rooms WHERE room_no = $1', [i.roomNo]);
    if (!room.length) throw new RuleError('NO_ROOM', { th: 'ไม่พบเลขห้อง', en: 'Room not found' });
    const type = room[0].room_type_code;
    const { rows: clash } = await c.query(
      `SELECT DISTINCT b.code FROM bookings b JOIN booking_rooms br ON br.booking_code = b.code
       WHERE br.room_no = $1 AND b.status IN ('HELD','CONFIRMED','CHECKED_IN')
         AND b.check_in <= $3 AND b.check_out > $2 ORDER BY 1`, [i.roomNo, i.from, i.to]);
    if (clash.length) {
      const codes = clash.map((r) => r.code);
      throw new RuleError('ROOM_HAS_BOOKING',
        { th: `ห้อง ${i.roomNo} มีการจองอยู่: ${codes.join(', ')}`, en: `Room ${i.roomNo} has bookings: ${codes.join(', ')}` }, { bookings: codes });
    }
    const need = new Map<string, number>();
    for (let k = 0; k <= daysBetween(i.from, i.to); k++) need.set(`${type}|${addDays(i.from, k)}`, 1);
    try {
      await adjustInventory(c, need, 'closed', 1);
    } catch (e) {
      if (e instanceof RuleError && e.code === 'ROOM_GONE') {
        const { rows } = await c.query(
          `SELECT DISTINCT b.code FROM bookings b JOIN booking_rooms br ON br.booking_code = b.code
           WHERE br.room_type_code = $1 AND b.status IN ('HELD','CONFIRMED','CHECKED_IN') AND b.check_in <= $3 AND b.check_out > $2 ORDER BY 1`,
          [type, i.from, i.to]);
        const codes = rows.map((r) => r.code);
        throw new RuleError('ROOM_HAS_BOOKING', { th: `ห้องประเภทนี้ถูกจองเต็มในช่วงนั้น: ${codes.join(', ')}`, en: `Every room of this type is booked then: ${codes.join(', ')}` }, { bookings: codes });
      }
      throw e;
    }
    const { rows } = await c.query('INSERT INTO room_closures (room_no, from_date, to_date, reason) VALUES ($1,$2,$3,$4) RETURNING id', [i.roomNo, i.from, i.to, i.reason]);
    if (i.staffId) await c.query(`INSERT INTO audit_log (staff_id, action, detail, created_at) VALUES ($1,'CLOSE_ROOM',$2, now())`, [i.staffId, JSON.stringify(i)]);
    return { id: rows[0].id as number };
  }));
}

export async function reopenRoom(id: number, staffId?: number) {
  return tx(async (c) => {
    const { rows } = await c.query('DELETE FROM room_closures WHERE id = $1 RETURNING room_no, from_date, to_date', [id]);
    if (!rows.length) throw new RuleError('NOT_FOUND', { th: 'ไม่พบรายการปิดห้อง', en: 'Closure not found' });
    const r = rows[0];
    const { rows: rt } = await c.query('SELECT room_type_code FROM rooms WHERE room_no = $1', [r.room_no]);
    const need = new Map<string, number>();
    for (let k = 0; k <= daysBetween(r.from_date, r.to_date); k++) need.set(`${rt[0].room_type_code}|${addDays(r.from_date, k)}`, 1);
    await adjustInventory(c, need, 'closed', -1, false);
    if (staffId) await c.query(`INSERT INTO audit_log (staff_id, action, detail, created_at) VALUES ($1,'REOPEN_ROOM',$2, now())`, [staffId, JSON.stringify({ id })]);
  });
}

export async function listClosures() {
  const { rows } = await query(`SELECT c.*, r.room_type_code FROM room_closures c JOIN rooms r USING (room_no) ORDER BY from_date`);
  return rows;
}
