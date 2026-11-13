import { redirect } from 'next/navigation'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { FlowNode } from '@/components/ui/flow-node'
import { SectionHeader } from '@/components/ui/section-header'
import { GitBranch, MessageSquare, Zap } from 'lucide-react'

export default async function WorkflowsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const db = await createClient()
  const { data: workflows } = await db
    .from('workflows')
    .select('id, name, status, trigger_type, version, updated_at, published_at')
    .eq('organization_id', context.organizationId)
    .order('updated_at', { ascending: false })
    .limit(50)

  return (
    <div className="space-y-6 max-w-2xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">محرر الأتمتة وسير العمل</h1>
        <p className="mt-1 text-sm text-text-muted">
          مسارات الأتمتة: محفّز ← شروط والتحقق ← إجراء تلقائي أو إشعار.
        </p>
      </div>

      <div className="space-y-4">
        <SectionHeader title="سير العمل النشط" />

        {!workflows?.length ? (
          <div className="space-y-3">
            {/* Mock Flow Nodes matching Figma node 15:1979 */}
            <FlowNode
              type="المحفّز (Trigger)"
              title="وصول رسالة جديدة عبر واتساب"
              subtitle="عند إرسال أي عميل استفساراً لأول مرة"
              icon={<MessageSquare className="h-5 w-5" />}
            />
            <div className="flex justify-center -my-1 text-accent">
              <span className="text-xs font-bold">↓</span>
            </div>
            <FlowNode
              type="شرط (Condition)"
              title="فحص توفر الموظفين"
              subtitle="ساعات العمل من 9 صباحاً إلى 10 مساءً"
              icon={<GitBranch className="h-5 w-5" />}
            />
            <div className="flex justify-center -my-1 text-accent">
              <span className="text-xs font-bold">↓</span>
            </div>
            <FlowNode
              type="إجراء (Action)"
              title="الرد الفوري بالوكيل الذكي"
              subtitle="تقديم خيارات الخدمة وحجز موعد"
              icon={<Zap className="h-5 w-5" />}
            />
          </div>
        ) : (
          <div className="space-y-3">
            {workflows.map((wf) => (
              <FlowNode
                key={wf.id}
                type={wf.trigger_type || 'أتمتة'}
                title={wf.name}
                subtitle={`الإصدار ${wf.version} · الحالة: ${wf.status}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
