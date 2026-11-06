import type { Lang } from '@/i18n';
import { Gate } from '@/components/admin/server';
import Reviews from '@/components/admin/Reviews';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = (await params) as { lang: Lang };
  return <Gate lang={lang} area="reviews"><Reviews lang={lang} /></Gate>;
}
