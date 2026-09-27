'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

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
      setError(insertError.message)
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
        <label className="block text-sm font-medium text-slate-700 mb-1">Name</label>
        <input required value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Teeth Cleaning" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Description</label>
        <textarea value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={2} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="Optional details the AI can use" />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Duration (min)</label>
          <input type="number" min={5} required value={form.duration_minutes} onChange={(e) => setForm((f) => ({ ...f, duration_minutes: Number(e.target.value) }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Price</label>
          <input type="number" min={0} step="0.01" value={form.price_amount} onChange={(e) => setForm((f) => ({ ...f, price_amount: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30" placeholder="150" />
        </div>
      </div>
      <button type="submit" disabled={loading} className="w-full flex justify-center items-center gap-2 bg-primary-dark hover:bg-primary text-surface text-sm font-medium py-2.5 rounded-lg disabled:opacity-60 transition-colors">
        {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Add service'}
      </button>
    </form>
  )
}
