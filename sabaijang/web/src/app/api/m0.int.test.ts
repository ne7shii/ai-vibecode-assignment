import { describe, it, expect, afterEach } from 'vitest';
import { GET as health } from './health/route';
import { POST as reset } from './test/reset/route';
import { POST as clockRoute } from './test/clock/route';
import { query } from '@/lib/db';
import { checkDb } from '@/lib/db/health';
import { getClock } from '@/lib/clock-db';

const post = (body: unknown) => new Request('http://localhost/api', { method: 'POST', body: JSON.stringify(body) });

describe('M0 · health', () => {
  it('GET /api/health → {"ok":true,"db":true}', async () => {
    const res = await health();
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, db: true });
  });

  it('ต่อฐานข้อมูลไม่ได้ → db:false', async () => {
    expect(await checkDb('postgres://hotel:hotel@127.0.0.1:1/none')).toBe(false);
  });
});

describe('M0 · test hooks', () => {
  afterEach(() => { process.env.ALLOW_TEST_RESET = '1'; });

  it('ALLOW_TEST_RESET=0 → /api/test/reset และ /api/test/clock ตอบ 404', async () => {
    process.env.ALLOW_TEST_RESET = '0';
    expect((await reset(post({}))).status).toBe(404);
    expect((await clockRoute(post({ advanceMinutes: 1 }))).status).toBe(404);
  });

  it('reset ล้างข้อมูลกลับเป็น seed และล็อก "วันนี้" ได้', async () => {
    await query(`DELETE FROM room_types WHERE code = 'R06'`).catch(() => undefined);
    const res = await reset(post({ now: '2027-07-10T09:00:00+07:00' }));
    expect(res.status).toBe(200);
    const { rows } = await query<{ n: string }>('SELECT count(*) AS n FROM room_types');
    expect(Number(rows[0].n)).toBe(6);
    expect((await getClock()).now().toISOString()).toBe('2027-07-10T02:00:00.000Z');
  });

  it('clock เลื่อนนาฬิกาโดยไม่ล้างข้อมูล', async () => {
    await reset(post({ now: '2027-03-01T10:00:00+07:00' }));
    await query(`UPDATE app_settings SET bug_mode = bug_mode`);
    const res = await clockRoute(post({ advanceMinutes: 15 }));
    expect(res.status).toBe(200);
    expect((await getClock()).now().toISOString()).toBe('2027-03-01T03:15:00.000Z');
    const r2 = await clockRoute(post({ now: '2027-12-24T14:00:00+07:00' }));
    expect(r2.status).toBe(200);
    expect((await getClock()).now().toISOString()).toBe('2027-12-24T07:00:00.000Z');
  });
});

describe('M0 · นาฬิกาเว็บสาธิตแบบเดินจริง (CLOCK_MODE=ticking)', () => {
  afterEach(() => { delete process.env.CLOCK_MODE; });
  it('ticking: เริ่มที่เวลาที่ตั้ง แล้วเดินตามเวลาจริง · ไม่ตั้ง: หยุดนิ่ง', async () => {
    await reset(post({ now: '2027-03-01T10:00:00+07:00' }));
    await new Promise((r) => setTimeout(r, 1200));
    expect((await getClock()).now().toISOString()).toBe('2027-03-01T03:00:00.000Z');
    process.env.CLOCK_MODE = 'ticking';
    const t = (await getClock()).now().getTime() - Date.parse('2027-03-01T03:00:00.000Z');
    expect(t).toBeGreaterThanOrEqual(1000);
    expect(t).toBeLessThan(10_000);
  });
});
