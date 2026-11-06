import type { Metadata } from 'next';
import { isLang, type Lang } from '@/i18n';
import BookingFlow from '@/components/booking/BookingFlow';

export const metadata: Metadata = { title: 'Guest details & payment · ข้อมูลผู้เข้าพักและชำระเงิน' };

export default async function BookingStepPage({ params }: { params: Promise<{ lang: string; code: string }> }) {
  const { lang, code } = await params;
  return <BookingFlow lang={(isLang(lang) ? lang : 'th') as Lang} code={decodeURIComponent(code)} />;
}
