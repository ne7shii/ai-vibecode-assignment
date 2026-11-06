import { json, route } from '@/lib/http';
import { listPublicPromotions } from '@/lib/services/promotions';

export const dynamic = 'force-dynamic';

/** US-31: active promotions with short conditions, deadline and a pre-filled search link. */
export const GET = route(async () => json({ promotions: await listPublicPromotions() }));
