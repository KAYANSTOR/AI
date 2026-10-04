import Link from 'next/link'
import { redirect } from 'next/navigation'
import { BarChart3, Download, FileSpreadsheet, MessageSquare, UserRound, Calendar, Users } from 'lucide-react'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { ar } from '@/lib/i18n/ar'

export const dynamic = 'force-dynamic'

export default async function ReportsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const supabase = await createClient()
  const organizationId = context.organizationId

  const [
    conversations,
    openConversations,
    leads,
    newLeads,
    upcomingAppointments,
    contacts,
  ] = await Promise.all([
    supabase.from('conversations').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
    supabase
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'active'),
    supabase.from('leads').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
    supabase
      .from('leads')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .eq('status', 'new'),
    supabase
      .from('appointments')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', organizationId)
      .gte('starts_at', new Date().toISOString()),
    supabase.from('contacts').select('id', { count: 'exact', head: true }).eq('organization_id', organizationId),
  ])

  const reports = [
    {
      id: 'conversations',
      title: 'تقرير المحادثات',
      description: 'إجمالي محادثات العملاء وحالتها الحالية عبر كل القنوات.',
      metric: conversations.count ?? 0,
      metricLabel: 'إجمالي المحادثات',
      secondary: `${openConversations.count ?? 0} محادثة نشطة`,
      href: '/dashboard/conversations',
      actionLabel: 'فتح صندوق المحادثات',
      exportHref: null,
      Icon: MessageSquare,
    },
    {
      id: 'leads',
      title: 'تقرير العملاء المحتملين',
      description: 'الفرص المسجّلة من الوكيل ومتابعتها حتى الإغلاق.',
      metric: leads.count ?? 0,
      metricLabel: 'إجمالي الفرص',
      secondary: `${newLeads.count ?? 0} فرصة جديدة`,
      href: '/dashboard/leads',
      actionLabel: 'فتح العملاء المحتملين',
      exportHref: '/api/export/leads',
      Icon: UserRound,
    },
    {
      id: 'appointments',
      title: 'تقرير المواعيد',
      description: 'الحجوزات القادمة المجدولة عبر الوكيل أو يدويًا.',
      metric: upcomingAppointments.count ?? 0,
      metricLabel: 'مواعيد قادمة',
      secondary: null,
      href: '/dashboard/appointments',
      actionLabel: 'فتح التقويم',
      exportHref: null,
      Icon: Calendar,
    },
    {
      id: 'contacts',
      title: 'تقرير جهات الاتصال',
      description: 'السجل الموحّد لكل عميل تواصل معك من أي قناة.',
      metric: contacts.count ?? 0,
      metricLabel: 'إجمالي جهات الاتصال',
      secondary: null,
      href: '/dashboard/contacts',
      actionLabel: 'فتح جهات الاتصال',
      exportHref: '/api/export/contacts',
      Icon: Users,
    },
  ]

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light/40">
          <BarChart3 size={22} className="text-primary-dark" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">{ar.nav.reports}</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            ملخصات حيّة مبنية على بيانات شركتك، مع تصدير مباشر بصيغة CSV.
          </p>
        </div>
      </header>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        {reports.map((report) => (
          <section
            key={report.id}
            className="flex flex-col justify-between rounded-2xl border border-border bg-surface p-5 shadow-2xs transition-colors hover:border-primary/40"
          >
            <div>
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary-light/30 text-primary-dark">
                    <report.Icon size={18} aria-hidden="true" />
                  </span>
                  <h2 className="text-sm font-bold text-text">{report.title}</h2>
                </div>
                <span className="flex h-10 w-10 items-center justify-center rounded-xl border border-border bg-background text-text-muted">
                  <FileSpreadsheet size={16} aria-hidden="true" />
                </span>
              </div>

              <p className="mt-3 text-xs leading-relaxed text-text-muted">{report.description}</p>

              <div className="mt-4 flex items-baseline gap-2">
                <span className="text-3xl font-bold tracking-tight text-text">{report.metric}</span>
                <span className="text-xs text-text-muted">{report.metricLabel}</span>
              </div>
              {report.secondary && (
                <p className="mt-1 text-xs font-medium text-primary-dark">{report.secondary}</p>
              )}
            </div>

            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-border pt-4">
              <Link
                href={report.href}
                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-primary px-3.5 py-2 text-xs font-bold text-primary-foreground transition-colors hover:bg-primary-dark"
              >
                {report.actionLabel}
              </Link>
              {report.exportHref && (
                <a
                  href={report.exportHref}
                  download
                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-border bg-background px-3.5 py-2 text-xs font-semibold text-text transition-colors hover:border-primary-dark hover:text-primary-dark"
                >
                  <Download size={14} aria-hidden="true" />
                  تصدير CSV
                </a>
              )}
            </div>
          </section>
        ))}
      </div>

      <p className="rounded-xl border border-border bg-background px-4 py-3 text-xs leading-relaxed text-text-muted">
        لعرض تحليلات أعمق ومقارنات زمنية، افتح صفحة{' '}
        <Link href="/dashboard/analytics" className="font-semibold text-primary-dark hover:underline">
          التحليلات
        </Link>
        .
      </p>
    </div>
  )
}
