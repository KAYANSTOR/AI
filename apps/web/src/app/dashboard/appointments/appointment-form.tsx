'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

type Service = { id: string; name: string; duration_minutes: number }
type Contact = { id: string; full_name: string | null; phone: string | null }

export function AppointmentForm({ organizationId, services, contacts }: { organizationId: string; services: Service[]; contacts: Contact[] }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [contactId, setContactId] = useState('')
  const [serviceId, setServiceId] = useState('')
  const [startsAt, setStartsAt] = useState('')

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!contactId || !serviceId || !startsAt) return
    setLoading(true)
    setError(null)
    const service = services.find((s) => s.id === serviceId)
    const start = new Date(startsAt)
    const end = new Date(start.getTime() + (service?.duration_minutes ?? 60) * 60_000)
    const { error: insertError } = await supabase.from('appointments').insert({
      organization_id: organizationId,
      contact_id: contactId,
      service_id: serviceId,
      starts_at: start.toISOString(),
      ends_at: end.toISOString(),
      status: 'confirmed',
    })
    setLoading(false)
    if (insertError) {
      setError(insertError.message)
      return
    }
    setContactId('')
    setServiceId('')
    setStartsAt('')
    router.refresh()
  }

  if (services.length === 0 || contacts.length === 0) {
    return <p className="text-sm text-slate-500">Add at least one service and one contact before booking.</p>
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Contact</label>
        <select required value={contactId} onChange={(e) => setContactId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Select…</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.full_name || c.phone || c.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Service</label>
        <select required value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500">
          <option value="">Select…</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({s.duration_minutes}m)</option>
          ))}
        </select>
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Starts at</label>
        <input type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" />
      </div>
      <button type="submit" disabled={loading} className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-60">
        {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Confirm appointment'}
      </button>
    </form>
  )
}
