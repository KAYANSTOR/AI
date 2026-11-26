import { describe, expect, test } from 'bun:test'
import { activationFingerprint, readActivationEvidence, ACTIVATION_EVIDENCE_TTL_MS } from '@/lib/onboarding/activation-evidence'
import {
  activationStateForStep,
  stateAfterActivationTest,
  stepAfterActivationTest,
} from '@/lib/onboarding/activation'

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

  test('a failed re-test never deactivates a live workspace', () => {
    expect(stateAfterActivationTest({ currentState: 'active', passed: false })).toBe('active')
    expect(stateAfterActivationTest({ currentState: 'active', passed: true })).toBe('active')
    expect(stateAfterActivationTest({ currentState: 'configuring', passed: false })).toBe('ready_for_test')
    expect(stateAfterActivationTest({ currentState: 'configuring', passed: true })).toBe('ready_to_activate')
    expect(stepAfterActivationTest({ currentState: 'active' })).toBe(11)
    expect(stepAfterActivationTest({ currentState: 'configuring' })).toBe(10)
  })
})


describe('activation reply evidence', () => {
  const input = { organizationId: 'org', businessId: 'biz', agentId: 'agent', provider: 'gemini', model: 'model', locale: 'ar', temperature: '0.2', system: 'prompt' }
  const fingerprint = activationFingerprint(input)
  const now = Date.parse('2026-11-26T04:00:00Z')
  const stored = { passed: true, status: 'passed', fingerprint, testedAt: new Date(now).toISOString(), testMessage: 'سلام', reply: { status: 'answered', reply: 'وعليكم السلام' } }
  test('reuses a fresh real reply only for the exact configuration', () => {
    expect(readActivationEvidence(stored, fingerprint, now + 1000)?.reply.reply).toBe('وعليكم السلام')
    for (const field of ['organizationId', 'businessId', 'agentId', 'provider', 'model', 'locale', 'temperature', 'system'] as const) {
      expect(readActivationEvidence(stored, activationFingerprint({ ...input, [field]: 'changed' }), now)).toBeNull()
    }
  })
  test('rejects expired, missing, failed and future proofs', () => {
    expect(readActivationEvidence(stored, fingerprint, now + ACTIVATION_EVIDENCE_TTL_MS + 1)).toBeNull()
    expect(readActivationEvidence(stored, fingerprint, now - 1)).toBeNull()
    expect(readActivationEvidence({ ...stored, fingerprint: undefined }, fingerprint, now)).toBeNull()
    expect(readActivationEvidence({ ...stored, passed: false }, fingerprint, now)).toBeNull()
    expect(readActivationEvidence({ ...stored, reply: { status: 'answered', reply: '' } }, fingerprint, now)).toBeNull()
  })
})
