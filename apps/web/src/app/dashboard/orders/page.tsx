import Link from 'next/link'
import { redirect } from 'next/navigation'
import { ShoppingBag, Plus } from 'lucide-react'
import { requireCapability, CapabilityDisabledError } from '@/lib/capabilities/guard'
import { ar } from '@/lib/i18n/ar'
import { formatDateTime } from '@/lib/i18n/format'

export default async function OrdersPage() {
  let ctx
  try {
    ctx = await requireCapability('orders')
  } catch (error) {
    if (error instanceof CapabilityDisabledError) redirect('/dashboard/settings')
    redirect('/login')
  }

  const { data: orders } = await ctx.supabase
    .from('orders')
    .select('id, order_number, status, total, currency, created_at, contacts(full_name, phone)')
    .eq('organization_id', ctx.organizationId)
    .eq('business_id', ctx.businessId)
    .order('created_at', { ascending: false })
    .limit(100)

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">الطلبات</h1>
          <p className="mt-1 text-sm text-text-muted">إدارة الطلبات الخاصة بالعملاء.</p>
        </div>
        <Link
          href="/dashboard/orders/new"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark"
        >
          <Plus size={16} />
          إنشاء طلب جديد
        </Link>
      </div>

      {!orders?.length ? (
        <div className="rounded-xl border border-border bg-surface p-10 text-center text-sm text-text-muted">
          <ShoppingBag size={40} className="mx-auto mb-4 text-border" />
          <p>لا توجد طلبات حالياً.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
          <div className="overflow-x-auto">
            <table className="w-full text-right text-sm">
              <thead className="border-b border-border bg-background/50 text-text-muted">
                <tr>
                  <th className="px-4 py-3 font-medium">رقم الطلب</th>
                  <th className="px-4 py-3 font-medium">العميل</th>
                  <th className="px-4 py-3 font-medium">الإجمالي</th>
                  <th className="px-4 py-3 font-medium">الحالة</th>
                  <th className="px-4 py-3 font-medium">التاريخ</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((order) => {
                  const contact = order.contacts as unknown as { full_name: string | null; phone: string | null } | null
                  const statusColors: Record<string, string> = {
                    draft: 'bg-background text-text-muted',
                    confirmation: 'bg-primary/15 text-primary-dark',
                    processing: 'bg-warning/15 text-warning-dark',
                    completed: 'bg-success/15 text-success',
                    cancelled: 'bg-error/15 text-error'
                  }
                  const statusLabels: Record<string, string> = {
                    draft: 'مسودة',
                    confirmation: 'بانتظار التأكيد',
                    processing: 'قيد المعالجة',
                    completed: 'مكتمل',
                    cancelled: 'ملغي'
                  }

                  return (
                    <tr key={order.id} className="transition-colors hover:bg-background/50">
                      <td className="px-4 py-3">
                        <Link href={`/dashboard/orders/${order.id}`} className="font-medium text-primary hover:underline">
                          {order.order_number}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-text">
                        {contact?.full_name || contact?.phone || ar.common.unknown}
                      </td>
                      <td className="px-4 py-3 text-text">
                        {Number(order.total).toFixed(2)} {order.currency}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex rounded-full px-2 py-0.5 text-xs ${statusColors[order.status] || statusColors.draft}`}>
                          {statusLabels[order.status] || order.status}
                        </span>
                      </td>
                      <td className="px-4 py-3 text-text-muted">
                        {formatDateTime(order.created_at as string, ctx.timezone)}
                      </td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  )
}
