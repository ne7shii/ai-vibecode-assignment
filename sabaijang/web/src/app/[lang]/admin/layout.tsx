import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { isLang, type Lang } from '@/i18n';
import { AREA_ROLES, canUse, type AdminArea } from '@/lib/services/admin/access';
import AdminShell from '@/components/admin/AdminShell';
import { currentStaff } from '@/components/admin/server';

export const dynamic = 'force-dynamic';
export const metadata: Metadata = { title: 'Back office · หลังบ้าน', robots: { index: false } };

export default async function AdminLayout({ children, params }: { children: React.ReactNode; params: Promise<{ lang: string }> }) {
  const { lang } = await params;
  if (!isLang(lang)) notFound();
  const staff = await currentStaff();
  const areas = staff ? (Object.keys(AREA_ROLES) as AdminArea[]).filter((a) => canUse(staff.role, a)) : [];
  return (
    <AdminShell lang={lang as Lang} staff={staff ? { name: staff.displayName, role: staff.role, photo: staff.photo } : null} areas={areas}>
      {children}
    </AdminShell>
  );
}
