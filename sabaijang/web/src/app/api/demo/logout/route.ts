import { COOKIE } from '@/lib/auth';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const POST = route(async () =>
  json({ ok: true }, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` }));
