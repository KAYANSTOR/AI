import { redirect } from 'next/navigation'
import { requireCapability, CapabilityDisabledError } from '@/lib/capabilities/guard'
import { OrderForm } from './order-form'
import Link from 'next/link'
import { ArrowRight } from 'lucide-react'

export default async function NewOrderPage(props: {
  searchParams: Promise<{ quote_id?: string }>
}) {
  const searchParams = await props.searchParams
  let ctx
  try {
    ctx = await requireCapability('orders')
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

  let defaultValues = undefined

  if (searchParams?.quote_id) {
    const { data: quote } = await ctx.supabase
      .from('quotes')
      .select('*, quote_items(*)')
      .eq('id', searchParams.quote_id)
      .eq('organization_id', ctx.organizationId)
      .eq('business_id', ctx.businessId)
      .single()
      
    if (quote) {
      defaultValues = {
        contact_id: quote.contact_id,
        quote_id: quote.id,
        notes: quote.notes,
        items: quote.quote_items.map((i: any) => ({
          name: i.name,
          description: i.description,
          quantity: i.quantity,
          unit_price: i.unit_price,
          discount: i.discount
        }))
      }
    }
  }

  return (
    <div className="space-y-6">
      <div>
        <Link href="/dashboard/orders" className="inline-flex min-h-11 items-center gap-1 text-xs text-text-muted transition-colors hover:text-text">
          <ArrowRight size={13} />
          العودة للطلبات
        </Link>
        <h1 className="mt-2 text-2xl font-bold tracking-tight text-text">إنشاء طلب</h1>
      </div>

      {!contacts || contacts.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-text-muted">
          لا يوجد عملاء متاحين. يرجى إضافة عميل أولاً من صفحة جهات الاتصال.
        </div>
      ) : (
        <OrderForm contacts={contacts} defaultValues={defaultValues} />
      )}
    </div>
  )
}
