'use client'

import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { AlertCircle, Check, Loader2 } from 'lucide-react'
import { ONBOARDING_STAGES, STAGE_DEFINITIONS, nextReadinessStage, type ReadinessChecklist, type OnboardingStage } from '@/lib/onboarding/stages'
import type { SmokeTestOutcome } from '@/lib/onboarding/smoke-test'
import type { ReplyTestResult } from '@/lib/onboarding/reply-test'
import { ar } from '@/lib/i18n/ar'
import { advanceStageAction } from './actions'
import { StageBasics } from './stage-basics'
import { StageConnect, type ConnectStageData } from './stage-connect'
import { StageAgent } from './stage-agent'
import { StageTest } from './stage-test'

export type FastPathData = {
  organizationName: string
  businessName: string
  businessTypeId: string
  publicPhone: string
  timezone: string
  smokeTestResult: SmokeTestOutcome | null
  initialReply: ReplyTestResult | null
  initialTestMessage: string | null
  connect: ConnectStageData
  agent: { name: string; status: string } | null
  savedDescription: string
  hasSavedAgentSetup: boolean
  canManage: boolean
  activated: boolean
  needsRetest: boolean
  completed: ReadinessChecklist
}

/**
 * The FastPath shell.
 *
 * Four stages, one primary action each, and the whole state comes from the server: the
 * stage after refresh, logout or a provider redirect is wherever the database says it is.
 * Moving between stages writes the stage on the server first so a reload can never lose it.
 */
export function FastPath({
  initialStage,
  data,
}: {
  initialStage: OnboardingStage
  data: FastPathData
}) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [transitionError, setTransitionError] = useState<string | null>(null)
  const [failedStage, setFailedStage] = useState<OnboardingStage | null>(null)

  const transitioning = useRef(false)
  const recommended = nextReadinessStage(data.completed)

  function go(next: OnboardingStage) {
    if (!data.canManage || transitioning.current) return
    transitioning.current = true
    // The move is written server-side; the UI follows the server state on refresh rather
    // than keeping a second copy of where the customer is.
    setTransitionError(null)
    startTransition(async () => {
      try {
        const result = await advanceStageAction(next)
        if (!result.ok) {
          setTransitionError(result.error ?? ar.errors.save)
          setFailedStage(next)
          return
        }
        setFailedStage(null)
        router.refresh()
      } catch {
        setTransitionError(ar.errors.generic)
        setFailedStage(next)
      } finally {
        transitioning.current = false
      }
    })
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2">
        <div className="flex items-center justify-between text-xs text-text-muted">
          <span>إنجاز الإعداد</span>
          <span>{[data.completed.basics, data.completed.connect, data.completed.agent, data.completed.test].filter(Boolean).length} من 4 مراحل مكتملة</span>
        </div>
        <div className="h-2 overflow-hidden rounded-full bg-background" role="progressbar" aria-valuemin={0} aria-valuemax={4} aria-valuenow={[data.completed.basics, data.completed.connect, data.completed.agent, data.completed.test].filter(Boolean).length}>
          <div className="h-full rounded-full bg-primary-dark transition-[width]" style={{ width: `${[data.completed.basics, data.completed.connect, data.completed.agent, data.completed.test].filter(Boolean).length * 25}%` }} />
        </div>
      </div>
      <nav aria-label="مراحل الإعداد">
        <ol className="flex items-center gap-1 sm:gap-2">
          {ONBOARDING_STAGES.map((stage, index) => {
            const isDone = [data.completed.basics, data.completed.connect, data.completed.agent, data.completed.test][stage - 1]
            const isCurrent = stage === initialStage
            const status = isDone ? 'مكتملة' : isCurrent ? 'قيد التنفيذ' : stage < initialStage ? 'تحتاج إجراء' : 'لم تبدأ'
            return (
              <li key={stage} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={() => go(stage)}
                  disabled={pending || !data.canManage}
                  aria-current={isCurrent ? 'step' : undefined}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1.5 py-1 disabled:opacity-60"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                      isDone
                        ? 'border-secondary bg-primary-dark text-primary-dark-foreground'
                        : isCurrent
                          ? 'border-secondary bg-surface text-secondary'
                          : 'border-border bg-surface text-text-muted'
                    }`}
                  >
                    {isDone ? <Check size={14} aria-hidden="true" /> : stage}
                  </span>
                  <span className={`w-full truncate text-center text-[11px] leading-4 sm:text-xs ${isCurrent ? 'font-semibold text-secondary' : 'text-text-muted'}`}>
                    {STAGE_DEFINITIONS[stage].name}
                  </span>
                  <span className="text-[10px] text-text-muted">{status}</span>
                </button>
                {index < ONBOARDING_STAGES.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className={`mb-5 h-px flex-1 ${isDone ? 'bg-primary-dark' : 'bg-border'}`}
                  />
                ) : null}
              </li>
            )
          })}
        </ol>
      </nav>

      {!data.activated && data.canManage ? (
        <section aria-label="الإجراء التالي" className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-border bg-surface px-4 py-3">
          <div className="min-w-0">
            <p className="text-xs font-bold text-secondary">الخطوة التالية المطلوبة</p>
            <p className="mt-1 text-sm font-extrabold text-text">{data.completed.test && recommended === 4 ? 'تشغيل النشاط' : STAGE_DEFINITIONS[recommended].name}</p>
            <p className="mt-1 text-xs leading-5 text-text-muted">{data.needsRetest && recommended === 4 ? 'انتهت صلاحية الاختبار السابق أو تغيرت الإعدادات. أعد الاختبار.' : STAGE_DEFINITIONS[recommended].description}</p>
          </div>
          {initialStage !== recommended ? <button type="button" disabled={pending} onClick={() => go(recommended)} className="min-h-11 rounded-xl bg-primary-dark px-4 text-xs font-bold text-primary-dark-foreground disabled:opacity-60">انتقل للخطوة</button> : null}
        </section>
      ) : null}

      {!data.canManage ? (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          إعداد النشاط متاح لمالك النشاط أو المسؤول. يمكنك مشاهدة الحالة، وسيُكمل المالك الخطوات.
        </p>
      ) : null}

      {transitionError ? (
        <div role="alert" className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-error/40 bg-error/10 px-4 py-3">
          <p className="flex min-w-0 items-start gap-2 text-sm text-text">
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            <span>{transitionError}</span>
          </p>
          {failedStage ? (
            <button
              type="button"
              onClick={() => go(failedStage)}
              disabled={pending}
              className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-lg border border-error/40 px-4 py-2 text-sm font-semibold text-text hover:bg-error/10 disabled:opacity-60"
            >
              {pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}
              {ar.common.retry}
            </button>
          ) : null}
        </div>
      ) : null}

      {data.canManage ? <div className="border-t border-border pt-6">
        {initialStage === 1 ? (
          <StageBasics
            businessName={data.businessName || data.organizationName}
            initial={{
              name: data.businessName || data.organizationName,
              businessTypeId: data.businessTypeId,
              phone: data.publicPhone,
              timezone: data.timezone,
            }}
            onContinue={() => go(2)}
          />
        ) : initialStage === 2 ? (
          <StageConnect
            data={data.connect}
            publicPhone={data.publicPhone || null}
            canManage={data.canManage}
            onContinue={() => go(3)}
            onRefresh={() => router.refresh()}
          />
        ) : initialStage === 3 ? (
          <StageAgent
            businessName={data.businessName || data.organizationName}
            savedDescription={data.savedDescription}
            savedAgentName={data.agent?.name ?? null}
            hasSavedSetup={data.hasSavedAgentSetup}
            canManage={data.canManage}
            onContinue={() => go(4)}
          />
        ) : (
          <StageTest
            initialOutcome={data.smokeTestResult}
            initialReply={data.initialReply}
            initialTestMessage={data.initialTestMessage}
            canManage={data.canManage}
            onActivated={() => router.replace('/dashboard')}
          />
        )}
      </div> : null}
    </div>
  )
}
