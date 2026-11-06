'use client';
// Browser API client. Throws ApiError with the server's bilingual message.
export class ApiError extends Error {
  constructor(public status: number, public code: string, public msg: { th: string; en: string }, public data: Record<string, unknown>) {
    super(msg?.en ?? code);
  }
}

export async function api<T = any>(path: string, opts: { method?: string; body?: unknown; token?: string | null } = {}): Promise<T> {
  const res = await fetch(path, {
    method: opts.method ?? (opts.body !== undefined ? 'POST' : 'GET'),
    headers: {
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(opts.token ? { 'x-booking-token': opts.token } : {}),
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    cache: 'no-store',
  });
  const text = await res.text();
  const data = text ? JSON.parse(text) : {};
  if (!res.ok) throw new ApiError(res.status, data.error ?? 'ERROR', data.message ?? { th: 'เกิดข้อผิดพลาด', en: 'Something went wrong' }, data);
  return data as T;
}

export const msgOf = (e: unknown, lang: 'th' | 'en') =>
  e instanceof ApiError ? (lang === 'en' ? e.msg.en : e.msg.th) : lang === 'en' ? 'Something went wrong' : 'เกิดข้อผิดพลาด';
