import { getClock, setClock } from '@/lib/clock-db';
import { body, handle, json, notFound, testHooksEnabled } from '@/lib/http';

export const dynamic = 'force-dynamic';

export const POST = handle(async (req: Request) => {
  if (!testHooksEnabled()) return notFound();
  const b = await body<{ now?: string; advanceMinutes?: number }>(req);
  await setClock(b);
  return json({ ok: true, now: (await getClock()).now().toISOString() });
});
