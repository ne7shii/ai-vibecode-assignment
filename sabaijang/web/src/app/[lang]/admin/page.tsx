import type { Lang } from '@/i18n';
import { canUse } from '@/lib/services/admin/access';
import { currentStaff, Gate } from '@/components/admin/server';
import Dashboard from '@/components/admin/Dashboard';

export const dynamic = 'force-dynamic';

export default async function Page({ params }: { params: Promise<{ lang: string }> }) {
  const { lang } = (await params) as { lang: Lang };
  const staff = await currentStaff();
  return <Gate lang={lang} area="dashboard"><Dashboard lang={lang} canFront={canUse(staff?.role, 'arrivals')} /></Gate>;
}
