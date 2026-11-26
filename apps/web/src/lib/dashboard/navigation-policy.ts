import { getVertical } from '@/lib/verticals/registry'

export type NavigationAccess = {
  businessTypeId: string | null
  enabledCapabilities: readonly string[]
  personalAssistantEnabled: boolean
  role: string
}

export function isPersonalWorkspace(access: Pick<NavigationAccess, 'businessTypeId'>): boolean {
  return access.businessTypeId === 'personal_assistant'
}

/** Personal onboarding retains legacy business capabilities in storage; they do not grant CRM UI access. */
export function hasBusinessNavigationCapability(access: Pick<NavigationAccess, 'businessTypeId' | 'enabledCapabilities'>, capability: string): boolean {
  return !isPersonalWorkspace(access) && access.enabledCapabilities.includes(capability)
}

export function canSearchBusiness(access: Pick<NavigationAccess, 'businessTypeId' | 'enabledCapabilities'>): boolean {
  return hasBusinessNavigationCapability(access, 'lead_capture') || hasBusinessNavigationCapability(access, 'inbox')
}

export type TabId = 'home' | 'contacts' | 'appointments' | 'orders' | 'inbox' | 'analytics' | 'assistant' | 'tasks' | 'billing'
export type QuickActionId = 'contacts' | 'appointments' | 'quotes' | 'orders' | 'campaigns' | 'agent' | 'assistant' | 'memory' | 'summary' | 'tools'

export function dashboardNavigation(access: NavigationAccess): { tabs: TabId[]; actions: QuickActionId[] } {
  if (isPersonalWorkspace(access)) {
    return access.personalAssistantEnabled
      ? { tabs: ['home', 'assistant', 'tasks', 'billing'], actions: ['memory', 'summary', 'tools'] }
      : { tabs: ['home', 'billing'], actions: [] }
  }
  const allowed = (capability: string) => hasBusinessNavigationCapability(access, capability)
  const admin = access.role === 'owner' || access.role === 'admin'
  const editable = access.role !== 'read_only'
  const engine = getVertical(access.businessTypeId).baseEngine
  const primary: TabId[] = engine === 'commerce_engine' ? ['orders', 'appointments'] : ['appointments', 'orders']
  const tabs: TabId[] = ['home']
  for (const id of primary) if (allowed(id)) tabs.push(id)
  if (allowed('inbox')) tabs.push('inbox')
  if (allowed('lead_capture')) tabs.push('contacts')
  tabs.push('analytics', 'billing')
  const actions: QuickActionId[] = []
  if (editable && allowed('appointments')) actions.push('appointments')
  if (editable && allowed('orders')) actions.push('orders')
  if (editable && allowed('quotes')) actions.push('quotes')
  if (admin && allowed('lead_capture')) actions.push('contacts')
  if (admin && allowed('campaigns')) actions.push('campaigns')
  if (admin) actions.push('agent')
  if (access.personalAssistantEnabled) actions.push('assistant')
  return { tabs: tabs.slice(0, 4), actions }
}
