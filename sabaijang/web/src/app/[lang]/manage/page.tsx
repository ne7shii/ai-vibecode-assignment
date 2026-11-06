import type { Metadata } from 'next';
import { isLang, type Lang } from '@/i18n';
import ManageBooking from '@/components/booking/ManageBooking';

export const metadata: Metadata = { title: 'Manage booking · จัดการการจอง' };

export default async function ManagePage({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { lang } = await params;
  const sp = await searchParams;
  const code = Array.isArray(sp.code) ? sp.code[0] : sp.code;
  return <ManageBooking lang={(isLang(lang) ? lang : 'th') as Lang} initialCode={code ?? ''} />;
}
