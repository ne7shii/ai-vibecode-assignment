import type { Lang } from '@/i18n';
import { Gate } from '@/components/admin/server';
import Reports from '@/components/admin/Reports';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = (await params) as { lang: Lang };
  return <Gate lang={lang} area="reports"><Reports lang={lang} /></Gate>;
}
