import { redirect } from 'next/navigation'

export default function PersonalAssistantMemoriesPage() {
  redirect('/dashboard/assistant?tab=memory')
}
