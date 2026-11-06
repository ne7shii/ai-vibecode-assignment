import { actorFromCookieValue, COOKIE } from '@/lib/auth';
import { AppError, body, json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const POST = route(async ({ req }) => {
  const { userId } = await body<{ userId?: string }>(req);
  const actor = await actorFromCookieValue(userId ?? null);
  if (actor.kind === 'guest') throw new AppError(404, 'NO_USER', { th: 'ไม่พบผู้ใช้', en: 'User not found' });
  return json({ ok: true, actor }, 200, { 'set-cookie': `${COOKIE}=${encodeURIComponent(userId!)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` });
});
