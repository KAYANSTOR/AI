'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { ar } from '@/lib/i18n/ar'
import { formatNumber } from '@/lib/i18n/format'

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
      setError(ar.errors.save)
      return
    }
    setContactId('')
    setServiceId('')
    setStartsAt('')
    router.refresh()
  }

  if (services.length === 0 || contacts.length === 0) {
    return <p className="text-sm text-text-muted">{ar.appointments.prerequisites}</p>
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && <div className="rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-text">{error}</div>}
      <div>
        <label className="mb-1 block text-sm font-medium text-text">{ar.appointments.contact}</label>
        <select required value={contactId} onChange={(e) => setContactId(e.target.value)} className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text focus:outline-none focus:ring-2 focus:ring-primary/30 md:text-sm">
          <option value="">{ar.appointments.choose}</option>
          {contacts.map((c) => (
            <option key={c.id} value={c.id}>{c.full_name || c.phone || c.id.slice(0, 8)}</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-text">{ar.appointments.service}</label>
        <select required value={serviceId} onChange={(e) => setServiceId(e.target.value)} className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text focus:outline-none focus:ring-2 focus:ring-primary/30 md:text-sm">
          <option value="">{ar.appointments.choose}</option>
          {services.map((s) => (
            <option key={s.id} value={s.id}>{s.name} ({formatNumber(s.duration_minutes)} {ar.services.minutes})</option>
          ))}
        </select>
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-text">{ar.appointments.startsAt}</label>
        <input dir="ltr" type="datetime-local" required value={startsAt} onChange={(e) => setStartsAt(e.target.value)} className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text focus:outline-none focus:ring-2 focus:ring-primary/30 md:text-sm" />
      </div>
      <button type="submit" disabled={loading} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-dark py-2.5 text-base font-medium text-surface transition-colors hover:bg-primary disabled:opacity-60 md:text-sm">
        {loading ? <Loader2 className="animate-spin" size={16} /> : ar.appointments.confirm}
      </button>
    </form>
  )
}
