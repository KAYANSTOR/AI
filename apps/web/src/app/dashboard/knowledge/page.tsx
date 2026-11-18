import { redirect } from 'next/navigation'
import Link from 'next/link'
import { requireCapability, CapabilityDisabledError } from '@/lib/capabilities/guard'
import { ar } from '@/lib/i18n/ar'
import { KnowledgeManager, type KnowledgeRow } from './knowledge-manager'

export default async function KnowledgePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  let ctx
  try {
    ctx = await requireCapability('knowledge_base')
  } catch (error) {
    if (error instanceof CapabilityDisabledError) {
      return (
        <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-4 text-sm text-text">
          <p className="font-semibold">{ar.knowledge.disabledNotice}</p>
          <p className="mt-1 text-text-muted">
            {ar.knowledge.disabledInstructionsBefore}{' '}
            <Link href="/dashboard/settings" className="font-semibold underline">
              الإعدادات
            </Link>{' '}
            {ar.knowledge.disabledInstructionsAfter}
          </p>
        </div>
      )
    }
    redirect('/login')
  }

  const params = await searchParams
  const requestedPage = Math.max(1, Number.parseInt(params.page ?? '1', 10) || 1)
  const pageSize = 50
  const { count: knowledgeCount, error: knowledgeCountError } = await ctx.db
    .from('knowledge_base')
    .select('id', { count: 'exact', head: true })
    .eq('organization_id', ctx.organizationId)
  if (knowledgeCountError) throw new Error(knowledgeCountError.message)

  const totalCount = knowledgeCount ?? 0
  const totalPages = Math.max(1, Math.ceil(totalCount / pageSize))
  const currentPage = Math.min(requestedPage, totalPages)

  const [{ data }, { count: documentCount }, { count: chunkCount }] = await Promise.all([
    ctx.db
      .from('knowledge_base')
      .select('id, title, content, category, is_active, created_at')
      .eq('organization_id', ctx.organizationId)
      .order('updated_at', { ascending: false })
      .range((currentPage - 1) * pageSize, currentPage * pageSize - 1),
    ctx.db.from('knowledge_documents').select('id', { count: 'exact', head: true }).eq('organization_id', ctx.organizationId),
    ctx.db.from('knowledge_chunks').select('id', { count: 'exact', head: true }).eq('organization_id', ctx.organizationId),
  ])

  const canManage = ctx.role === 'owner' || ctx.role === 'admin'

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">{ar.knowledge.title}</h1>
        <p className="mt-1 text-sm text-text-muted">{ar.knowledge.description}</p>
      </div>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-muted">إجمالي المعلومات المحفوظة</p>
          <p className="mt-1 text-2xl font-semibold text-text tabular-nums">{totalCount}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-muted">المستندات</p>
          <p className="mt-1 text-2xl font-semibold text-text tabular-nums">{documentCount ?? 0}</p>
        </div>
        <div className="rounded-xl border border-border bg-surface p-4">
          <p className="text-xs text-text-muted">مقاطع المستندات</p>
          <p className="mt-1 text-2xl font-semibold text-text tabular-nums">{chunkCount ?? 0}</p>
        </div>
      </div>

      <KnowledgeManager rows={(data ?? []) as KnowledgeRow[]} canManage={canManage} currentPage={currentPage} totalPages={totalPages} />
    </div>
  )
}
