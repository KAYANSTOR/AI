import Link from 'next/link'
import { Bot, RadioTower, CheckCircle2, ArrowLeft, Sliders } from 'lucide-react'
import { createClient } from '@/lib/db/server'
import { capabilityLabel } from '@/lib/i18n/labels'

export async function DashboardAgentHealthSection({
  organizationId,
  enabledCapabilities,
}: {
  organizationId: string
  enabledCapabilities: string[]
}) {
  const db = await createClient()

  const [channelResult] = await Promise.all([
    db
      .from('channels')
      .select('id, channel_type, is_active, verification_status')
      .eq('organization_id', organizationId),
  ])

  const channels = channelResult.data ?? []
  
  const channelMap = {
    whatsapp: channels.find((c) => c.channel_type === 'whatsapp'),
    phone: channels.find((c) => c.channel_type === 'phone'),
  }
  const agentReady = enabledCapabilities.length > 0 && channels.some((c) => c.is_active)

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
      {/* Agent Status & Brain */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-border/70 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-light/40 text-primary-dark">
              <Bot size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text">جاهزية الوكيل</h2>
              <p className="text-xs text-text-muted">الوحدات المفعّلة وإعدادات الرد</p>
            </div>
          </div>
          <span
            className={`flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-semibold ${
              agentReady ? 'bg-success/10 text-success' : 'bg-warning/10 text-warning'
            }`}
          >
            <CheckCircle2 size={13} aria-hidden="true" />
            <span>{agentReady ? 'جاهز للرد' : 'يحتاج إعدادًا'}</span>
          </span>
        </div>

        <div className="mt-4 space-y-3.5">
          <div>
            <span className="block text-xs font-semibold text-text mb-2">الوحدات والمهام المفعّلة:</span>
            <div className="flex flex-wrap gap-2">
              {enabledCapabilities.length > 0 ? (
                enabledCapabilities.map((id) => (
                  <span
                    key={id}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-surface px-2.5 py-1 text-xs font-medium text-text"
                  >
                    <CheckCircle2 size={12} className="text-primary-dark shrink-0" />
                    <span>{capabilityLabel(id)}</span>
                  </span>
                ))
              ) : (
                <span className="text-xs text-text-muted">لم يتم تفعيل وحدات بعد.</span>
              )}
            </div>
          </div>

          <div className="border-t border-border/60 pt-3 flex items-center justify-between">
            <Link
              href="/dashboard/agent"
              className="inline-flex items-center gap-1 text-xs font-bold text-primary-dark hover:underline"
            >
              <Sliders size={13} />
              <span>ضبط نبرة وصوت الوكيل وسيناريوهات الرد</span>
            </Link>
            <Link
              href="/dashboard/knowledge"
              className="text-xs font-medium text-text-muted hover:text-text hover:underline"
            >
              تحديث قاعدة المعرفة
            </Link>
          </div>
        </div>
      </section>

      {/* Connected Communication Channels */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-[var(--shadow-card)]">
        <div className="flex items-center justify-between border-b border-border/70 pb-4">
          <div className="flex items-center gap-2.5">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-light/40 text-primary-dark">
              <RadioTower size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-text">قنوات الاستقبال والاتصال</h2>
              <p className="text-xs text-text-muted">حالة الربط المباشر مع العملاء</p>
            </div>
          </div>
          <Link
            href="/dashboard/channels"
            className="text-xs font-bold text-primary-dark hover:underline flex items-center gap-1"
          >
            <span>إدارة القنوات</span>
            <ArrowLeft size={13} />
          </Link>
        </div>

        <div className="mt-4 space-y-3">
          {/* WhatsApp */}
          <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-success/15 text-success font-bold text-xs">
                WA
              </div>
              <div>
                <span className="block text-xs font-bold text-text">واتساب للأعمال</span>
                <span className="text-[11px] text-text-muted">الاستقبال والرد الفوري الآلي على الرسائل</span>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                channelMap.whatsapp?.is_active
                  ? 'bg-success/15 text-success'
                  : 'bg-background text-text-muted'
              }`}
            >
              {channelMap.whatsapp?.is_active ? 'متصل' : 'جاهز للربط'}
            </span>
          </div>

          {/* Voice Phone */}
          <div className="flex items-center justify-between rounded-xl border border-border/70 p-3">
            <div className="flex items-center gap-3">
              <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/15 text-primary font-bold text-xs">
                TEL
              </div>
              <div>
                <span className="block text-xs font-bold text-text">المكالمات الهاتفية</span>
                <span className="text-[11px] text-text-muted">الرد على المكالمات بصوت طبيعي وحجز المواعيد</span>
              </div>
            </div>
            <span
              className={`rounded-full px-2.5 py-0.5 text-[10px] font-bold ${
                channelMap.phone?.is_active
                  ? 'bg-success/15 text-success'
                  : 'bg-background text-text-muted'
              }`}
            >
              {channelMap.phone?.is_active ? 'متصل' : 'جاهز للربط'}
            </span>
          </div>

        </div>

        <div className="mt-4 border-t border-border/60 pt-3 text-center">
          <Link
            href="/dashboard/channels"
            className="text-xs font-bold text-primary-dark hover:underline inline-flex items-center gap-1"
          >
            <span>ربط وتفعيل قنوات إضافية</span>
            <span aria-hidden="true" className="rtl:rotate-180">→</span>
          </Link>
        </div>
      </section>
    </div>
  )
}

export function DashboardAgentHealthSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-2 animate-pulse">
      <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <div className="flex justify-between items-center border-b border-border/50 pb-3">
          <div className="h-5 w-40 rounded bg-border" />
          <div className="h-4 w-16 rounded bg-border/50" />
        </div>
        <div className="h-16 rounded-xl bg-background/60" />
        <div className="h-12 rounded-xl bg-background/40" />
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <div className="flex justify-between items-center border-b border-border/50 pb-3">
          <div className="h-5 w-36 rounded bg-border" />
          <div className="h-4 w-20 rounded bg-border/50" />
        </div>
        <div className="space-y-2.5">
          <div className="h-12 rounded-xl bg-background/50" />
          <div className="h-12 rounded-xl bg-background/50" />
        </div>
      </div>
    </div>
  )
}
