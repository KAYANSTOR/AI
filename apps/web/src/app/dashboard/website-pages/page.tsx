import { redirect } from 'next/navigation'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { WebsitePagesManager } from './website-pages-manager'

export const dynamic = 'force-dynamic'

export default async function WebsitePagesPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const db = await createClient()
  const { data, error } = await db
    .from('website_pages')
    .select('id, name, path, title, description, status, updated_at')
    .eq('organization_id', context.organizationId)
    .order('updated_at', { ascending: false })

  return (
    <div className="space-y-4">
      {error ? (
        <div role="status" className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          يلزم تطبيق ترحيل قاعدة البيانات 0043 لتفعيل إدارة صفحات الموقع.
        </div>
      ) : null}
      <WebsitePagesManager
        pages={(data ?? []) as {
          id: string
          name: string
          path: string
          title: string | null
          description: string | null
          status: 'published' | 'draft' | 'scheduled'
          updated_at: string
        }[]}
        canManage={context.role === 'owner' || context.role === 'admin'}
      />
    </div>
  )
}
