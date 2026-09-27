'use client'

import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Trash2 } from 'lucide-react'

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
    if (!confirm('Delete this service?')) return
    await supabase.from('services').delete().eq('id', id).eq('organization_id', organizationId)
    router.refresh()
  }

  if (services.length === 0) {
    return (
      <div className="bg-white border border-dashed border-slate-200 rounded-xl p-10 text-center">
        <p className="text-slate-500 text-sm">No services yet. Add the first one on the left.</p>
      </div>
    )
  }

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
      <table className="w-full text-sm">
        <thead className="bg-slate-50 border-b border-slate-200">
          <tr>
            <th className="text-left font-medium text-slate-600 px-4 py-3">Service</th>
            <th className="text-left font-medium text-slate-600 px-4 py-3">Duration</th>
            <th className="text-left font-medium text-slate-600 px-4 py-3">Price</th>
            <th className="text-right font-medium text-slate-600 px-4 py-3">Actions</th>
          </tr>
        </thead>
        <tbody>
          {services.map((s) => (
            <tr key={s.id} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3">
                <div className="font-medium text-slate-900">{s.name}</div>
                {s.description && <div className="text-slate-500 text-xs mt-0.5 line-clamp-1">{s.description}</div>}
              </td>
              <td className="px-4 py-3 text-slate-600">{s.duration_minutes} min</td>
              <td className="px-4 py-3 text-slate-600">{s.price_amount != null ? `${s.price_currency} ${Number(s.price_amount).toFixed(2)}` : '—'}</td>
              <td className="px-4 py-3 text-right">
                <button type="button" onClick={() => remove(s.id)} className="inline-flex items-center gap-1 text-error hover:underline text-xs font-medium">
                  <Trash2 size={14} /> Delete
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
