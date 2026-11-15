import Link from 'next/link'
import { FileQuestion } from 'lucide-react'
import { MobileEmptyState } from '@/components/ui/empty-state'

export default function DashboardNotFound() {
  return (
    <div className="flex min-h-[60vh] items-center justify-center py-12">
      <MobileEmptyState
        title="الصفحة غير موجودة"
        description="الصفحة التي تبحث عنها قد تكون نُقلت أو حُذفت أو غير متوفرة حالياً."
        icon={<FileQuestion className="h-8 w-8" aria-hidden="true" />}
        action={
          <Link
            href="/dashboard"
            className="inline-flex h-11 items-center justify-center rounded-xl bg-primary px-6 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark active:scale-[0.99]"
          >
            العودة للرئيسية
          </Link>
        }
      />
    </div>
  )
}
