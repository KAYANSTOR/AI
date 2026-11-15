export type PhaseStatus = {
  name: string
  passed: boolean
  checks: string[]
}

export function evaluateFinalReadiness(input: {
  onboarding: boolean
  team: boolean
  notifications: boolean
  customer360: boolean
  followup: boolean
  segments: boolean
  appointments: boolean
  sales: boolean
}): { passed: boolean; phases: PhaseStatus[] } {
  const phases: PhaseStatus[] = [
    { name: 'onboarding', passed: input.onboarding, checks: ['smoke test passed', 'activation gate valid'] },
    { name: 'team', passed: input.team, checks: ['roles enforced', 'owner protections active'] },
    { name: 'notifications', passed: input.notifications, checks: ['in-app messages created', 'read state tracked'] },
    { name: 'customer360', passed: input.customer360, checks: ['timeline aggregated', 'summary counted'] },
    { name: 'followup', passed: input.followup, checks: ['sequence status tracked', 'next step resolved'] },
    { name: 'segments', passed: input.segments, checks: ['rules evaluated', 'tenant scoped'] },
    { name: 'appointments', passed: input.appointments, checks: ['slot conflicts blocked'] },
    { name: 'sales', passed: input.sales, checks: ['quote totals validated', 'order conversion checked'] },
  ]

  const passed = phases.every((phase) => phase.passed)
  return { passed, phases }
}
