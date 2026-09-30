'use client'

import { useEffect, useRef, useState } from 'react'
import { Loader2, CheckCircle2, ArrowLeft } from 'lucide-react'
import { BUSINESS_TYPES } from '@/lib/capabilities/business-types'
import { saveBasicsAction } from './actions'

/**
 * Stage 1 — ابدأ.
 *
 * The three things the fast path actually needs: the business name, what kind of business
 * it is, and the number it already uses. Every field autosaves (debounced) so leaving the
 * page never loses typing; the primary action saves once more and moves on.
 */
export function StageBasics({
  initial,
  businessName,
  onContinue,
}: {
  initial: { name: string; businessTypeId: string; phone: string; timezone: string }
  businessName: string
  onContinue: () => void
}) {
  const [name, setName] = useState(initial.name || businessName)
  const [businessTypeId, setBusinessTypeId] = useState(initial.businessTypeId)
  const [phone, setPhone] = useState(initial.phone)
  const [saveState, setSaveState] = useState<'idle' | 'saving' | 'saved'>('idle')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const firstRender = useRef(true)
  const timezone = useRef<string>(initial.timezone)

  useEffect(() => {
    // The browser knows the real timezone; the profile default is UTC. Sending it along
    // turns a placeholder default into a correct one without asking the customer.
    try {
      const zone = Intl.DateTimeFormat().resolvedOptions().timeZone
      if (zone) timezone.current = zone
    } catch {
      // keep the server-provided value
    }
  }, [])

  useEffect(() => {
    if (firstRender.current) {
      firstRender.current = false
      return
    }
    if (name.trim().length < 2) return
    const handle = setTimeout(async () => {
      setSaveState('saving')
      const result = await saveBasicsAction({
        name,
        businessTypeId,
        phone,
        timezone: timezone.current,
      })
      if (result.ok) {
        setSaveState('saved')
        setError(null)
      } else {
        setSaveState('idle')
        setError(result.error ?? null)
      }
    }, 900)
    return () => clearTimeout(handle)
  }, [name, businessTypeId, phone])

  async function handleContinue() {
    setBusy(true)
    setError(null)
    const result = await saveBasicsAction({
      name,
      businessTypeId,
      phone,
      timezone: timezone.current,
    })
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'تعذّر الحفظ. حاول مرة أخرى.')
      return
    }
    onContinue()
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-text sm:text-2xl">مرحباً بك 👋</h1>
        <p className="text-sm leading-6 text-text-muted">
          عرّفنا بنشاطك، وسنجهّز الباقي. كل ما تكتبه هنا يُحفظ تلقائياً.
        </p>
      </div>

      <div className="space-y-4">
        <label className="block">
          <span className="text-sm font-semibold text-text">اسم النشاط</span>
          <input
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="مثال: روائع الأعراس"
            className="mt-1.5 min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-text outline-none transition-colors focus:border-primary-dark focus:ring-2 focus:ring-primary-light"
          />
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-text">ما نوع نشاطك؟</span>
          <select
            value={businessTypeId}
            onChange={(event) => setBusinessTypeId(event.target.value)}
            className="mt-1.5 min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-text outline-none transition-colors focus:border-primary-dark focus:ring-2 focus:ring-primary-light"
          >
            {BUSINESS_TYPES.map((type) => (
              <option key={type.id} value={type.id}>
                {type.label}
              </option>
            ))}
          </select>
          <span className="mt-1.5 block text-xs leading-5 text-text-muted">
            يحدد هذا الوحدات التي ستُفعّل تلقائياً (المواعيد، العروض، الطلبات…). يمكنك تغييره لاحقاً.
          </span>
        </label>

        <label className="block">
          <span className="text-sm font-semibold text-text">رقم نشاطك الحالي</span>
          <input
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            placeholder="+967777123456"
            dir="ltr"
            inputMode="tel"
            className="mt-1.5 min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-text outline-none transition-colors focus:border-primary-dark focus:ring-2 focus:ring-primary-light"
          />
          <span className="mt-1.5 block text-xs leading-5 text-text-muted">
            الرقم الذي يعرفه عملاؤك. لن نطلب منك تغييره، ويمكنك إضافته لاحقاً.
          </span>
        </label>
      </div>

      {error ? (
        <p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-text">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <span className="flex min-h-6 items-center gap-2 text-xs text-text-muted" role="status">
          {saveState === 'saving' ? (
            <>
              <Loader2 size={14} className="animate-spin" aria-hidden="true" /> جارٍ الحفظ التلقائي…
            </>
          ) : saveState === 'saved' ? (
            <>
              <CheckCircle2 size={14} className="text-success" aria-hidden="true" /> تم الحفظ تلقائياً
            </>
          ) : (
            'حفظ تلقائي'
          )}
        </span>

        <button
          type="button"
          onClick={handleContinue}
          disabled={busy}
          className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-dark px-6 text-base font-semibold text-white transition-colors hover:bg-primary disabled:opacity-60 sm:w-auto"
        >
          {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
          تجهيز نشاطي
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
