import { describe, expect, test } from 'bun:test'
import {
  isOnboardingStage,
  nextStage,
  previousStage,
  stageForStoredStep,
  stepForStage,
} from '@/lib/onboarding/stages'
import { activationStateForStep } from '@/lib/onboarding/activation'

describe('FastPath stages', () => {
  test('the four visible stages are 1..4 and nothing else is accepted', () => {
    expect([1, 2, 3, 4].map((stage) => isOnboardingStage(stage))).toEqual([true, true, true, true])
    for (const value of [0, 5, 11, '2', null, undefined, NaN]) {
      expect(isOnboardingStage(value)).toBe(false)
    }
  })

  test('stage 4 writes the test step, so the existing activation gate still applies', () => {
    // If stage 4 mapped to step 4, activationStateForStep would return "configuring" and the
    // test stage could never become ready to activate.
    expect(stepForStage(4)).toBe(10)
    expect(activationStateForStep({ step: stepForStage(4), storedState: 'configuring', smokeStatus: 'passed' })).toBe(
      'ready_to_activate'
    )
    expect(activationStateForStep({ step: stepForStage(4), storedState: 'configuring', smokeStatus: 'none' })).toBe(
      'ready_for_test'
    )
  })

  test('all four stages stay configurable and never reach active by themselves', () => {
    for (const stage of [1, 2, 3, 4] as const) {
      const state = activationStateForStep({
        step: stepForStage(stage),
        storedState: 'workspace_ready',
        smokeStatus: 'none',
      })
      expect(state).not.toBe('active')
    }
  })

  test('legacy 11-step positions open on the right visible stage', () => {
    expect(stageForStoredStep(1)).toBe(1)
    expect(stageForStoredStep(2)).toBe(2)
    // Steps 3..9 were the old middle of the wizard: continue at the agent stage.
    for (const step of [3, 4, 5, 6, 7, 8, 9]) expect(stageForStoredStep(step)).toBe(3)
    // Steps 10 and 11 are the test/activation stages.
    expect(stageForStoredStep(10)).toBe(4)
    expect(stageForStoredStep(11)).toBe(4)
    // A missing or broken value must not open a later stage.
    expect(stageForStoredStep(null)).toBe(1)
    expect(stageForStoredStep(undefined)).toBe(1)
    expect(stageForStoredStep(0)).toBe(1)
    expect(stageForStoredStep(NaN)).toBe(1)
  })

  test('stage navigation is bounded', () => {
    expect(nextStage(1)).toBe(2)
    expect(nextStage(4)).toBe(4)
    expect(previousStage(4)).toBe(3)
    expect(previousStage(1)).toBe(1)
  })
})
