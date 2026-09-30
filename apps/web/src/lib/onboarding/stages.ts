/**
 * The four stages of the FastPath onboarding (docs/PLAN.md §8.3.2).
 *
 * The database still stores `activation_step` in its original 1..11 space, so the two
 * systems are kept apart here: a stage maps onto the step that represents it, and any
 * stored step — including the ones an older 11-step tenant still holds — maps back onto
 * the stage a person should see. No schema change is needed and the 0020 check constraint
 * keeps meaning what it meant.
 */
export type OnboardingStage = 1 | 2 | 3 | 4

export const ONBOARDING_STAGES: readonly OnboardingStage[] = [1, 2, 3, 4] as const

export type StageDefinition = {
  stage: OnboardingStage
  /** Short name shown in the stepper. */
  name: string
  title: string
  description: string
}

export const STAGE_DEFINITIONS: Record<OnboardingStage, StageDefinition> = {
  1: {
    stage: 1,
    name: 'ابدأ',
    title: 'مرحباً بك 👋',
    description: 'عرّفنا بنشاطك في سطرين، وسنجهّز كل شيء بعدها.',
  },
  2: {
    stage: 2,
    name: 'وصّل نشاطك',
    title: 'وصّل نشاطك',
    description: 'سنربط رقم نشاطك بالقنوات التي يتواصل معك العملاء من خلالها.',
  },
  3: {
    stage: 3,
    name: 'جهّز الوكيل',
    title: 'جهّز الوكيل',
    description: 'اكتب وصفاً بسيطاً لنشاطك، وسنجهّز الإعداد الأولي للوكيل من كلامك.',
  },
  4: {
    stage: 4,
    name: 'جرّب ثم شغّل',
    title: 'جرّب موظفك الجديد 🤖',
    description: 'تأكد أن كل شيء يعمل، ثم شغّل نشاطك ليبدأ استقبال العملاء.',
  },
}

/**
 * The activation_step written for a stage.
 *
 * Stage 4 is the test/activation stage, which the 0020 state machine represents as step
 * 10. Go-live is the only writer of step 11, exactly as before.
 */
export function stepForStage(stage: OnboardingStage): number {
  return stage === 4 ? 10 : stage
}

/** The stage a stored activation_step should open on, including legacy 1..11 steps. */
export function stageForStoredStep(step: number | null | undefined): OnboardingStage {
  const value = Number(step)
  if (!Number.isFinite(value) || value <= 1) return 1
  if (value === 2) return 2
  // Steps 3..9 were the old middle of the wizard: the customer continues at the agent
  // stage, where the saved setup is shown and the next action is one click away.
  if (value <= 9) return 3
  return 4
}

export function nextStage(stage: OnboardingStage): OnboardingStage {
  return Math.min(4, stage + 1) as OnboardingStage
}

export function previousStage(stage: OnboardingStage): OnboardingStage {
  return Math.max(1, stage - 1) as OnboardingStage
}

/** True when a value coming from the client names a real stage. */
export function isOnboardingStage(value: unknown): value is OnboardingStage {
  return value === 1 || value === 2 || value === 3 || value === 4
}
