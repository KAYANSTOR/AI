'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Trash2 } from 'lucide-react'
import { ar } from '@/lib/i18n/ar'
import { formatNumber } from '@/lib/i18n/format'

type Service = {
  id: string
  name: string
  description: string | null
  duration_minutes: number
  price_amount: number | null
  price_currency: string
  is_active: boolean
}

export function ServiceList({ services, organizationId }: { services: Service[]; organizationId: string }) {
  const router = useRouter()
  const supabase = createClient()

  async function remove(id: string) {
    if (!confirm(ar.services.confirmDelete)) return
    await supabase.from('services').delete().eq('id', id).eq('organization_id', organizationId)
    router.refresh()
  }

  if (services.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-border bg-surface p-10 text-center">
        <p className="text-sm text-text-muted">{ar.services.empty}</p>
      </div>
    )
  }

  return (
    <div className="min-w-0 overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <ul className="divide-y divide-border md:hidden">
        {services.map((service) => (
          <li key={service.id} className="space-y-2 p-4">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="font-medium text-text">{service.name}</p>
                {service.description && <p className="mt-1 line-clamp-2 text-xs text-text-muted">{service.description}</p>}
              </div>
              <button type="button" onClick={() => remove(service.id)} className="inline-flex min-h-11 shrink-0 items-center gap-1 rounded-lg px-2 text-xs font-medium text-error hover:bg-error/10">
                <Trash2 size={14} aria-hidden="true" /> {ar.services.delete}
              </button>
            </div>
            <div className="flex flex-wrap justify-between gap-2 text-sm text-text-muted">
              <span>{formatNumber(service.duration_minutes)} {ar.services.minutes}</span>
              <span dir="ltr">{service.price_amount != null ? `${service.price_currency} ${formatNumber(Number(service.price_amount), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ar.common.unknown}</span>
            </div>
          </li>
        ))}
      </ul>
      <div className="hidden overflow-x-auto md:block">
        <table className="w-full text-sm">
          <thead className="border-b border-border bg-background">
            <tr>
              <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.services.name}</th>
              <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.services.duration}</th>
              <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.services.price}</th>
              <th className="px-4 py-3 text-start font-medium text-text-muted">{ar.services.actions}</th>
            </tr>
          </thead>
          <tbody>
            {services.map((service) => (
              <tr key={service.id} className="border-b border-border last:border-0">
                <td className="px-4 py-3">
                  <div className="font-medium text-text">{service.name}</div>
                  {service.description && <div className="mt-0.5 line-clamp-1 text-xs text-text-muted">{service.description}</div>}
                </td>
                <td className="px-4 py-3 text-text-muted">{formatNumber(service.duration_minutes)} {ar.services.minutes}</td>
                <td dir="ltr" className="px-4 py-3 text-start text-text-muted">{service.price_amount != null ? `${service.price_currency} ${formatNumber(Number(service.price_amount), { minimumFractionDigits: 2, maximumFractionDigits: 2 })}` : ar.common.unknown}</td>
                <td className="px-4 py-3">
                  <button type="button" onClick={() => remove(service.id)} className="inline-flex min-h-11 items-center gap-1 rounded-lg px-2 text-xs font-medium text-error hover:bg-error/10">
                    <Trash2 size={14} aria-hidden="true" /> {ar.services.delete}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  )
}
