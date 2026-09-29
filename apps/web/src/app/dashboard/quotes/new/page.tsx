import { redirect } from 'next/navigation'
import { requireCapability, CapabilityDisabledError } from '@/lib/capabilities/guard'
import { QuoteForm } from './quote-form'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default async function NewQuotePage() {
  let ctx
  try {
    ctx = await requireCapability('quotes')
  } catch (error) {
    if (error instanceof CapabilityDisabledError) redirect('/dashboard/settings')
    redirect('/login')
  }

  // Fetch recent contacts to populate the dropdown
  const { data: contacts } = await ctx.supabase
    .from('contacts')
    .select('id, full_name, phone')
    .eq('organization_id', ctx.organizationId)
    .order('created_at', { ascending: false })
    .limit(200)

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/quotes" className="inline-flex min-h-11 items-center gap-1 text-xs text-text-muted transition-colors hover:text-text">
          <ArrowRight size={13} />
          العودة لعروض الأسعار
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-text">إنشاء عرض سعر</h1>
      </div>

      {!contacts || contacts.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-text-muted">
          لا يوجد عملاء متاحين. يرجى إضافة عميل أولاً من صفحة جهات الاتصال.
        </div>
      ) : (
        <QuoteForm contacts={contacts} />
      )}
    </div>
  )
}
