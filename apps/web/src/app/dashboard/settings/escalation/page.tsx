import { redirect } from 'next/navigation'
import { requireAdminCapability, NotAuthorizedError } from '@/lib/capabilities/guard'
import { EscalationForm } from './form'

export default async function EscalationSettingsPage() {
  let ctx
  try {
    ctx = await requireAdminCapability(null)
  } catch (error) {
    if (error instanceof NotAuthorizedError) {
      return (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          سياسات التصعيد متاحة للمالك أو المسؤول فقط.
        </div>
      )
    }
    redirect('/login')
  }

  const { data: policies } = await ctx.supabase
    .from('escalation_policies')
    .select('id, name, trigger_type, escalate_after_minutes, notify_roles, is_active')
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">سياسات التصعيد</h1>
        <p className="mt-1 text-sm text-text-muted">
          عند تحذير أو تجاوز SLA يُشعر الأعضاء حسب الأدوار المحددة. يتطلب تطبيق migration 0029.
        </p>
      </div>

      <EscalationForm />

      <div className="overflow-hidden rounded-xl border border-border bg-surface">
        {!policies?.length ? (
          <div className="p-8 text-center text-sm text-text-muted">
            لا توجد سياسات — سيُستخدم إشعار افتراضي عند تجاوز SLA.
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead className="border-b border-border bg-background">
              <tr>
                <th className="px-3 py-2 text-start">الاسم</th>
                <th className="px-3 py-2 text-start">المحفّز</th>
                <th className="px-3 py-2 text-start">الأدوار</th>
                <th className="px-3 py-2 text-start">الحالة</th>
              </tr>
            </thead>
            <tbody>
              {policies.map((p) => (
                <tr key={p.id} className="border-b border-border last:border-0">
                  <td className="px-3 py-2 font-medium">{p.name}</td>
                  <td className="px-3 py-2 text-text-muted">{p.trigger_type}</td>
                  <td className="px-3 py-2 text-xs text-text-muted">
                    {(p.notify_roles as string[])?.join(', ')}
                  </td>
                  <td className="px-3 py-2">{p.is_active ? 'نشط' : 'متوقف'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  )
}
