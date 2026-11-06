import type { Metadata } from 'next';
import { isLang, type Lang } from '@/i18n';
import RegisterForm from '@/components/booking/RegisterForm';

export const metadata: Metadata = { title: 'Join · สมัครสมาชิก' };

export default async function RegisterPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <RegisterForm lang={(isLang(lang) ? lang : 'th') as Lang} />;
}
