import { COOKIE } from '@/lib/auth';
import { body, json, route } from '@/lib/http';
import { registerMember, type RegisterInput } from '@/lib/services/members';

export const dynamic = 'force-dynamic';

/** US-42: register → MEMBER_UNVERIFIED, demo cookie set to the new user, verify email in the outbox. */
export const POST = route(async ({ req }) => {
  const { userId } = await registerMember(await body<RegisterInput>(req));
  const id = `m:${userId}`;
  return json({ userId: id }, 201, { 'set-cookie': `${COOKIE}=${encodeURIComponent(id)}; Path=/; HttpOnly; SameSite=Lax; Max-Age=2592000` });
});
