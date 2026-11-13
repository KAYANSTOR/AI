import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { FlowNode } from '@/components/ui/flow-node'
import { SectionHeader } from '@/components/ui/section-header'
import { MobileEmptyState } from '@/components/ui/empty-state'
import { GitBranch } from 'lucide-react'

export const dynamic = 'force-dynamic'

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

  const rows = workflows ?? []

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">الأتمتة وسير العمل</h1>
        <p className="mt-1 text-sm text-text-muted">
          مسارات المتابعة والتذكير المرتبطة بحسابك. لا تُعرض أمثلة وهمية.
        </p>
      </div>

      <div className="space-y-4">
        <SectionHeader title="مسارات العمل" />

        {rows.length === 0 ? (
          <MobileEmptyState
            icon={GitBranch}
            title="لا توجد مسارات أتمتة"
            description="أنشئ مسارات متابعة وتذكير بعد تفعيل الوحدات المناسبة وربط القنوات."
            action={
              <Link
                href="/dashboard/settings"
                className="mt-2 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark"
              >
                فتح الإعدادات
              </Link>
            }
          />
        ) : (
          <div className="space-y-3">
            {rows.map((wf) => (
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
