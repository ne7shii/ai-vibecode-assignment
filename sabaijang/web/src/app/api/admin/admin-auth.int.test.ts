// DESIGN §2.2–2.3 · ตรวจสิทธิ์ทุกเส้นของ /api/admin/* ที่ API (D-08): ไม่ login → 401 · ผิดบทบาท → 403 · บทบาทที่ได้ → 2xx
import { describe, it, expect, beforeAll } from 'vitest';
import { resetDatabase } from '@/lib/db/reset';
import { setClock } from '@/lib/clock-db';
import { closeRoom } from '@/lib/services/rooms-admin';
import * as dashboard from './dashboard/route';
import * as seasons from './seasons/route';
import * as seasonId from './seasons/[id]/route';
import * as rates from './rates/route';
import * as dateRates from './date-rates/route';
import * as promotions from './promotions/route';
import * as promotionCode from './promotions/[code]/route';
import * as preview from './promotions/preview/route';
import * as codes from './codes/route';
import * as codeId from './codes/[code]/route';
import * as arrivals from './arrivals/route';
import * as checkIn from './bookings/[code]/check-in/route';
import * as checkOut from './bookings/[code]/check-out/route';
import * as noShow from './bookings/[code]/no-show/route';
import * as addons from './addons/route';
import * as addonId from './addons/[id]/route';
import * as outbox from './outbox/route';
import * as closures from './closures/route';
import * as closureId from './closures/[id]/route';
import * as roomTypes from './room-types/route';
import * as roomTypeCode from './room-types/[code]/route';
import * as reports from './reports/route';
import * as reportsExport from './reports/export/route';
import * as reviews from './reviews/route';
import * as reviewReply from './reviews/[id]/reply/route';

type Handler = (req: Request, ctx: { params: Promise<Record<string, string>> }) => Promise<Response>;
type Role = 'SALES' | 'FRONT' | 'ROOMS';
interface Case {
  name: string;
  handler: Handler;
  method: string;
  url: string;
  params?: Record<string, string>;
  body?: unknown;
  roles: Role[] | 'ALL';
  write?: boolean;
  setup?: () => Promise<unknown>;
}

const ACTORS: { name: string; cookie: string | null; role?: 'GM' | Role }[] = [
  { name: 'guest', cookie: null },
  { name: 'member', cookie: 'm:1' },
  { name: 'GM', cookie: 's:1', role: 'GM' },
  { name: 'SALES', cookie: 's:2', role: 'SALES' },
  { name: 'FRONT', cookie: 's:3', role: 'FRONT' },
  { name: 'ROOMS', cookie: 's:4', role: 'ROOMS' },
];

const promoDraft = { code: 'PR-30', grp: 'PRICE', kind: 'PERCENT', nameTh: 'ทดสอบ', nameEn: 'Test', value: 10, rules: {}, quota: null, memberOnly: false, active: false };
const S: Role[] = ['SALES'], F: Role[] = ['FRONT'], R: Role[] = ['ROOMS'];
const h = (m: unknown, k: string) => (m as Record<string, Handler>)[k];

const CASES: Case[] = [
  { name: 'GET dashboard', handler: h(dashboard, 'GET'), method: 'GET', url: '/api/admin/dashboard', roles: 'ALL' },
  { name: 'GET seasons', handler: h(seasons, 'GET'), method: 'GET', url: '/api/admin/seasons', roles: S },
  { name: 'POST seasons', handler: h(seasons, 'POST'), method: 'POST', url: '/api/admin/seasons', body: { kind: 'PEAK', start: '2027-11-12', end: '2027-11-14', label: 'x' }, roles: S, write: true },
  { name: 'PATCH seasons/:id', handler: h(seasonId, 'PATCH'), method: 'PATCH', url: '/api/admin/seasons/1', params: { id: '1' }, body: { label: 'High' }, roles: S, write: true },
  { name: 'DELETE seasons/:id', handler: h(seasonId, 'DELETE'), method: 'DELETE', url: '/api/admin/seasons/3', params: { id: '3' }, roles: S, write: true },
  { name: 'GET rates', handler: h(rates, 'GET'), method: 'GET', url: '/api/admin/rates', roles: S },
  { name: 'PUT rates', handler: h(rates, 'PUT'), method: 'PUT', url: '/api/admin/rates', body: { rates: [{ roomType: 'R01', kind: 'LOW', price: 1900 }] }, roles: S, write: true },
  { name: 'GET date-rates', handler: h(dateRates, 'GET'), method: 'GET', url: '/api/admin/date-rates?month=2027-02&roomType=R01', roles: S },
  { name: 'PUT date-rates', handler: h(dateRates, 'PUT'), method: 'PUT', url: '/api/admin/date-rates', body: { roomType: 'R01', from: '2027-06-10', price: 2900 }, roles: S, write: true },
  { name: 'DELETE date-rates', handler: h(dateRates, 'DELETE'), method: 'DELETE', url: '/api/admin/date-rates?roomType=R01&night=2027-02-14', roles: S, write: true },
  { name: 'GET promotions', handler: h(promotions, 'GET'), method: 'GET', url: '/api/admin/promotions', roles: S },
  { name: 'POST promotions', handler: h(promotions, 'POST'), method: 'POST', url: '/api/admin/promotions', body: promoDraft, roles: S, write: true },
  { name: 'GET promotions/:code', handler: h(promotionCode, 'GET'), method: 'GET', url: '/api/admin/promotions/PR-01', params: { code: 'PR-01' }, roles: S },
  { name: 'PATCH promotions/:code', handler: h(promotionCode, 'PATCH'), method: 'PATCH', url: '/api/admin/promotions/PR-01', params: { code: 'PR-01' }, body: { active: false }, roles: S, write: true },
  { name: 'POST promotions/preview', handler: h(preview, 'POST'), method: 'POST', url: '/api/admin/promotions/preview', body: { code: 'PR-01', roomType: 'R01', checkIn: '2027-06-01', checkOut: '2027-06-04' }, roles: S },
  { name: 'GET codes', handler: h(codes, 'GET'), method: 'GET', url: '/api/admin/codes', roles: S },
  { name: 'POST codes', handler: h(codes, 'POST'), method: 'POST', url: '/api/admin/codes', body: { code: 'NEW100', discount: 100, validUntil: '2027-12-31' }, roles: S, write: true },
  { name: 'PATCH codes/:code', handler: h(codeId, 'PATCH'), method: 'PATCH', url: '/api/admin/codes/WELCOME500', params: { code: 'WELCOME500' }, body: { active: false }, roles: S, write: true },
  { name: 'GET arrivals', handler: h(arrivals, 'GET'), method: 'GET', url: '/api/admin/arrivals?date=2027-03-01', roles: F },
  { name: 'POST check-in', handler: h(checkIn, 'POST'), method: 'POST', url: '/api/admin/bookings/SJ-2027-200001/check-in', params: { code: 'SJ-2027-200001' }, body: { roomNo: '101' }, roles: F, write: true },
  { name: 'POST check-out', handler: h(checkOut, 'POST'), method: 'POST', url: '/api/admin/bookings/SJ-2027-200003/check-out', params: { code: 'SJ-2027-200003' }, body: {}, roles: F, write: true },
  { name: 'POST no-show', handler: h(noShow, 'POST'), method: 'POST', url: '/api/admin/bookings/SJ-2027-200001/no-show', params: { code: 'SJ-2027-200001' }, body: {}, roles: F, write: true, setup: () => setClock({ now: '2027-03-02T08:00:00+07:00' }) },
  { name: 'GET addons', handler: h(addons, 'GET'), method: 'GET', url: '/api/admin/addons', roles: F },
  { name: 'POST addons/:id', handler: h(addonId, 'POST'), method: 'POST', url: '/api/admin/addons/2', params: { id: '2' }, body: { status: 'CONFIRMED' }, roles: F, write: true },
  { name: 'GET outbox', handler: h(outbox, 'GET'), method: 'GET', url: '/api/admin/outbox', roles: F },
  { name: 'GET closures', handler: h(closures, 'GET'), method: 'GET', url: '/api/admin/closures', roles: R },
  { name: 'POST closures', handler: h(closures, 'POST'), method: 'POST', url: '/api/admin/closures', body: { roomNo: '301', from: '2027-08-01', to: '2027-08-05', reason: 'paint' }, roles: R, write: true },
  { name: 'DELETE closures/:id', handler: h(closureId, 'DELETE'), method: 'DELETE', url: '/api/admin/closures/1', params: { id: '1' }, roles: R, write: true, setup: () => closeRoom({ roomNo: '301', from: '2027-08-01', to: '2027-08-02', reason: 'x' }) },
  { name: 'GET room-types', handler: h(roomTypes, 'GET'), method: 'GET', url: '/api/admin/room-types', roles: R },
  { name: 'PATCH room-types/:code', handler: h(roomTypeCode, 'PATCH'), method: 'PATCH', url: '/api/admin/room-types/R01', params: { code: 'R01' }, body: { nameEn: 'Superior' }, roles: R, write: true },
  { name: 'GET reports', handler: h(reports, 'GET'), method: 'GET', url: '/api/admin/reports?from=2027-03-01&to=2027-03-31', roles: S },
  { name: 'GET reports/export', handler: h(reportsExport, 'GET'), method: 'GET', url: '/api/admin/reports/export?from=2027-03-01&to=2027-03-31', roles: S },
  { name: 'GET reviews', handler: h(reviews, 'GET'), method: 'GET', url: '/api/admin/reviews', roles: F },
  { name: 'POST reviews/:id/reply', handler: h(reviewReply, 'POST'), method: 'POST', url: '/api/admin/reviews/2/reply', params: { id: '2' }, body: { body: 'ขอบคุณค่ะ' }, roles: F, write: true },
];

function request(c: Case, cookie: string | null) {
  const headers: Record<string, string> = {};
  if (cookie) headers.cookie = `sj_user=${encodeURIComponent(cookie)}`;
  if (c.body !== undefined) headers['content-type'] = 'application/json';
  return new Request(`http://localhost${c.url}`, { method: c.method, headers, body: c.body !== undefined ? JSON.stringify(c.body) : undefined });
}

const expected = (c: Case, a: (typeof ACTORS)[number]) => {
  if (!a.role) return a.cookie ? 403 : 401;
  if (a.role === 'GM' || c.roles === 'ALL' || c.roles.includes(a.role)) return 200;
  return 403;
};

beforeAll(async () => { await resetDatabase(); });

describe('Admin API · ตารางสิทธิ์ (DESIGN §2.2–2.3)', () => {
  it('มีทุกเส้นในสัญญา', () => {
    expect(CASES.every((c) => typeof c.handler === 'function')).toBe(true);
  });

  it.each(CASES.map((c) => [c.name, c] as const))('%s', async (_n, c) => {
    const got: Record<string, number> = {};
    const want: Record<string, number> = {};
    for (const a of ACTORS) {
      const exp = expected(c, a);
      if (exp === 200 && (c.write || c.setup)) {
        await resetDatabase();
        await c.setup?.();
      }
      const res = await c.handler(request(c, a.cookie), { params: Promise.resolve(c.params ?? {}) });
      if (res.status >= 400 && exp === 200) console.error(c.name, a.name, await res.clone().text());
      got[a.name] = res.status >= 200 && res.status < 300 ? 200 : res.status;
      want[a.name] = exp;
    }
    expect(got).toEqual(want);
  });
});
