import Link from 'next/link'
import { PersonalAssistantMemoryPanel } from '@/components/dashboard/personal-assistant-memory-panel'

export const dynamic = 'force-dynamic'

export default function PersonalAssistantMemoriesPage() {
  return (
    <div className="space-y-4">
      <Link href="/dashboard/settings" className="text-sm font-semibold text-secondary">
        ← العودة إلى الإعدادات
      </Link>
      <header>
        <h2 className="text-lg font-extrabold text-text">الذاكرة الشخصية</h2>
        <p className="mt-1 text-sm leading-6 text-text-muted">
          تحكّم بالمعلومات التي تحفظها لنفسك بصورة مستقلة عن ذاكرة وكيل خدمة العملاء.
        </p>
      </header>
      <PersonalAssistantMemoryPanel />
    </div>
  )
}
