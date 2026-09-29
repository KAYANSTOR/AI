import Link from 'next/link'
import { notFound, redirect } from 'next/navigation'
import { ArrowRight, FileText, Calendar, Building, User } from 'lucide-react'
import { requireCapability, CapabilityDisabledError } from '@/lib/capabilities/guard'
import { QuoteActions } from './quote-actions'
import { formatDateTime } from '@/lib/i18n/format'

export default async function QuoteDetailsPage({
  params,
}: {
  params: Promise<{ quoteId: string }>
}) {
  const { quoteId } = await params

  let ctx
  try {
    ctx = await requireCapability('quotes')
  } catch (error) {
    if (error instanceof CapabilityDisabledError) redirect('/dashboard/settings')
    redirect('/login')
  }

  const [{ data: quote }, { data: items }] = await Promise.all([
    ctx.supabase
      .from('quotes')
      .select('*, contacts(full_name, phone, email)')
      .eq('id', quoteId)
      .eq('organization_id', ctx.organizationId)
      .eq('business_id', ctx.businessId)
      .maybeSingle(),
    ctx.supabase
      .from('quote_items')
      .select('*')
      .eq('quote_id', quoteId)
      .order('created_at', { ascending: true })
  ])

  if (!quote) notFound()

  const contact = quote.contacts as unknown as { full_name: string | null; phone: string | null; email: string | null } | null

  const statusColors: Record<string, string> = {
    draft: 'bg-background text-text-muted',
    sent: 'bg-primary/15 text-primary-dark',
    accepted: 'bg-success/15 text-success',
    rejected: 'bg-error/15 text-error',
    expired: 'bg-warning/15 text-warning',
    cancelled: 'bg-background text-text-muted'
  }
  const statusLabels: Record<string, string> = {
    draft: 'مسودة',
    sent: 'مرسل',
    accepted: 'مقبول',
    rejected: 'مرفوض',
    expired: 'منتهي',
    cancelled: 'ملغي'
  }

  return (
    <div className="space-y-6 max-w-5xl">
      <div>
        <Link href="/dashboard/quotes" className="inline-flex min-h-11 items-center gap-1 text-xs text-text-muted transition-colors hover:text-text">
          <ArrowRight size={13} />
          العودة لعروض الأسعار
        </Link>
        
        <div className="mt-2 flex flex-wrap items-start justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-text flex items-center gap-3">
              {quote.quote_number}
              <span className={`text-sm font-normal px-2.5 py-0.5 rounded-full ${statusColors[quote.status] || statusColors.draft}`}>
                {statusLabels[quote.status] || quote.status}
              </span>
            </h1>
            <p className="mt-1 flex items-center gap-2 text-sm text-text-muted">
              <Calendar size={14} />
              أنشئ في {formatDateTime(quote.created_at as string, ctx.timezone)}
            </p>
          </div>
          
          <QuoteActions quoteId={quote.id} currentStatus={quote.status} />
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        <div className="md:col-span-2 space-y-6">
          <div className="rounded-xl border border-border bg-surface shadow-sm">
            <div className="border-b border-border px-6 py-4">
              <h2 className="text-lg font-bold text-text">التفاصيل المالية</h2>
            </div>
            
            <div className="overflow-x-auto">
              <table className="w-full text-right text-sm">
                <thead className="bg-background text-text-muted">
                  <tr>
                    <th className="px-6 py-3 font-medium">الخدمة / المنتج</th>
                    <th className="px-6 py-3 font-medium">السعر</th>
                    <th className="px-6 py-3 font-medium">الكمية</th>
                    <th className="px-6 py-3 font-medium">الخصم</th>
                    <th className="px-6 py-3 font-medium">الإجمالي</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {items?.map(item => (
                    <tr key={item.id}>
                      <td className="px-6 py-4">
                        <p className="font-medium text-text">{item.name}</p>
                        {item.description && <p className="mt-0.5 text-xs text-text-muted">{item.description}</p>}
                      </td>
                      <td className="px-6 py-4 text-text">{Number(item.unit_price).toFixed(2)}</td>
                      <td className="px-6 py-4 text-text">{item.quantity}</td>
                      <td className="px-6 py-4 text-text">{Number(item.discount).toFixed(2)}</td>
                      <td className="px-6 py-4 font-medium text-text">{Number(item.line_total).toFixed(2)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="border-t border-border bg-background/50 px-6 py-4">
              <div className="flex justify-end">
                <div className="w-64 space-y-3">
                  <div className="flex justify-between text-sm text-text-muted">
                    <span>المجموع الفرعي:</span>
                    <span>{Number(quote.subtotal).toFixed(2)} {quote.currency}</span>
                  </div>
                  <div className="flex justify-between text-sm text-text-muted">
                    <span>الخصم الإجمالي:</span>
                    <span className="text-error">-{Number(quote.discount).toFixed(2)} {quote.currency}</span>
                  </div>
                  <div className="flex justify-between border-t border-border pt-3 text-base font-bold text-text">
                    <span>الإجمالي النهائي:</span>
                    <span className="text-primary">{Number(quote.total).toFixed(2)} {quote.currency}</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          {quote.notes && (
            <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
              <h3 className="mb-2 text-sm font-bold text-text">ملاحظات</h3>
              <p className="whitespace-pre-wrap text-sm text-text-muted">{quote.notes}</p>
            </div>
          )}
        </div>

        <div className="space-y-6">
          <div className="rounded-xl border border-border bg-surface p-6 shadow-sm">
            <h3 className="mb-4 flex items-center gap-2 text-sm font-bold text-text">
              <User size={16} className="text-primary" />
              معلومات العميل
            </h3>
            <div className="space-y-3 text-sm">
              <div>
                <p className="text-text-muted text-xs">الاسم</p>
                <p className="font-medium text-text mt-0.5">{contact?.full_name || 'بدون اسم'}</p>
              </div>
              {contact?.phone && (
                <div>
                  <p className="text-text-muted text-xs">رقم الجوال</p>
                  <p className="text-text mt-0.5" dir="ltr">{contact.phone}</p>
                </div>
              )}
              {contact?.email && (
                <div>
                  <p className="text-text-muted text-xs">البريد الإلكتروني</p>
                  <p className="text-text mt-0.5">{contact.email}</p>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
