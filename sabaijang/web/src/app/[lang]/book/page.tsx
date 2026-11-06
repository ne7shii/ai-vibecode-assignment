import type { Metadata } from 'next';
import { isLang, type Lang } from '@/i18n';
import BookSearch, { type BookQuery } from '@/components/booking/BookSearch';

export const metadata: Metadata = { title: 'Book · จองห้อง' };

export default async function BookPage({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { lang } = await params;
  const sp = await searchParams;
  const one = (k: string) => (Array.isArray(sp[k]) ? sp[k]![0] : (sp[k] as string | undefined));
  const query: BookQuery = { checkIn: one('checkIn'), checkOut: one('checkOut'), adults: one('adults'), children: one('children'), room: one('room') };
  return <BookSearch lang={(isLang(lang) ? lang : 'th') as Lang} query={query} />;
}
