import { redirect } from 'next/navigation'
import { Megaphone } from 'lucide-react'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { formatDate, formatDateTime } from '@/lib/i18n/format'
import { MobileEmptyState } from '@/components/ui/empty-state'
import { CreateCampaignForm } from './create-campaign-form'
import { CampaignRowActions } from './campaign-row-actions'

export const dynamic = 'force-dynamic'

const STATUS_AR: Record<string, string> = {
  draft: 'مسودة',
  scheduled: 'مجدولة',
  running: 'قيد الإرسال',
  paused: 'متوقفة',
  completed: 'مكتملة',
  cancelled: 'ملغاة',
}

export default async function CampaignsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const db = await createClient()
  const canManage = context.role === 'owner' || context.role === 'admin'

  const { data: campaigns } = await db
    .from('campaigns')
    .select(
      'id, name, channel, status, scheduled_at, started_at, completed_at, updated_at, template_body'
    )
    .eq('organization_id', context.organizationId)
    .order('updated_at', { ascending: false })
    .limit(50)

  const rows = campaigns ?? []

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">الحملات</h1>
        <p className="mt-1 text-sm text-text-muted">
          إنشاء وإرسال حملات واتساب بحدود الخطة والموافقة — منطق التشغيل عبر عمال الإرسال.
        </p>
      </div>

      {canManage ? <CreateCampaignForm /> : null}

      {!rows.length ? (
        <MobileEmptyState
          icon={Megaphone}
          title="لا توجد حملات"
          description={
            canManage
              ? 'أنشئ حملة من النموذج أعلاه. لن تُرسل إلا بعد البدء ووجود جمهور/قناة.'
              : 'لم يُنشئ المسؤول أي حملات بعد.'
          }
        />
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background">
              <tr>
                <th className="px-4 py-3 text-start font-medium text-text-muted">الاسم</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">القناة</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">الحالة</th>
                <th className="px-4 py-3 text-start font-medium text-text-muted">تحديث</th>
                {canManage ? (
                  <th className="px-4 py-3 text-start font-medium text-text-muted">تشغيل</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((c) => (
                <tr key={c.id} className="border-b border-border last:border-0">
                  <td className="px-4 py-3">
                    <p className="font-medium text-text">{c.name}</p>
                    {c.template_body ? (
                      <p className="mt-0.5 line-clamp-1 text-xs text-text-muted">{c.template_body}</p>
                    ) : null}
                    {c.scheduled_at ? (
                      <p className="mt-0.5 text-xs text-text-muted">
                        مجدولة: {formatDateTime(c.scheduled_at, context.timezone)}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 text-text-muted">{c.channel}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-full bg-primary-light/30 px-2 py-0.5 text-xs text-secondary">
                      {STATUS_AR[c.status] ?? c.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-xs text-text-muted">
                    {formatDate(c.updated_at, context.timezone)}
                  </td>
                  {canManage ? (
                    <td className="px-4 py-3">
                      <CampaignRowActions campaignId={c.id} status={c.status} />
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
