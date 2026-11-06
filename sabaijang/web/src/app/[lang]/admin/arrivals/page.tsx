import type { Lang } from '@/i18n';
import { Gate } from '@/components/admin/server';
import Arrivals from '@/components/admin/Arrivals';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = (await params) as { lang: Lang };
  return <Gate lang={lang} area="arrivals"><Arrivals lang={lang} /></Gate>;
}
