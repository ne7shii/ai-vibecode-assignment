import { checkDb } from '@/lib/db/health';
import { json } from '@/lib/http';

export const dynamic = 'force-dynamic';

export async function GET() {
  const db = await checkDb();
  return json({ ok: true, db });
}
