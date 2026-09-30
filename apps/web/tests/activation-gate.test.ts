import { describe, expect, test } from 'bun:test'
import { activationStateForStep } from '@/lib/onboarding/activation'

describe('activation state derivation', () => {
  test('no wizard step can ever reach the active state', () => {
    // Only activateGoLive() may activate a tenant. If this ever regresses, a client can
    // write "active" into business_profiles and skip the readiness re-check.
    for (let step = 1; step <= 11; step += 1) {
      for (const smokeStatus of ['none', 'pending', 'passed', 'failed', null, undefined]) {
        const state = activationStateForStep({
          step,
          storedState: 'workspace_ready',
          smokeStatus,
        })
        expect(state).not.toBe('active')
      }
    }
  })

  test('the active state survives a step change', () => {
    for (let step = 1; step <= 11; step += 1) {
      expect(activationStateForStep({ step, storedState: 'active', smokeStatus: 'passed' })).toBe(
        'active'
      )
    }
  })

  test('steps before the test stage are merely configuring', () => {
    for (let step = 1; step <= 9; step += 1) {
      expect(
        activationStateForStep({ step, storedState: 'workspace_ready', smokeStatus: 'passed' })
      ).toBe('configuring')
    }
  })

  test('the test and activation stages follow the stored smoke-test result', () => {
    expect(activationStateForStep({ step: 10, storedState: 'configuring', smokeStatus: 'passed' })).toBe(
      'ready_to_activate'
    )
    expect(activationStateForStep({ step: 10, storedState: 'configuring', smokeStatus: 'failed' })).toBe(
      'ready_for_test'
    )
    expect(activationStateForStep({ step: 11, storedState: 'configuring', smokeStatus: 'none' })).toBe(
      'ready_for_test'
    )
    expect(activationStateForStep({ step: 11, storedState: 'configuring', smokeStatus: 'passed' })).toBe(
      'ready_to_activate'
    )
  })
})
