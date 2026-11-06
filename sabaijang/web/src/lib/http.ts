import { RuleError } from './rules/types';
import { actorFromRequest, type Actor } from './auth';
import { ensureDatabase } from './db/reset';

export type Msg = { th: string; en: string };

export class AppError extends Error {
  constructor(public status: number, public code: string, public msg: Msg, public extra: Record<string, unknown> = {}) {
    super(msg.en);
  }
}

export function json(data: unknown, status = 200, headers: Record<string, string> = {}) {
  return new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json; charset=utf-8', ...headers } });
}

const RULE_STATUS: Record<string, number> = { ROOM_GONE: 409, ROOM_NOT_AVAILABLE: 409, HOLD_EXPIRED: 410, PAYMENT_DECLINED: 402 };

export function errorResponse(e: unknown) {
  if (e instanceof AppError) return json({ error: e.code, message: e.msg, ...e.extra }, e.status);
  if (e instanceof RuleError) return json({ error: e.code, message: e.msg, ...e.extra }, RULE_STATUS[e.code] ?? 422);
  console.error(e);
  return json({ error: 'INTERNAL', message: { th: 'เกิดข้อผิดพลาด กรุณาลองใหม่', en: 'Something went wrong, please try again' } }, 500);
}

/** Wrap a route handler so AppError / RuleError become JSON responses. */
export function handle<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A) => {
    try {
      return await fn(...a);
    } catch (e) {
      return errorResponse(e);
    }
  };
}

let ensured: Promise<void> | null = null;

/** Route with the current actor (demo login cookie) resolved. */
export function route<P = Record<string, string>>(fn: (ctx: { req: Request; actor: Actor; params: P }) => Promise<Response>) {
  return handle(async (req: Request, ctx: { params: Promise<P> }) => {
    ensured ??= ensureDatabase().catch((e) => { ensured = null; throw e; });
    await ensured;
    const params = (ctx?.params ? await ctx.params : {}) as P;
    return fn({ req, actor: await actorFromRequest(req), params });
  });
}

export async function body<T = Record<string, unknown>>(req: Request): Promise<T> {
  try {
    const t = await req.text();
    return (t ? JSON.parse(t) : {}) as T;
  } catch {
    throw new AppError(400, 'BAD_JSON', { th: 'ข้อมูลไม่ถูกต้อง', en: 'Invalid request body' });
  }
}

export const qs = (req: Request) => new URL(req.url).searchParams;
export const bookingToken = (req: Request) => req.headers.get('x-booking-token') ?? qs(req).get('token');
export const clientKey = (req: Request) => req.headers.get('x-forwarded-for')?.split(',')[0].trim() || req.headers.get('x-real-ip') || 'local';
export const testHooksEnabled = () => process.env.ALLOW_TEST_RESET === '1';
export const notFound = () => json({ error: 'NOT_FOUND' }, 404);

export function parseAges(v: string | null): number[] {
  if (!v) return [];
  return v.split(',').map((s) => (s.trim() === '' ? Number.NaN : Number(s)));
}
