import { query } from '@/lib/db';
import { json, route } from '@/lib/http';

export const dynamic = 'force-dynamic';

/** Demo login list: every member and staff with their role (DESIGN §2.1). */
export const GET = route(async () => {
  const [m, s] = await Promise.all([
    query(`SELECT id, display_name, email, email_verified, photo FROM users WHERE deleted_at IS NULL ORDER BY id`),
    query(`SELECT id, display_name, email, role, photo FROM staff_users ORDER BY id`),
  ]);
  return json({
    users: [
      ...m.rows.map((r) => ({ id: `m:${r.id}`, name: r.display_name, email: r.email, role: r.email_verified ? 'MEMBER' : 'MEMBER_UNVERIFIED', photo: r.photo })),
      ...s.rows.map((r) => ({ id: `s:${r.id}`, name: r.display_name, email: r.email, role: r.role, photo: r.photo })),
    ],
  });
});
