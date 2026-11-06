import { route, qs } from '@/lib/http';
import { requireStaff } from '@/lib/auth';
import { SALES_ROLES } from '@/lib/services/admin/access';
import { exportReport, reportRange } from '@/lib/services/admin/reports';

export const dynamic = 'force-dynamic';

/** US-54 ข้อ 4 · .xlsx download. */
export const GET = route(async ({ req, actor }) => {
  requireStaff(actor, SALES_ROLES);
  const q = qs(req);
  const range = await reportRange({ from: q.get('from'), to: q.get('to') });
  const buf = await exportReport(range);
  return new Response(new Uint8Array(buf), {
    status: 200,
    headers: {
      'content-type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'content-disposition': `attachment; filename="sabaijang-report-${range.from}-to-${range.to}.xlsx"`,
      'cache-control': 'no-store',
    },
  });
});
