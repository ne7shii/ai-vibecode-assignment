import type { Lang } from '@/i18n';
import { Gate } from '@/components/admin/server';
import Outbox from '@/components/admin/Outbox';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = (await params) as { lang: Lang };
  return <Gate lang={lang} area="outbox"><Outbox lang={lang} /></Gate>;
}
