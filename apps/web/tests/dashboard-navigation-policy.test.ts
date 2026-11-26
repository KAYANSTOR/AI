import { describe, expect, test } from 'bun:test'
import { dashboardNavigation, canSearchBusiness, hasBusinessNavigationCapability, type NavigationAccess } from '@/lib/dashboard/navigation-policy'

const access = (overrides: Partial<NavigationAccess> = {}): NavigationAccess => ({
  businessTypeId: 'clinic', enabledCapabilities: ['appointments', 'lead_capture', 'inbox'], personalAssistantEnabled: false, role: 'owner', ...overrides,
})

describe('dashboard navigation policy', () => {
  test('personal sector never inherits business actions or business search from legacy capabilities', () => {
    const personal = access({ businessTypeId: 'personal_assistant', enabledCapabilities: ['appointments', 'orders', 'quotes', 'lead_capture', 'inbox', 'campaigns'], personalAssistantEnabled: true })
    expect(dashboardNavigation(personal)).toEqual({ tabs: ['home', 'assistant', 'tasks', 'billing'], actions: ['memory', 'summary', 'tools'] })
    expect(canSearchBusiness(personal)).toBe(false)
    expect(hasBusinessNavigationCapability(personal, 'lead_capture')).toBe(false)
  })
  test('disabled personal access does not expose assistant actions', () => {
    expect(dashboardNavigation(access({ businessTypeId: 'personal_assistant' }))).toEqual({ tabs: ['home', 'billing'], actions: [] })
  })
  test('booking shows only enabled business modules', () => {
    expect(dashboardNavigation(access())).toEqual({ tabs: ['home', 'appointments', 'inbox', 'contacts'], actions: ['appointments', 'contacts', 'agent'] })
  })
  test('commerce exposes orders and not disabled appointments', () => {
    const nav = dashboardNavigation(access({ businessTypeId: 'ecommerce_store', enabledCapabilities: ['orders', 'quotes', 'lead_capture'] }))
    expect(nav.tabs).toContain('orders')
    expect(nav.tabs).not.toContain('appointments')
    expect(nav.actions).toContain('quotes')
    expect(nav.actions).not.toContain('appointments')
  })
  test('read only cannot see create or configuration shortcuts', () => {
    expect(dashboardNavigation(access({ role: 'read_only', enabledCapabilities: ['appointments', 'orders', 'quotes', 'lead_capture', 'inbox', 'campaigns'] })).actions).toEqual([])
  })
  test('business add-on remains separate from sector and disabled modules stay absent', () => {
    const business = access({ enabledCapabilities: [], personalAssistantEnabled: true, role: 'agent' })
    expect(dashboardNavigation(business)).toEqual({ tabs: ['home', 'analytics', 'billing'], actions: ['assistant'] })
    expect(canSearchBusiness(business)).toBe(false)
  })
})
