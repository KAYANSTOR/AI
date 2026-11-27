'use client'

import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'
import { usePathname } from 'next/navigation'
import { ArrowLeft, ArrowRight, CheckCircle2, Compass, LocateFixed, Sparkles, X } from 'lucide-react'
import {
  dashboardTour,
  markScreenExplored,
  parseExploredScreens,
  restoreTourProgress,
  screenTourGuide,
  shouldShowHomeTour,
  type ScreenTourGuide,
  type TourAccess,
  type TourProgress,
} from '@/lib/dashboard/tour'

const endpoint = '/api/dashboard/tour'
const EXPLORED_STORAGE_PREFIX = 'kayan:tour:explored:'
const EXPLORED_CHANGE_EVENT = 'kayan:tour:explored-change'
const control =
  'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl border border-border bg-surface px-3 text-xs font-bold text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'
const primary =
  'inline-flex min-h-10 items-center justify-center gap-1.5 rounded-xl bg-primary-dark px-3 text-xs font-bold text-primary-dark-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent disabled:opacity-50'

function findTarget(id: string) {
  return document.querySelector<HTMLElement>('[data-tour-target="' + id + '"]')
}

function readLocalExplored(storageKey: string): string | null {
  if (typeof window === 'undefined') return null
  try {
    return window.localStorage.getItem(`${EXPLORED_STORAGE_PREFIX}${storageKey}`)
  } catch (error) {
    console.warn('tour_explored_read_failed', {
      reason: error instanceof Error ? error.message : String(error),
    })
    return null
  }
}

function subscribeToExploredScreens(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  window.addEventListener(EXPLORED_CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(EXPLORED_CHANGE_EVENT, onChange)
  }
}

function serverExploredSnapshot(): null {
  return null
}

function writeLocalExplored(storageKey: string, nextList: string[]): void {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(`${EXPLORED_STORAGE_PREFIX}${storageKey}`, JSON.stringify(nextList))
    window.dispatchEvent(new Event(EXPLORED_CHANGE_EVENT))
  } catch (error) {
    console.warn('tour_explored_write_failed', {
      reason: error instanceof Error ? error.message : String(error),
    })
  }
}

function ScreenTourCard({
  guide,
  onExploreComplete,
}: {
  guide: ScreenTourGuide
  onExploreComplete: (screenKey: string) => void
}) {
  const [stepIndex, setStepIndex] = useState(0)
  const boundedIndex = Math.min(Math.max(0, stepIndex), guide.steps.length - 1)
  const currentStep = guide.steps[boundedIndex]
  const isLast = boundedIndex === guide.steps.length - 1

  return (
    <section
      data-screen-tour-card={guide.screenKey}
      aria-label={`دليل شاشة ${guide.title}`}
      dir="rtl"
      className="mb-3 rounded-2xl border border-[#1F3B22]/15 bg-surface p-3 shadow-sm"
    >
      <div className="flex items-start justify-between gap-2">
        <div className="flex min-w-0 items-start gap-2.5">
          <span className="inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-[#D8E2D0]/65 text-[#1F3B22]">
            <Sparkles size={17} aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5">
              <h2 className="text-xs font-extrabold text-text">{guide.title}</h2>
              <span className="rounded-full bg-[#F2D600]/25 px-2 py-0.5 text-[10px] font-bold text-[#1F3B22]">
                دليل سريع {boundedIndex + 1}/{guide.steps.length}
              </span>
            </div>
            <p className="mt-0.5 text-[11px] leading-5 text-text-muted">{guide.summary}</p>
          </div>
        </div>
        <button
          type="button"
          aria-label="إخفاء الدليل السريع"
          className="inline-flex h-8 w-8 shrink-0 items-center justify-center rounded-lg text-text-muted transition hover:bg-surface-muted hover:text-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-accent"
          onClick={() => onExploreComplete(guide.screenKey)}
        >
          <X size={15} aria-hidden />
        </button>
      </div>

      <div className="mt-2.5 rounded-xl bg-[#D8E2D0]/25 px-3 py-2">
        <p className="text-xs font-bold text-[#1F3B22]">{currentStep.title}</p>
        <p className="mt-0.5 text-[11px] leading-5 text-text-muted">{currentStep.description}</p>
      </div>

      <div className="mt-2.5 flex flex-wrap items-center justify-between gap-2">
        <button
          type="button"
          className="min-h-9 px-2 text-[11px] font-semibold text-text-muted underline underline-offset-4"
          onClick={() => onExploreComplete(guide.screenKey)}
        >
          فهمت، لا تظهره مجدداً
        </button>
        <div className="flex items-center gap-1.5">
          {boundedIndex > 0 && (
            <button
              type="button"
              className={control}
              onClick={() => setStepIndex((prev) => Math.max(0, prev - 1))}
            >
              <ArrowRight size={14} aria-hidden />
              السابق
            </button>
          )}
          <button
            type="button"
            className={primary}
            onClick={() => {
              if (isLast) {
                onExploreComplete(guide.screenKey)
              } else {
                setStepIndex((prev) => Math.min(guide.steps.length - 1, prev + 1))
              }
            }}
          >
            {isLast ? (
              <>
                <CheckCircle2 size={14} aria-hidden />
                تم الاستكشاف
              </>
            ) : (
              <>
                التالي
                <ArrowLeft size={14} aria-hidden />
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  )
}

/**
 * Inline, non-modal onboarding & per-screen guide.
 * - Never covers cards or MobileTabBar on mobile.
 * - Auto-hides permanently once completed, paused, or explored/used, unless reopened via `#dashboard-guide`.
 */
export function DashboardTour({ access, storageKey = 'default' }: { access: TourAccess; storageKey?: string }) {
  return <DashboardTourContent key={storageKey} access={access} storageKey={storageKey} />
}

function DashboardTourContent({ access, storageKey }: { access: TourAccess; storageKey: string }) {
  const pathname = usePathname()
  const { steps } = dashboardTour(access)
  const [stored, setStored] = useState<TourProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [reload, setReload] = useState(0)
  const [busy, setBusy] = useState(false)
  const [dismissed, setDismissed] = useState(false)
  const [reopenRequested, setReopenRequested] = useState(false)
  const exploredSnapshot = useSyncExternalStore(
    subscribeToExploredScreens,
    () => readLocalExplored(storageKey),
    serverExploredSnapshot
  )
  const [localExplored, setLocalExplored] = useState<string[]>([])
  const exploredSet = new Set([...parseExploredScreens(exploredSnapshot), ...localExplored])
  const saving = useRef(false)

  const progress = stored ? restoreTourProgress(stored, steps) : null
  const index = progress ? steps.findIndex((s) => s.id === progress.stepId) : 0
  const step = steps[Math.max(0, index)]
  const home = pathname === '/dashboard'
  const active = home && progress?.status === 'active' && !dismissed
  const showHomeCard = home && shouldShowHomeTour(progress, { dismissed, reopenRequested })
  const innerGuide = !home ? screenTourGuide(pathname, access) : null
  const showInnerCard = Boolean(innerGuide && !exploredSet.has(innerGuide.screenKey))

  useEffect(() => {
    if (typeof window === 'undefined') return
    const syncHash = () => {
      if (window.location.hash === '#dashboard-guide') {
        setDismissed(false)
        setReopenRequested(true)
      }
    }
    const timeout = window.setTimeout(syncHash, 0)
    window.addEventListener('hashchange', syncHash)
    return () => {
      window.clearTimeout(timeout)
      window.removeEventListener('hashchange', syncHash)
    }
  }, [pathname])

  useEffect(() => {
    if (!home && !reopenRequested) return
    const abort = new AbortController()
    void (async () => {
      try {
        const response = await fetch(endpoint, { cache: 'no-store', signal: abort.signal })
        if (!response.ok) throw new Error('tour_load_failed')
        const result = (await response.json()) as { progress: TourProgress }
        if (!abort.signal.aborted) {
          setStored(result.progress)
          setError(null)
        }
      } catch (loadError) {
        if (!abort.signal.aborted) {
          console.warn('tour_progress_load_failed', {
            reason: loadError instanceof Error ? loadError.message : String(loadError),
          })
          setError('تعذّر تحميل تقدم الجولة.')
        }
      }
    })()
    return () => abort.abort()
  }, [home, reopenRequested, reload])

  useEffect(() => {
    if (!active) return
    const target = findTarget(step.id)
    if (!target) return
    target.setAttribute('data-tour-active', 'true')
    return () => target.removeAttribute('data-tour-active')
  }, [active, step.id])

  const completeScreenExploration = useCallback(
    (screenKey: string) => {
      const current = new Set([...parseExploredScreens(readLocalExplored(storageKey)), ...localExplored])
      const updatedList = markScreenExplored(current, screenKey)
      setLocalExplored(updatedList)
      writeLocalExplored(storageKey, updatedList)
    },
    [storageKey, localExplored, setLocalExplored]
  )

  // Auto-retire the screen guide once the user interacts with real controls on that screen.
  useEffect(() => {
    if (!showInnerCard || !innerGuide) return
    const main = document.getElementById('dashboard-main')
    if (!main) return
    const screenKey = innerGuide.screenKey

    const handlePageUse = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (!target) return
      if (target.closest('[data-screen-tour-card]')) return
      if (!target.closest('a, button, input, select, textarea, [role="button"], form')) return
      completeScreenExploration(screenKey)
    }

    main.addEventListener('click', handlePageUse, true)
    main.addEventListener('change', handlePageUse, true)
    return () => {
      main.removeEventListener('click', handlePageUse, true)
      main.removeEventListener('change', handlePageUse, true)
    }
  }, [showInnerCard, innerGuide, completeScreenExploration])

  async function save(next: TourProgress) {
    if (saving.current) return
    saving.current = true
    setBusy(true)
    setError(null)
    if (next.status === 'paused' || next.status === 'completed') {
      setDismissed(true)
      setReopenRequested(false)
    }
    try {
      const response = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(next),
      })
      if (!response.ok) throw new Error('tour_save_failed')
      const result = (await response.json()) as { progress: TourProgress }
      setStored(result.progress)
      if (result.progress.status === 'active') {
        setDismissed(false)
      }
    } catch (saveError) {
      console.warn('tour_progress_save_failed', {
        reason: saveError instanceof Error ? saveError.message : String(saveError),
      })
      setDismissed(false)
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
    const focus = target.matches('a,button')
      ? target
      : target.querySelector<HTMLElement>('a[href],button:not([disabled])')
    focus?.focus({ preventScroll: true })
  }

  if (showInnerCard && innerGuide) {
    return <ScreenTourCard key={innerGuide.screenKey} guide={innerGuide} onExploreComplete={completeScreenExploration} />
  }

  if (!showHomeCard) return null

  return (
    <section
      id="dashboard-guide"
      aria-label="دليل الاستخدام"
      dir="rtl"
      className="mb-4 scroll-mt-3 rounded-2xl border border-[#1F3B22]/15 bg-surface p-3 shadow-sm"
      onKeyDown={(event) => {
        if (event.key === 'Escape' && active && progress && !busy) {
          event.stopPropagation()
          void save({ ...progress, status: 'paused' })
        }
      }}
    >
      <div className="flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <span className="dashboard-service-icon shrink-0 bg-[#D8E2D0]/65 text-[#1F3B22]">
            <Compass size={19} aria-hidden />
          </span>
          <div className="min-w-0">
            <h2 className="text-sm font-extrabold text-text">دليل الاستخدام</h2>
            <p className="text-[11px] leading-5 text-text-muted">
              {active
                ? 'جولة مباشرة في مساحة عملك'
                : progress?.status === 'completed'
                  ? 'أنهيت الجولة مسبقاً ويمكنك إعادتها أو إغلاقها'
                  : 'تعلّم استخدام أدواتك خطوة بخطوة'}
            </p>
          </div>
        </div>
        {active && progress ? (
          <button
            type="button"
            disabled={busy}
            aria-label="تخطي الجولة الآن"
            className={control}
            onClick={() => void save({ ...progress, status: 'paused' })}
          >
            <X size={16} aria-hidden />
          </button>
        ) : progress ? (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              disabled={busy}
              className={control}
              onClick={() =>
                void save({
                  stepId: progress.status === 'completed' ? steps[0].id : step.id,
                  status: 'active',
                })
              }
            >
              {progress.status === 'completed' ? 'إعادة الجولة' : 'استئناف'}
            </button>
            <button
              type="button"
              aria-label="إغلاق الدليل"
              className={control}
              onClick={() => {
                setDismissed(true)
                setReopenRequested(false)
              }}
            >
              <X size={16} aria-hidden />
            </button>
          </div>
        ) : error ? (
          <button
            type="button"
            className={control}
            onClick={() => {
              setError(null)
              setReload((value) => value + 1)
            }}
          >
            إعادة المحاولة
          </button>
        ) : (
          <span role="status" className="text-xs text-text-muted">
            جارٍ التحميل…
          </span>
        )}
      </div>
      {error && (
        <p role="alert" className="mt-2 text-xs leading-5 text-error">
          {error}
        </p>
      )}
      {active && progress && (
        <div className="mt-3 space-y-3">
          <div className="flex items-center justify-between text-xs text-text-muted">
            <span>
              الخطوة {index + 1} من {steps.length}
            </span>
            <span>تقدم الجولة</span>
          </div>
          <div
            role="progressbar"
            aria-label="تقدم الجولة"
            aria-valuemin={1}
            aria-valuemax={steps.length}
            aria-valuenow={index + 1}
            className="h-1.5 overflow-hidden rounded-full bg-surface-muted"
          >
            <div
              className="h-full rounded-full bg-accent"
              style={{ width: `${((index + 1) / steps.length) * 100}%` }}
            />
          </div>
          <div aria-live="polite">
            <h3 className="text-base font-extrabold text-text">{step.title}</h3>
            <p className="mt-1 text-xs leading-6 text-text-muted">{step.description}</p>
          </div>
          <button type="button" onClick={showTarget} className={control}>
            <LocateFixed size={15} aria-hidden />
            أرني العنصر
          </button>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <button
              type="button"
              disabled={busy || index === 0}
              className={control}
              onClick={() => void save({ stepId: steps[index - 1].id, status: 'active' })}
            >
              <ArrowRight size={15} aria-hidden />
              السابق
            </button>
            <button
              type="button"
              disabled={busy}
              className="min-h-10 px-2 text-xs font-semibold text-text-muted underline underline-offset-4"
              onClick={() => void save({ ...progress, status: 'paused' })}
            >
              تخطي الآن
            </button>
            <button
              type="button"
              disabled={busy}
              className={primary}
              onClick={() =>
                void save(
                  index === steps.length - 1
                    ? { ...progress, status: 'completed' }
                    : { stepId: steps[index + 1].id, status: 'active' }
                )
              }
            >
              {index === steps.length - 1 ? 'إنهاء الجولة' : 'التالي'}
              <ArrowLeft size={15} aria-hidden />
            </button>
          </div>
        </div>
      )}
    </section>
  )
}
