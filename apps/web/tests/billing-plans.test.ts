import { describe, expect, test } from 'bun:test'
import { getPlanPrice, PLAN_CATALOG, PLAN_LIMITS_BY_CODE } from '@/lib/billing/plan-catalog'

describe('KAYAN plan catalogue', () => {
  test('uses the four published monthly price points', () => {
    expect(PLAN_CATALOG.map((plan) => plan.monthlyPrice)).toEqual([0, 9, 29, 59])
  })

  test('annual billing charges ten monthly payments', () => {
    for (const plan of PLAN_CATALOG) {
      expect(plan.annualPrice).toBe(plan.monthlyPrice * 10)
      expect(getPlanPrice(plan.code, 'yearly')).toBe(plan.annualPrice)
    }
  })

  test('plan limits are defined for each persisted subscription tier', () => {
    expect(Object.keys(PLAN_LIMITS_BY_CODE).sort()).toEqual(['growth', 'pro', 'starter', 'trial'])
    for (const plan of PLAN_CATALOG) {
      expect(PLAN_LIMITS_BY_CODE[plan.code]).toEqual(plan.limits)
    }
  })
})
