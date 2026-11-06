import { describe, it, expect } from 'vitest';
import { query } from '@/lib/db';
import { ensureDatabase, resetDatabase } from './reset';

describe('M9 · เริ่มเว็บครั้งแรกบนฐานข้อมูลว่าง', () => {
  it('ensureDatabase พร้อมกัน 3 ครั้งบนฐานข้อมูลว่าง → สร้างครั้งเดียว ไม่มี error · seed ไม่ซ้ำ', async () => {
    await query('DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;');
    await Promise.all([ensureDatabase({ force: true }), ensureDatabase({ force: true }), ensureDatabase({ force: true })]);
    expect(Number((await query('SELECT count(*) n FROM room_types')).rows[0].n)).toBe(6);
    expect(Number((await query('SELECT count(*) n FROM staff_users')).rows[0].n)).toBe(4);
  });
  it('ฐานข้อมูลมีข้อมูลแล้ว → ensureDatabase ไม่ล้างข้อมูล', async () => {
    await resetDatabase();
    await query(`UPDATE room_types SET name_en = 'Kept' WHERE code = 'R01'`);
    await ensureDatabase({ force: true });
    expect((await query(`SELECT name_en FROM room_types WHERE code = 'R01'`)).rows[0].name_en).toBe('Kept');
  });
});
