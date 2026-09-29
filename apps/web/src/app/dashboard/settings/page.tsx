import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/supabase/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import { CapabilityManager } from './capability-manager'
import { ar } from '@/lib/i18n/ar'
import { businessTypeLabel, capabilityDescription, capabilityLabel, roleLabel } from '@/lib/i18n/labels'

export default async function SettingsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const supabase = await createClient()

  const { data: allCaps } = await supabase
    .from('capabilities')
    .select('id, name, description')
    .order('name')

  const enabledMap = new Map(context.enabledCapabilities.map((id) => [id, true]))
  const rows = (allCaps ?? []).map((capability) => ({
    id: capability.id as string,
    name: capabilityLabel(capability.id, capability.name),
    description: capabilityDescription(capability.id, capability.description ?? undefined),
    enabled: enabledMap.get(capability.id as string) ?? false,
  }))

  const isAdmin = context.role === 'owner' || context.role === 'admin'

  return (
    <div className="max-w-3xl space-y-8">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">{ar.settings.title}</h1>
        <p className="mt-1 text-sm text-text-muted">{ar.settings.description}</p>
      </div>

      <section className="space-y-3 rounded-xl border border-border bg-surface p-5 sm:p-6">
        <h2 className="text-sm font-semibold text-text">{ar.settings.profile}</h2>
        <dl className="grid grid-cols-1 gap-4 text-sm sm:grid-cols-2">
          <div>
            <dt className="text-text-muted">{ar.settings.organization}</dt>
            <dd className="font-medium text-text">{context.organizationName}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{ar.settings.role}</dt>
            <dd className="font-medium text-text">{roleLabel(context.role)}</dd>
          </div>
          <div>
            <dt className="text-text-muted">{ar.settings.businessType}</dt>
            <dd className="font-medium text-text">
              {context.businessTypeId
                ? businessTypeLabel(context.businessTypeId)
                : ar.common.notSet}
            </dd>
          </div>
          <div>
            <dt className="text-text-muted">{ar.settings.timezone}</dt>
            <dd dir="ltr" className="text-start font-medium text-text">
              {context.timezone}
            </dd>
          </div>
        </dl>
        <Link
          href="/dashboard/setup"
          className="inline-flex min-h-11 items-center text-sm font-medium text-primary-dark hover:underline"
        >
          {ar.settings.changeBusinessType}
        </Link>
      </section>

      {isAdmin && (
        <section className="space-y-2 rounded-xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-text">أدوات متقدمة</h2>
          <ul className="space-y-2 text-sm">
            <li>
              <Link href="/dashboard/settings/canned-replies" className="text-primary-dark hover:underline">
                الردود الجاهزة
              </Link>
            </li>
            <li>
              <Link href="/dashboard/settings/api-keys" className="text-primary-dark hover:underline">
                مفاتيح API
              </Link>
            </li>
            <li>
              <Link href="/dashboard/settings/escalation" className="text-primary-dark hover:underline">
                سياسات التصعيد (SLA)
              </Link>
            </li>
            <li>
              <a href="/api/export/contacts" className="text-primary-dark hover:underline">
                تصدير جهات الاتصال (CSV)
              </a>
            </li>
            <li>
              <a href="/api/export/leads" className="text-primary-dark hover:underline">
                تصدير العملاء المحتملين (CSV)
              </a>
            </li>
          </ul>
        </section>
      )}

      <section className="space-y-3">
        <div>
          <h2 className="text-sm font-semibold text-text">{ar.settings.capabilities}</h2>
          <p className="mt-0.5 text-xs text-text-muted">{ar.settings.capabilityDescription}</p>
        </div>
        <CapabilityManager rows={rows} />
      </section>
    </div>
  )
}
