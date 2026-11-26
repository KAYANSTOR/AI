import { describe, expect, test } from 'bun:test'
import { dashboardTour, parseTourProgress, restoreTourProgress, type TourAccess } from '@/lib/dashboard/tour'

const base: TourAccess = { businessTypeId: 'appointments', enabledCapabilities: ['appointments', 'inbox'], personalAssistantEnabled: false, role: 'owner', setupComplete: false }
describe('sector-aware dashboard guide', () => {
  test('commercial booking guide teaches only enabled features and admin setup', () => {
    const { steps } = dashboardTour(base)
    expect(steps.map(step => step.id)).toEqual(['setup', 'business_services', 'appointments', 'inbox', 'navigation', 'account'])
    expect(dashboardTour({ ...base, role: 'read_only' }).steps.some(step => step.id === 'setup')).toBe(false)
  })
  test('personal guide ignores inherited commercial grants and unavailable assistant tools', () => {
    const personal = { ...base, businessTypeId: 'personal_assistant' }
    expect(dashboardTour({ ...personal, personalAssistantEnabled: true }).steps.map(step => step.id)).toEqual(['personal_main', 'personal_tools', 'navigation', 'account'])
    expect(dashboardTour(personal).track).toBe('personal_unavailable')
    expect(dashboardTour(personal).steps.some(step => step.id === 'personal_tools')).toBe(false)
  })
  test('progress cannot reference removed or arbitrary steps; completed and paused state survive access changes', () => {
    const { steps } = dashboardTour({ ...base, setupComplete: true })
    expect(parseTourProgress({ stepId: 'setup', status: 'active' }, steps)).toBeNull()
    expect(parseTourProgress({ stepId: 'account', status: 'invalid' }, steps)).toBeNull()
    expect(restoreTourProgress({ stepId: 'setup', status: 'paused' }, steps)).toEqual({ stepId: 'business_services', status: 'paused' })
    expect(restoreTourProgress({ stepId: 'setup', status: 'completed' }, steps)).toEqual({ stepId: 'business_services', status: 'completed' })
  })
})
