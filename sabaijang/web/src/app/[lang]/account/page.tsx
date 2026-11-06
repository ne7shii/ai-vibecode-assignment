import type { Metadata } from 'next';
import { isLang, type Lang } from '@/i18n';
import Account from '@/components/booking/Account';

export const metadata: Metadata = { title: 'My account · บัญชีของฉัน' };

export default async function AccountPage({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  return <Account lang={(isLang(lang) ? lang : 'th') as Lang} />;
}
