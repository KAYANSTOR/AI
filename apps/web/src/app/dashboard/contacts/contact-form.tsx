'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Loader2 } from 'lucide-react'
import { ar } from '@/lib/i18n/ar'

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
      setError(ar.errors.save)
      return
    }

    setForm({ full_name: '', phone: '', email: '' })
    router.refresh()
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4">
      {error && (
        <div className="rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-text">{error}</div>
      )}
      <div>
        <label className="mb-1 block text-sm font-medium text-text">{ar.contacts.fullName}</label>
        <input value={form.full_name} onChange={(e) => setForm((f) => ({ ...f, full_name: e.target.value }))} className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-base text-text focus:outline-none focus:ring-2 focus:ring-primary/30 md:text-sm" />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-text">{ar.contacts.phone}</label>
        <input dir="ltr" value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-start text-base text-text focus:outline-none focus:ring-2 focus:ring-primary/30 md:text-sm" placeholder="+9665..." />
      </div>
      <div>
        <label className="mb-1 block text-sm font-medium text-text">{ar.contacts.email}</label>
        <input dir="ltr" type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} className="min-h-11 w-full rounded-lg border border-border bg-surface px-3 py-2 text-start text-base text-text focus:outline-none focus:ring-2 focus:ring-primary/30 md:text-sm" placeholder="sara@example.com" />
      </div>
      <button type="submit" disabled={loading} className="flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-dark py-2.5 text-base font-medium text-surface transition-colors hover:bg-primary disabled:opacity-60 md:text-sm">
        {loading ? <Loader2 className="animate-spin" size={16} /> : ar.common.save}
      </button>
    </form>
  )
}
