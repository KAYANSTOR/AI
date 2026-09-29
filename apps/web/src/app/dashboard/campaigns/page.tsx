import { redirect } from 'next/navigation'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/supabase/server'
import { formatDate } from '@/lib/i18n/format'

export default async function CampaignsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const supabase = await createClient()
  const { data: campaigns } = await supabase
    .from('campaigns')
    .select('id, name, channel, status, scheduled_at, started_at, completed_at, updated_at')
    .eq('organization_id', context.organizationId)
    .order('updated_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">الحملات</h1>
        <p className="mt-1 text-sm text-text-muted">
          إرسال محدود بالموافقة وحدود الخطة ومعدل الإرسال.
        </p>
      </div>

      <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
        {!campaigns?.length ? (
          <div className="p-10 text-center text-sm text-text-muted">لا توجد حملات بعد.</div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-text-muted">الاسم</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">القناة</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">الحالة</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">تحديث</th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3 font-medium text-text">{c.name}</td>
                  <td className="px-4 py-3 text-text-muted">{c.channel}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-primary-light/30 px-2 py-0.5 text-xs text-primary-dark">
                      {c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {formatDate(c.updated_at, context.timezone)}
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
