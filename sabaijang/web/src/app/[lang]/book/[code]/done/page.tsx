import type { Metadata } from 'next';
import { isLang, type Lang } from '@/i18n';
import BookingDone from '@/components/booking/BookingDone';

export const metadata: Metadata = { title: 'Booking confirmed · จองสำเร็จ' };

export default async function BookingDonePage({ params }: { params: Promise<{ lang: string; code: string }> }) {
  const { lang, code } = await params;
  return <BookingDone lang={(isLang(lang) ? lang : 'th') as Lang} code={decodeURIComponent(code)} />;
}
