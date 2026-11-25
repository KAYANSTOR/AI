import Link from 'next/link'
import { redirect } from 'next/navigation'
import { getDashboardContext } from '@/lib/dashboard/context'
import { PersonalAssistantTasksPanel } from '@/components/dashboard/personal-assistant-tasks-panel'

export const dynamic = 'force-dynamic'

export default async function PersonalAssistantTasksPage() {
  if (!(await getDashboardContext())?.personalAssistantEnabled) redirect('/dashboard/assistant?tab=tasks')
  return <div className="space-y-4">
    <Link href="/dashboard/settings" className="text-sm font-semibold text-secondary">← العودة إلى الإعدادات</Link>
    <header>
      <h1 className="text-lg font-extrabold text-text">المهام والمساعد الشخصي</h1>
      <p className="mt-1 text-sm leading-6 text-text-muted">مهامك وتذكيراتك وملخصك اليومي، معزولة عن وكلاء النشاط التجاري.</p>
    </header>
    <PersonalAssistantTasksPanel />
  </div>
}
