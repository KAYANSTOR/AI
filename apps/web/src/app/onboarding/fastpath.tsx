'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Check } from 'lucide-react'
import { ONBOARDING_STAGES, STAGE_DEFINITIONS, type OnboardingStage } from '@/lib/onboarding/stages'
import type { SmokeTestOutcome } from '@/lib/onboarding/smoke-test'
import type { ReplyTestResult } from '@/lib/onboarding/reply-test'
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
  connect: ConnectStageData
  agent: { name: string; status: string } | null
  savedDescription: string
  hasSavedAgentSetup: boolean
  canManage: boolean
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

  function go(next: OnboardingStage) {
    // The move is written server-side; the UI follows the server state on refresh rather
    // than keeping a second copy of where the customer is.
    startTransition(async () => {
      await advanceStageAction(next)
      router.refresh()
    })
  }

  return (
    <div className="space-y-6">
      <nav aria-label="مراحل الإعداد">
        <ol className="flex items-center gap-1 sm:gap-2">
          {ONBOARDING_STAGES.map((stage, index) => {
            const isDone = stage < initialStage
            const isCurrent = stage === initialStage
            return (
              <li key={stage} className="flex min-w-0 flex-1 items-center gap-1 sm:gap-2">
                <button
                  type="button"
                  onClick={() => go(stage)}
                  disabled={pending}
                  aria-current={isCurrent ? 'step' : undefined}
                  className="flex min-w-0 flex-1 flex-col items-center gap-1.5 py-1 disabled:opacity-60"
                >
                  <span
                    className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold transition-colors ${
                      isDone
                        ? 'border-primary-dark bg-primary-dark text-white'
                        : isCurrent
                          ? 'border-primary-dark bg-surface text-primary-dark'
                          : 'border-border bg-surface text-text-muted'
                    }`}
                  >
                    {isDone ? <Check size={14} aria-hidden="true" /> : stage}
                  </span>
                  <span
                    className={`w-full truncate text-center text-[11px] leading-4 sm:text-xs ${
                      isCurrent ? 'font-semibold text-primary-dark' : 'text-text-muted'
                    }`}
                  >
                    {STAGE_DEFINITIONS[stage].name}
                  </span>
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

      {!data.canManage ? (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          إعداد النشاط متاح لمالك النشاط أو المسؤول. يمكنك مشاهدة الحالة، وسيُكمل المالك الخطوات.
        </p>
      ) : null}

      <div className="border-t border-border pt-6">
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
            canManage={data.canManage}
            onActivated={() => router.push('/dashboard')}
          />
        )}
      </div>
    </div>
  )
}
