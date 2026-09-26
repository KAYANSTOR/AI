'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'

export function ContactForm({ organizationId }: { organizationId: string }) {
  const router = useRouter()
  const supabase = createClient()
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [form, setForm] = useState({ full_name: '', phone: '', email: '' })

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)

    const { error: insertError } = await supabase.from('contacts').insert({
      organization_id: organizationId,
      full_name: form.full_name.trim() || null,
      phone: form.phone.trim() || null,
      email: form.email.trim() || null,
    })

    setLoading(false)
    if (insertError) {
      setError(insertError.message)
      return
    }

    setForm({ full_name: '', phone: '', email: '' })
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-lg p-3">{error}</div>
      )}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Full name</label>
        <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="Sara Ahmed" />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Phone</label>
        <input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="+9665..." />
      </div>
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-1">Email</label>
        <input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="w-full border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-indigo-500" placeholder="sara@example.com" />
      </div>
      <button type="submit" disabled={loading} className="w-full flex justify-center items-center gap-2 bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-medium py-2.5 rounded-lg disabled:opacity-60">
        {loading ? <Loader2 className="animate-spin h-4 w-4" /> : 'Save contact'}
      </button>
    </form>
  )
}
