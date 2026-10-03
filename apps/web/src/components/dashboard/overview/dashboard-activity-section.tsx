import Link from 'next/link'
import { Calendar, MessageSquare, Phone, Globe, ArrowLeft, User } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { formatDateTime } from '@/lib/i18n/format'

export async function DashboardActivitySection({
  organizationId,
  timezone,
}: {
  organizationId: string
  timezone: string
}) {
  const supabase = await createClient()

  const [conversationsResult, appointmentsResult] = await Promise.all([
    supabase
      .from('conversations')
      .select('id, status, channel_type, updated_at, contacts(full_name, phone)')
      .eq('organization_id', organizationId)
      .order('updated_at', { ascending: false })
      .limit(5),
    supabase
      .from('appointments')
      .select('id, starts_at, status, contacts(full_name, phone), services(name)')
      .eq('organization_id', organizationId)
      .gte('starts_at', new Date().toISOString())
      .order('starts_at', { ascending: true })
      .limit(5),
  ])

  const conversations = conversationsResult.data ?? []
  const appointments = appointmentsResult.data ?? []

  function getChannelIcon(channelType: string | null) {
    if (channelType === 'phone') return <Phone size={14} className="text-primary-dark" />
    if (channelType === 'whatsapp') return <MessageSquare size={14} className="text-success" />
    return <Globe size={14} className="text-info" />
  }

  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
      {/* Recent Live Conversations */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-2xs lg:col-span-2 flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-border/70 pb-4">
            <div>
              <h2 className="text-base font-bold text-text">أحدث تفاعلات واستفسارات العملاء</h2>
              <p className="mt-0.5 text-xs text-text-muted">محادثات فورية تم استقبالها ومعالجتها آلياً</p>
            </div>
            <Link
              href="/dashboard/conversations"
              className="inline-flex items-center gap-1 text-xs font-bold text-primary-dark hover:underline"
            >
              <span>فتح صندوق المحادثات</span>
              <span aria-hidden="true" className="rtl:rotate-180">→</span>
            </Link>
          </div>

          <div className="mt-4 divide-y divide-border/60">
            {conversations.length === 0 ? (
              <div className="py-12 text-center">
                <MessageSquare size={36} className="mx-auto text-text-muted/40" />
                <p className="mt-3 text-sm font-semibold text-text">لا توجد محادثات نشطة بعد</p>
                <p className="mt-1 text-xs text-text-muted max-w-sm mx-auto">
                  بمجرد تواصل أي عميل عبر واتساب أو الهاتف أو الويب شات، ستظهر تفاصيل المحادثة هنا مباشرة.
                </p>
                <Link
                  href="/dashboard/agent"
                  className="mt-4 inline-flex items-center gap-1.5 rounded-xl bg-primary/10 px-3.5 py-2 text-xs font-bold text-primary-dark hover:bg-primary/20 transition-colors"
                >
                  <span>اختبار الوكيل الآن</span>
                  <ArrowLeft size={13} />
                </Link>
              </div>
            ) : (
              conversations.map((conv) => {
                const contact = conv.contacts as unknown as { full_name: string | null; phone: string | null } | null
                const name = contact?.full_name || 'عميل غير مسجل'
                const phone = contact?.phone

                return (
                  <Link
                    key={conv.id}
                    href={`/dashboard/conversations/${conv.id}`}
                    className="group -mx-2 flex items-center justify-between rounded-xl p-3 transition-colors hover:bg-background/80"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light/40 font-bold text-primary-dark">
                        {name[0] ?? <User size={16} />}
                      </div>
                      <div className="min-w-0">
                        <div className="flex items-center gap-2">
                          <span className="truncate text-sm font-semibold text-text group-hover:text-primary-dark">
                            {name}
                          </span>
                          <span className="flex items-center gap-1 rounded-md bg-background px-1.5 py-0.5 text-[10px] font-medium text-text-muted">
                            {getChannelIcon(conv.channel_type)}
                            <span>{conv.channel_type === 'whatsapp' ? 'واتساب' : conv.channel_type === 'phone' ? 'هاتف' : 'ويب'}</span>
                          </span>
                        </div>
                        {phone && (
                          <p dir="ltr" className="text-xs text-text-muted text-start font-mono mt-0.5">
                            {phone}
                          </p>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center gap-3 shrink-0">
                      <span className="text-[11px] text-text-muted">
                        {formatDateTime(conv.updated_at, timezone)}
                      </span>
                      <span
                        className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${
                          conv.status === 'open'
                            ? 'bg-success/15 text-success'
                            : conv.status === 'pending'
                              ? 'bg-warning/15 text-warning'
                              : 'bg-background text-text-muted'
                        }`}
                      >
                        {conv.status === 'open' ? 'نشط' : conv.status === 'pending' ? 'قيد المتابعة' : 'مكتمل'}
                      </span>
                    </div>
                  </Link>
                )
              })
            )}
          </div>
        </div>

        <div className="mt-4 border-t border-border/60 pt-3 flex items-center justify-between text-xs text-text-muted">
          <span>تزامن لحظي عبر السحابة مع قاعدة البيانات</span>
          <Link href="/dashboard/channels" className="text-primary-dark font-medium hover:underline">
            إعداد قنوات أخرى
          </Link>
        </div>
      </section>

      {/* Upcoming Appointments Schedule */}
      <section className="rounded-2xl border border-border bg-surface p-5 shadow-2xs flex flex-col justify-between">
        <div>
          <div className="flex items-center justify-between border-b border-border/70 pb-4">
            <div>
              <h2 className="text-base font-bold text-text">المواعيد القادمة</h2>
              <p className="mt-0.5 text-xs text-text-muted">الحجوزات المجدولة قريباً</p>
            </div>
            <Link
              href="/dashboard/appointments"
              className="text-xs font-bold text-primary-dark hover:underline"
            >
              عرض الكل
            </Link>
          </div>

          <div className="mt-4 space-y-2.5">
            {appointments.length === 0 ? (
              <div className="py-10 text-center">
                <Calendar size={32} className="mx-auto text-text-muted/40" />
                <p className="mt-2 text-sm font-semibold text-text">لا توجد مواعيد قادمة</p>
                <p className="mt-1 text-xs text-text-muted">
                  يستطيع الوكيل حجز وتأكيد المواعيد تلقائياً خلال محادثة العميل.
                </p>
                <Link
                  href="/dashboard/appointments"
                  className="mt-3 inline-flex items-center gap-1 rounded-xl border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:border-primary-dark hover:text-primary-dark transition-colors"
                >
                  <span>إضافة موعد يدوياً</span>
                </Link>
              </div>
            ) : (
              appointments.map((apt) => {
                const contact = apt.contacts as unknown as { full_name: string | null } | null
                const service = apt.services as unknown as { name: string } | null

                return (
                  <div
                    key={apt.id}
                    className="flex items-center justify-between rounded-xl border border-border/70 bg-background/50 p-3 transition-colors hover:border-primary/40 hover:bg-surface"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-xs font-bold text-text">
                        {contact?.full_name || 'عميل'}
                      </p>
                      <p className="text-[11px] text-text-muted mt-0.5">
                        {service?.name || 'خدمة'}
                      </p>
                    </div>

                    <div className="text-end shrink-0">
                      <span className="block text-xs font-semibold text-primary-dark">
                        {formatDateTime(apt.starts_at, timezone)}
                      </span>
                      <span className="mt-0.5 inline-block text-[10px] text-success font-medium">
                        مؤكد
                      </span>
                    </div>
                  </div>
                )
              })
            )}
          </div>
        </div>

        <Link
          href="/dashboard/appointments"
          className="mt-4 block rounded-xl bg-background py-2 text-center text-xs font-semibold text-text transition-colors hover:bg-primary-light/30 hover:text-primary-dark"
        >
          فتح التقويم الكامل
        </Link>
      </section>
    </div>
  )
}

export function DashboardActivitySkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 animate-pulse">
      <div className="rounded-2xl border border-border bg-surface p-5 lg:col-span-2 space-y-4">
        <div className="flex justify-between items-center border-b border-border/50 pb-3">
          <div className="h-5 w-44 rounded bg-border" />
          <div className="h-4 w-28 rounded bg-border/50" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="flex justify-between items-center p-3 rounded-xl bg-background/50">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-border" />
                <div className="space-y-1.5">
                  <div className="h-4 w-32 rounded bg-border" />
                  <div className="h-3 w-20 rounded bg-border/50" />
                </div>
              </div>
              <div className="h-4 w-16 rounded bg-border/40" />
            </div>
          ))}
        </div>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <div className="flex justify-between items-center border-b border-border/50 pb-3">
          <div className="h-5 w-32 rounded bg-border" />
          <div className="h-4 w-16 rounded bg-border/50" />
        </div>
        <div className="space-y-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="h-16 rounded-xl bg-background/60" />
          ))}
        </div>
      </div>
    </div>
  )
}
