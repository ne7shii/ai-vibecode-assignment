import type { Lang } from '@/i18n';
import { Gate } from '@/components/admin/server';
import Codes from '@/components/admin/Codes';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = (await params) as { lang: Lang };
  return <Gate lang={lang} area="codes"><Codes lang={lang} /></Gate>;
}
