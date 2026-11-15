import Link from 'next/link'
import { Bot, MessageSquare, Settings2, Sparkles } from 'lucide-react'
import { loadAgentContext } from './load-agent-context'
import { MobileEmptyState } from '@/components/ui/empty-state'
import { KpiCard } from '@/components/ui/kpi-card'

export const dynamic = 'force-dynamic'

export default async function AgentHubPage() {
  const data = await loadAgentContext()

  if (data.kind === 'no_business') {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-bold text-text">الوكيل الذكي</h1>
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          لا يوجد نشاط مُهيّأ بعد.{' '}
          <Link href="/onboarding" className="font-semibold underline">
            أكمل الإعداد
          </Link>
        </p>
      </div>
    )
  }

  if (data.kind === 'error') {
    return (
      <div className="mx-auto max-w-lg space-y-4">
        <h1 className="text-2xl font-bold text-text">الوكيل الذكي</h1>
        <p className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-text">
          تعذّر تحميل بيانات الوكيل.
        </p>
      </div>
    )
  }

  const { readiness, businessName, conversationCount, consoleData } = data
  const statusLabel =
    consoleData.status === 'active' ? 'نشط' : consoleData.status === 'paused' ? 'متوقف' : 'مسودة'

  return (
    <div className="mx-auto max-w-lg space-y-5 pb-8">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold tracking-tight text-text">الوكيل الذكي</h1>
        <Link
          href="/dashboard/agent/settings"
          className="flex h-10 w-10 items-center justify-center rounded-full border border-border bg-surface text-text"
          aria-label="إعدادات الوكيل"
        >
          <Settings2 className="h-5 w-5" />
        </Link>
      </div>

      <section className="rounded-2xl border border-border bg-surface p-4 shadow-sm">
        <p className="text-xs font-semibold text-secondary">جاهزية الوكيل · {readiness.score}%</p>
        <h2 className="mt-1 text-lg font-bold text-text">{businessName}</h2>
        <p className="mt-1 text-sm text-text-muted">
          الحالة: {statusLabel} · النموذج: {consoleData.modelProvider}
        </p>
        <Link
          href="/dashboard/agent/settings"
          className="mt-4 inline-flex h-11 w-full items-center justify-center rounded-xl bg-primary text-sm font-bold text-primary-foreground"
        >
          إدارة إعدادات الوكيل
        </Link>
      </section>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-bold text-text">أداء اليوم</h3>
          <Link href="/dashboard/analytics" className="text-xs font-semibold text-secondary">
            التفاصيل
          </Link>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <KpiCard
            label="محادثات"
            value={String(conversationCount)}
            hint="إجمالي المحادثات"
            icon={<MessageSquare className="h-4 w-4" />}
            tone="default"
          />
          <KpiCard
            label="جاهزية المعرفة"
            value={`${readiness.score}%`}
            hint={readiness.score >= 70 ? 'جاهز للرد' : 'يحتاج تدريب'}
            icon={<Sparkles className="h-4 w-4" />}
            tone="gold"
          />
        </div>
      </div>

      <div className="space-y-2">
        <h3 className="text-base font-bold text-text">إجراءات الوكيل</h3>
        <Link
          href="/dashboard/agent/train"
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 transition hover:bg-background"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light/40 text-secondary">
            <Sparkles className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-text">تدريب الوكيل</p>
            <p className="text-xs text-text-muted">بناء المعرفة من محادثة تدريب</p>
          </div>
        </Link>
        <Link
          href="/dashboard/agent/test"
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 transition hover:bg-background"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light/40 text-secondary">
            <Bot className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-text">اختبار الوكيل</p>
            <p className="text-xs text-text-muted">محاكاة عميل على بياناتك الحقيقية</p>
          </div>
        </Link>
        <Link
          href="/dashboard/knowledge"
          className="flex items-center gap-3 rounded-2xl border border-border bg-surface px-4 py-3.5 transition hover:bg-background"
        >
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light/40 text-secondary">
            <MessageSquare className="h-5 w-5" />
          </div>
          <div className="min-w-0 flex-1">
            <p className="font-semibold text-text">قاعدة المعرفة</p>
            <p className="text-xs text-text-muted">عرض وتعديل البنود المحفوظة</p>
          </div>
        </Link>
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <h3 className="text-base font-bold text-text">أحدث النشاط</h3>
        </div>
        {conversationCount === 0 ? (
          <MobileEmptyState
            icon={<Bot className="h-8 w-8" aria-hidden="true" />}
            title="لا نشاط للوكيل بعد"
            description="اربط قناة وابدأ محادثات العملاء، أو درّب الوكيل أولاً."
            action={
              <Link
                href="/dashboard/agent/train"
                className="mt-2 inline-flex h-11 items-center justify-center rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground"
              >
                ابدأ التدريب
              </Link>
            }
          />
        ) : (
          <div className="rounded-2xl border border-border bg-surface px-4 py-3 text-sm text-text-muted">
            يوجد {conversationCount} محادثة مسجّلة. راجع الصندوق لمتابعة أحدث التفاعلات.
            <div className="mt-2">
              <Link href="/dashboard/conversations" className="font-semibold text-secondary">
                فتح الصندوق
              </Link>
            </div>
          </div>
        )}
      </div>
    </div>
  )
}
