import { redirect } from 'next/navigation'
import { requireAdminCapability, NotAuthorizedError } from '@/lib/capabilities/guard'
import { ApiKeyManager } from './manager'

export default async function ApiKeysPage() {
  let ctx
  try {
    ctx = await requireAdminCapability(null)
  } catch (error) {
    if (error instanceof NotAuthorizedError) {
      return (
        <div className="rounded-xl border border-warning/40 bg-warning/10 p-4 text-sm">
          مفاتيح API متاحة للمالك أو المسؤول فقط.
        </div>
      )
    }
    redirect('/login')
  }

  const { data: keys } = await ctx.supabase
    .from('organization_api_keys')
    .select('id, name, key_prefix, scopes, last_used_at, revoked_at, created_at')
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">مفاتيح API</h1>
        <p className="mt-1 text-sm text-text-muted">
          يُعرض المفتاح الكامل مرة واحدة عند الإنشاء. التخزين يكون بالتجزئة فقط.
        </p>
      </div>
      <ApiKeyManager initialKeys={keys ?? []} />
    </div>
  )
}
