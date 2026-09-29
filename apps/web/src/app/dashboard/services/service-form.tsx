'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { ar } from '@/lib/i18n/ar'

export function ServiceForm({ organizationId }: { organizationId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({
    name: '',
    description: '',
    duration_minutes: 60,
    price_amount: '',
    price_currency: 'USD',
  })

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const price = form.price_amount === '' ? null : Number(form.price_amount)
    const { error: insertError } = await supabase.from('services').insert({
      organization_id: organizationId,
      name: form.name.trim(),
      description: form.description.trim() || null,
      duration_minutes: Number(form.duration_minutes),
      price_amount: price,
      price_currency: form.price_currency,
      is_active: true,
    })

    setLoading(false)
    if (insertError) {
      setError(ar.errors.save)
      return
    }

    setForm({
      name: '',
      description: '',
      duration_minutes: 60,
      price_amount: '',
      price_currency: 'USD',
    })
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-text">{error}</div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-text">{ar.services.name}</label>
        <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text focus:outline-none focus:ring-2 focus:ring-primary/30 md:text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-text">{ar.services.descriptionLabel}</label>
        <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text focus:outline-none focus:ring-2 focus:ring-primary/30 md:text-sm" placeholder={ar.services.optionalDetails} />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-sm font-medium text-text">{ar.services.duration}</label>
          <input type="number" min={5} required value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: Number(e.target.value) }))} className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text focus:outline-none focus:ring-2 focus:ring-primary/30 md:text-sm" />
        </div>
        <div>
          <label className="mb-1 block text-sm font-medium text-text">{ar.services.price}</label>
          <input type="number" min={0} step="0.01" value={form.price_amount} onChange={(e) => setForm((f) => ({ ...f, price_amount: e.target.value }))} className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text focus:outline-none focus:ring-2 focus:ring-primary/30 md:text-sm" placeholder="150" dir="ltr" />
        </div>
      </div>
      <button type="submit" disabled={loading} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-dark py-2.5 text-base font-medium text-surface transition-colors hover:bg-primary disabled:opacity-60 md:text-sm">
        {loading ? <Loader2 className="animate-spin" size={16} /> : ar.services.save}
      </button>
    </form>
  )
}
