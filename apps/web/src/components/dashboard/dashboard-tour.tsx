'use client'

import { useEffect, useRef, useState } from 'react'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ArrowRight, Compass, LocateFixed, RotateCcw, X } from 'lucide-react'
import { dashboardTour, restoreTourProgress, type TourAccess, type TourProgress } from '@/lib/dashboard/tour'

const endpoint = '/api/dashboard/tour'
const control = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'
const primary = 'inline-flex min-h-11 items-center justify-center gap-1.5 rounded-xl bg-primary-dark px-3 text-xs font-bold text-primary-dark-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

function findTarget(id: string) {
  return document.querySelector<HTMLElement>('[data-tour-target="' + id + '"]')
}

/** Inline, non-modal guide: never covers navigation, traps focus, or blocks work. */
export function DashboardTour({ access }: { access: TourAccess }) {
  const pathname = usePathname()
  const { steps } = dashboardTour(access)
  const [stored, setStored] = useState<TourProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const saving = useRef(false)
  const progress = stored ? restoreTourProgress(stored, steps) : null
  const index = progress ? steps.findIndex(step => step.id === progress.stepId) : 0
  const step = steps[Math.max(0, index)]
  const home = pathname === '/dashboard'
  const active = home && progress?.status === 'active' && !dismissed

  useEffect(() => {
    const abort = new AbortController()
    void (async () => {
      try {
        const response = await fetch(endpoint, { cache: 'no-store', signal: abort.signal })
        if (!response.ok) throw new Error('tour_load_failed')
        const result = await response.json() as { progress: TourProgress }
        if (!abort.signal.aborted) { setStored(result.progress); setError(null) }
      } catch {
        if (!abort.signal.aborted) setError('تعذّر تحميل تقدم الجولة.')
      }
    })()
    return () => abort.abort()
  }, [reload])

  useEffect(() => {
    if (!active) return
    const target = findTarget(step.id)
    if (!target) return
    target.setAttribute('data-tour-active', 'true')
    return () => target.removeAttribute('data-tour-active')
  }, [active, step.id])

  async function save(next: TourProgress) {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError(null)
    if (next.status === 'paused') setDismissed(true)
    try {
      const response = await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(next) })
      if (!response.ok) throw new Error('tour_save_failed')
      const result = await response.json() as { progress: TourProgress }
      setStored(result.progress)
      setDismissed(false)
    } catch {
      setError('تعذّر حفظ تقدم الجولة. يمكنك المتابعة في التطبيق والمحاولة مجدداً.')
    } finally {
      saving.current = false
      setBusy(false)
    }
  }

  function showTarget() {
    const target = findTarget(step.id)
    if (!target || target.getClientRects().length === 0) {
      setError('هذا العنصر غير ظاهر الآن. يمكنك متابعة الخطوة التالية.')
      return
    }
    target.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'auto' })
    const focus = target.matches('a,button') ? target : target.querySelector<HTMLElement>('a[href],button:not([disabled])')
    focus?.focus({ preventScroll: true })
  }

  if (!home) return null
  return <section id="dashboard-guide" aria-label="دليل الاستخدام" className="mb-4 scroll-mt-3 rounded-2xl border border-border bg-surface p-3 shadow-sm"
    onKeyDown={event => { if (event.key === 'Escape' && active && progress && !busy) { event.stopPropagation(); void save({ ...progress, status: 'paused' }) } }}>
    <div className="flex items-center justify-between gap-2">
      <div className="flex min-w-0 items-center gap-2">
        <span className="dashboard-service-icon shrink-0"><Compass size={19} aria-hidden /></span>
        <div className="min-w-0"><h2 className="text-sm font-extrabold text-text">دليل الاستخدام</h2>
          <p className="text-[11px] leading-5 text-text-muted">{active ? 'جولة مباشرة في مساحة عملك' : progress?.status === 'completed' ? 'أنهيت الجولة ويمكنك إعادتها' : 'تعلّم استخدام أدواتك خطوة بخطوة'}</p></div>
      </div>
      {active && progress ? <button type="button" disabled={busy} aria-label="تخطي الجولة الآن" className={control} onClick={() => void save({ ...progress, status: 'paused' })}><X size={16} aria-hidden /></button>
        : progress ? <button type="button" disabled={busy} className={control} onClick={() => void save({ stepId: progress.status === 'completed' ? steps[0].id : step.id, status: 'active' })}>{progress.status === 'completed' ? 'إعادة الجولة' : 'استئناف'}</button>
        : error ? <button type="button" className={control} onClick={() => { setError(null); setReload(value => value + 1) }}>إعادة المحاولة</button>
        : <span role="status" className="text-xs text-text-muted">جارٍ التحميل…</span>}
    </div>
    {error && <p role="alert" className="mt-2 text-xs leading-5 text-error">{error}</p>}
    {active && progress && <div className="mt-3 space-y-3">
      <div className="flex items-center justify-between text-xs text-text-muted"><span>الخطوة {index + 1} من {steps.length}</span><span>تقدم الجولة</span></div>
      <div role="progressbar" aria-label="تقدم الجولة" aria-valuemin={1} aria-valuemax={steps.length} aria-valuenow={index + 1} className="h-1.5 overflow-hidden rounded-full bg-surface-muted"><div className="h-full rounded-full bg-accent" style={{ width: ((index + 1) / steps.length * 100) + '%' }} /></div>
      <div aria-live="polite"><h3 className="text-base font-extrabold text-text">{step.title}</h3><p className="mt-1 text-xs leading-6 text-text-muted">{step.description}</p></div>
      <button type="button" onClick={showTarget} className={control}><LocateFixed size={15} aria-hidden />أرني العنصر</button>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <button type="button" disabled={busy || index === 0} className={control} onClick={() => void save({ stepId: steps[index - 1].id, status: 'active' })}><ArrowRight size={15} aria-hidden />السابق</button>
        <button type="button" disabled={busy} className="min-h-11 px-2 text-xs font-semibold text-text-muted underline underline-offset-4" onClick={() => void save({ ...progress, status: 'paused' })}>تخطي الآن</button>
        <button type="button" disabled={busy} className={primary} onClick={() => void save(index === steps.length - 1 ? { ...progress, status: 'completed' } : { stepId: steps[index + 1].id, status: 'active' })}>{index === steps.length - 1 ? 'إنهاء الجولة' : 'التالي'}<ArrowLeft size={15} aria-hidden /></button>
      </div>
    </div>}
    {!active && progress && progress.status !== 'completed' && <button type="button" disabled={busy} className="mt-2 inline-flex min-h-11 items-center gap-1.5 text-xs font-semibold text-secondary" onClick={() => void save({ stepId: steps[0].id, status: 'active' })}><RotateCcw size={14} aria-hidden />ابدأ من جديد</button>}
  </section>
}
