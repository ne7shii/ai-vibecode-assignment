import { requireMember } from '@/lib/auth';
import { json, route } from '@/lib/http';
import { myBookings } from '@/lib/services/members';

export const dynamic = 'force-dynamic';

export const GET = route(async ({ actor }) => json(await myBookings(requireMember(actor).id)));
