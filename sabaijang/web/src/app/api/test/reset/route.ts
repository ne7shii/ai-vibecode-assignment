import { resetDatabase } from '@/lib/db/reset';
import { setClock } from '@/lib/clock-db';
import { body, handle, json, notFound, testHooksEnabled } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req: Request) => {
  if (!testHooksEnabled()) return notFound();
  const b = await body<{ now?: string }>(req);
  await resetDatabase();
  if (b.now) await setClock({ now: b.now });
  return json({ ok: true });
});
