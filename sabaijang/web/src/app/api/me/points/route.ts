import { requireMember } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { myPoints } from '@/lib/services/members';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ actor }) => json(await myPoints(requireMember(actor).id)));
