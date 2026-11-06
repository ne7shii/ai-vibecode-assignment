import type { Lang } from '@/i18n';
import { Gate } from '@/components/admin/server';
import Promotions from '@/components/admin/Promotions';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = (await params) as { lang: Lang };
  return <Gate lang={lang} area="promotions"><Promotions lang={lang} /></Gate>;
}
