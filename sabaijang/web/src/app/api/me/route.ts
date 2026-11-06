import { COOKIE, requireMember } from '@/lib/auth';
import { AppError, body, json, route } from '@/lib/http';
import { pointsBalance } from '@/lib/services/data';
import { deleteAccount, updateProfile, type ProfilePatch } from '@/lib/services/members';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ actor }) => {
  if (actor.kind === 'guest') throw new AppError(401, 'LOGIN_REQUIRED', { th: 'ยังไม่ได้เลือกผู้ใช้', en: 'No user selected' });
  if (actor.kind === 'member') return json({ kind: 'member', user: actor.user, points: await pointsBalance(actor.user.id) });
  return json({ kind: 'staff', staff: actor.staff });
});

/** PATCH /api/me {name?,phone?,lang?,marketingConsent?} (owner: members) */
export const PATCH = route(async ({ req, actor }) => {
  const user = requireMember(actor);
  return json({ user: await updateProfile(user.id, await body<ProfilePatch>(req)) });
});

/** DELETE /api/me {confirm:true} → soft delete + anonymise (US-56 ข้อ 4, D-07), clears the demo cookie. */
export const DELETE = route(async ({ req, actor }) => {
  const user = requireMember(actor);
  const r = await deleteAccount(user.id, await body<{ confirm?: boolean }>(req));
  return json(r, 200, { 'set-cookie': `${COOKIE}=; Path=/; HttpOnly; SameSite=Lax; Max-Age=0` });
});
