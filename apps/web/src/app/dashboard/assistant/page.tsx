import { PersonalExecutiveApp, type AssistantTab } from '@/components/dashboard/personal-executive/assistant-app'
import { getDashboardContext } from '@/lib/dashboard/context'
import { trainingChecklist } from '@/lib/trainer/checklists'

export const dynamic = 'force-dynamic'

const TABS: AssistantTab[] = ['chat', 'tasks', 'memory', 'tools']

export default async function PersonalAssistantPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  const initialTab = TABS.includes(tab as AssistantTab) ? (tab as AssistantTab) : 'chat'
  const context = await getDashboardContext()
  // «مدرب كيان» feeds personal memory only for the personal-assistant sector (owner/admin).
  const showTrainer = Boolean(context && (context.role === 'owner' || context.role === 'admin') && trainingChecklist(context.businessTypeId).target === 'memory')
  return <PersonalExecutiveApp initialTab={initialTab} showTrainer={showTrainer} />
}
