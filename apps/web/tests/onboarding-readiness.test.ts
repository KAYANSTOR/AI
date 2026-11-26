import { describe, expect, test } from 'bun:test'
import { activationFingerprint, configuredActivationFingerprint, readActivationEvidence } from '@/lib/onboarding/activation-evidence'
import { nextReadinessStage } from '@/lib/onboarding/stages'

describe('onboarding readiness', () => {
  test('points to earliest incomplete prerequisite', () => {
    expect(nextReadinessStage({ basics: true, connect: false, agent: true, test: true })).toBe(2)
    expect(nextReadinessStage({ basics: false, connect: true, agent: true, test: true })).toBe(1)
    expect(nextReadinessStage({ basics: true, connect: true, agent: false, test: false })).toBe(3)
    expect(nextReadinessStage({ basics: true, connect: true, agent: true, test: false })).toBe(4)
    expect(nextReadinessStage({ basics: true, connect: true, agent: true, test: true })).toBe(4)
  })
  test('shared fingerprint preserves contract and rejects changed prompt or expired evidence', () => {
    const agent = { id: 'agent', model_provider: 'gemini', locale: 'ar', temperature: 0.4, name: 'desk' }
    const fingerprint = configuredActivationFingerprint('org', 'biz', agent, 'original prompt')
    expect(fingerprint).toBe(activationFingerprint({
      organizationId: 'org', businessId: 'biz', agentId: 'agent', provider: 'gemini',
      model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite-preview',
      locale: 'ar', temperature: '0.4', system: 'original prompt', name: 'desk',
    }))
    const proof = { passed: true, status: 'passed', fingerprint, testedAt: '2026-01-01T00:00:00.000Z',
      testMessage: 'hello', reply: { status: 'answered', reply: 'hello' } }
    const now = Date.parse('2026-01-01T00:01:00.000Z')
    expect(readActivationEvidence(proof, fingerprint, now)?.reply.status).toBe('answered')
    expect(readActivationEvidence(proof, configuredActivationFingerprint('org', 'biz', agent, 'changed prompt'), now)).toBeNull()
    expect(readActivationEvidence(proof, fingerprint, now + 600_000)).toBeNull()
  })
})
