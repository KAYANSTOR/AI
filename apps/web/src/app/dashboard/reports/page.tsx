import { redirect } from 'next/navigation'
import { FileSpreadsheet } from 'lucide-react'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { formatDateTime } from '@/lib/i18n/format'
import { MobileEmptyState } from '@/components/ui/empty-state'
import { CreateReportForm } from './create-report-form'
import { ReportRowActions } from './report-row-actions'

export const dynamic = 'force-dynamic'

const TYPE_LABEL: Record<string, string> = {
  analytics: 'تحليلات',
  conversations: 'محادثات',
  leads: 'عملاء محتملون',
  orders: 'طلبات',
  appointments: 'مواعيد',
}

export default async function ReportsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const db = await createClient()
  const canManage = context.role === 'owner' || context.role === 'admin'

  let reports: Array<{
    id: string
    name: string
    description: string | null
    report_type: string
    schedule_cron: string | null
    last_run_at: string | null
    is_active: boolean | null
    created_at: string
  }> = []

  if (context.businessId) {
    const { data } = await db
      .from('reports')
      .select(
        'id, name, description, report_type, schedule_cron, last_run_at, is_active, created_at'
      )
      .eq('business_id', context.businessId)
      .order('created_at', { ascending: false })
      .limit(100)
    reports = data ?? []
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">التقارير المحفوظة</h1>
        <p className="mt-1 text-sm text-text-muted">
          تقارير مرتبطة بنشاطك في قاعدة البيانات — بدون قوائم تجريبية.
        </p>
      </div>

      {!context.businessId ? (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          أكمل إعداد ملف النشاط أولاً من الإعداد أو المعالج حتى يمكن حفظ التقارير.
        </div>
      ) : null}

      {canManage && context.businessId ? <CreateReportForm /> : null}

      {!reports.length ? (
        <MobileEmptyState
          icon={FileSpreadsheet}
          title="لا توجد تقارير محفوظة"
          description={
            canManage
              ? 'أنشئ تقريراً محفوظاً من النموذج أعلاه لتتبع المحادثات أو العملاء أو الطلبات.'
              : 'لم يُنشئ المسؤول أي تقارير بعد.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-text-muted">الاسم</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">النوع</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">جدولة</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">آخر تشغيل</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">الحالة</th>
                {canManage ? (
                  <th className="px-4 py-3 text-start font-medium text-text-muted">إجراءات</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {reports.map((r) => (
                <tr key={r.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-text">{r.name}</p>
                    {r.description ? (
                      <p className="mt-0.5 text-xs text-text-muted">{r.description}</p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {TYPE_LABEL[r.report_type] ?? r.report_type}
                  </td>
                  <td className="px-4 py-3 text-text-muted">
                    {r.schedule_cron ? r.schedule_cron : 'يدوي'}
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {r.last_run_at ? formatDateTime(r.last_run_at, context.timezone) : '—'}
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        r.is_active
                          ? 'bg-success/15 text-success'
                          : 'bg-background text-text-muted'
                      }`}
                    >
                      {r.is_active ? 'نشط' : 'متوقف'}
                    </span>
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      <ReportRowActions reportId={r.id} isActive={Boolean(r.is_active)} />
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
