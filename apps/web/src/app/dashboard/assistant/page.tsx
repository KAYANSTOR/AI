import { PersonalExecutiveApp, type AssistantTab } from '@/components/dashboard/personal-executive/assistant-app'

export const dynamic = 'force-dynamic'

const TABS: AssistantTab[] = ['chat', 'tasks', 'memory']

export default async function PersonalAssistantPage({ searchParams }: { searchParams: Promise<{ tab?: string }> }) {
  const { tab } = await searchParams
  const initialTab = TABS.includes(tab as AssistantTab) ? (tab as AssistantTab) : 'chat'
  return <PersonalExecutiveApp initialTab={initialTab} />
}
