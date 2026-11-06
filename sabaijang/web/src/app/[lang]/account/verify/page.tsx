import type { Metadata } from 'next';
import { isLang, type Lang } from '@/i18n';
import VerifyEmail from '@/components/booking/VerifyEmail';

export const metadata: Metadata = { title: 'Verify email · ยืนยันอีเมล' };

export default async function VerifyPage({ params, searchParams }: { params: Promise<{ lang: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const { lang } = await params;
  const sp = await searchParams;
  const token = Array.isArray(sp.token) ? sp.token[0] : sp.token;
  return <VerifyEmail lang={(isLang(lang) ? lang : 'th') as Lang} token={token ?? ''} />;
}
