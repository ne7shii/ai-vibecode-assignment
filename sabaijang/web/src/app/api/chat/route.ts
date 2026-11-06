import { body, json, route } from '@/lib/http';
import { answerChat } from '@/lib/services/chat';

export const dynamic = 'force-dynamic';

/** US-50: rule-based chatbot, deterministic. */
export const POST = route(async ({ req }) => {
  const { message, lang } = await body<{ message?: string; lang?: string }>(req);
  return json(await answerChat({ message, lang }));
});
