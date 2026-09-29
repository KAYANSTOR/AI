import { redirect } from 'next/navigation'
import Link from 'next/link'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/supabase/server'
import { loadChannelHealth } from '@/lib/integrations/health'

const STATUS_STYLE: Record<string, string> = {
  healthy: 'bg-success/15 text-text',
  degraded: 'bg-warning/15 text-text',
  disconnected: 'bg-background text-text-muted',
  misconfigured: 'bg-error/15 text-text',
}

const STATUS_AR: Record<string, string> = {
  healthy: 'سليم',
  degraded: 'متدهور',
  disconnected: 'غير متصل',
  misconfigured: 'إعداد ناقص',
}

export default async function IntegrationsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const supabase = await createClient()
  const health = await loadChannelHealth(supabase, context.organizationId)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">مركز التكاملات</h1>
          <p className="mt-1 text-sm text-text-muted">
            صحة القنوات وبيانات الاعتماد — بدون أسرار في الواجهة.
          </p>
        </div>
        <Link
          href="/dashboard/channels"
          className="rounded-lg border border-border px-3 py-2 text-sm font-medium text-primary-dark hover:bg-background"
        >
          إدارة القنوات
        </Link>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {!health.length ? (
          <div className="p-10 text-center text-sm text-text-muted">
            لا توجد قنوات بعد. اربط قناة من صفحة القنوات.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-text-muted">القناة</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">الحالة</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">التحقق</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">اعتماد</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">آخر خطأ إرسال</th>
              </tr>
            </thead>
            <tbody>
              {health.map((row) => (
                <tr key={row.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-text">{row.channelType}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`rounded-full px-2 py-0.5 text-xs font-medium ${
                        STATUS_STYLE[row.status] ?? 'bg-background'
                      }`}
                    >
                      {STATUS_AR[row.status] ?? row.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-text-muted">{row.verificationStatus ?? '—'}</td>
                  <td className="px-4 py-3 text-text-muted">
                    {row.hasCredentials ? 'موجود' : 'ناقص'}
                  </td>
                  <td className="max-w-xs truncate px-4 py-3 text-xs text-text-muted">
                    {row.lastOutboundError ?? '—'}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
