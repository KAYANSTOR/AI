import { describe, expect, test } from 'bun:test'
import { evaluateFinalReadiness } from '@/lib/final-gate'

describe('final production gate', () => {
  test('all completed phases pass the final readiness check', () => {
    const result = evaluateFinalReadiness({
      onboarding: true,
      team: true,
      notifications: true,
      customer360: true,
      followup: true,
      segments: true,
      appointments: true,
      sales: true,
    })

    expect(result.passed).toBe(true)
    expect(result.phases.every((phase) => phase.passed)).toBe(true)
  })

  test('any failed phase blocks release', () => {
    const result = evaluateFinalReadiness({
      onboarding: true,
      team: true,
      notifications: true,
      customer360: true,
      followup: false,
      segments: true,
      appointments: true,
      sales: true,
    })

    expect(result.passed).toBe(false)
    expect(result.phases.find((phase) => phase.name === 'followup')?.passed).toBe(false)
  })
})
