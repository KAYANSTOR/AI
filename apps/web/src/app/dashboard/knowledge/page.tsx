import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, CapabilityDisabledError } from '@/lib/capabilities/guard'
import { KnowledgeManager, type KnowledgeRow } from './knowledge-manager'

export default async function KnowledgePage() {
  let ctx
  try {
    ctx = await requireCapability('knowledge_base')
  } catch (error) {
    if (error instanceof CapabilityDisabledError) {
      return (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-4 text-sm text-text">
          <p className="font-semibold">قاعدة المعرفة غير مُفعّلة لهذه الشركة.</p>
          <p className="mt-1 text-muted">
            فعّلها من{' '}
            <Link href="/dashboard/settings" className="font-semibold underline">
              الإعدادات
            </Link>{' '}
            حتى يستطيع الوكيل الإجابة من مصادرك بدل الاعتماد على التخمين.
          </p>
        </div>
      )
    }
    redirect('/login')
  }

  const { data } = await ctx.supabase
    .from('knowledge_base')
    .select('id, title, content, category, is_active')
    .eq('organization_id', ctx.organizationId)
    .order('updated_at', { ascending: false })

  const canManage = ctx.role === 'owner' || ctx.role === 'admin'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">قاعدة المعرفة</h1>
        <p className="mt-1 text-sm text-muted">
          الأسئلة الشائعة والسياسات ومعلومات النشاط. يبحث الوكيل هنا عند الحاجة، ولا تُحمَّل هذه
          المداخل داخل تعليمات الوكيل.
        </p>
      </div>

      <KnowledgeManager rows={(data ?? []) as KnowledgeRow[]} canManage={canManage} />
    </div>
  )
}
