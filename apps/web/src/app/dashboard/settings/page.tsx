import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { redirect } from 'next/navigation'
import Link from 'next/link'
import {
  Bell,
  Globe,
  KeyRound,
  LogOut,
  Moon,
  Radio,
  Shield,
  Sliders,
  Users,
  Zap,
} from 'lucide-react'
import { PasswordForm } from './password-form'
import { CapabilityManager } from './capability-manager'
import { SectionHeader } from '@/components/ui/section-header'
import { ListRow } from '@/components/ui/list-row'
import { ThemeToggle } from '@/components/theme/theme-toggle'
import { signOutAction } from '@/lib/auth/actions'
import { roleLabel } from '@/lib/i18n/labels'

export default async function SettingsPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const db = await createClient()

  const { data: allCaps } = await db
    .from('capabilities')
    .select('id, name, description')
    .order('name')

  const enabledMap = new Map(context.enabledCapabilities.map((id) => [id, true]))
  const rows = (allCaps ?? []).map((capability) => ({
    id: capability.id as string,
    name: capability.name || capability.id,
    description: capability.description ?? '',
    enabled: enabledMap.get(capability.id as string) ?? false,
  }))

  const isAdmin = context.role === 'owner' || context.role === 'admin'

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">الإعدادات والتفضيلات</h1>
        <p className="mt-1 text-sm text-text-muted">
          إدارة الحساب، الفريق، القنوات، ومظهر التطبيق.
        </p>
      </div>

      {/* 1. Account Section (Figma node 19:2996) */}
      <div className="space-y-3">
        <SectionHeader title="الحساب والمنشأة" />

        <div className="space-y-2.5">
          <ListRow
            title={context.organizationName}
            subtitle={`الدور: ${roleLabel(context.role)} · ${context.email}`}
            trailing="meta"
            meta={context.timezone}
            icon={<Shield className="h-5 w-5" />}
          />

          <Link href="/dashboard/channels" className="block">
            <ListRow
              title="القنوات والربط"
              subtitle="إدارة ربط واتساب والهاتف"
              trailing="chevron"
              icon={<Radio className="h-5 w-5" />}
            />
          </Link>

          <Link href="/dashboard/integrations" className="block">
            <ListRow
              title="مركز التكاملات"
              subtitle="حالة الاتصال والخدمات السحابية"
              trailing="chevron"
              icon={<Zap className="h-5 w-5" />}
            />
          </Link>
        </div>
      </div>

      {/* 2. Preferences (Figma node 19:3033) */}
      <div className="space-y-3">
        <SectionHeader title="التفضيلات والمظهر" />

        <div className="space-y-2.5">
          <ListRow
            title="اللغة"
            subtitle="لغة الواجهة الأساسية"
            trailing="meta"
            meta="العربية (RTL)"
            icon={<Globe className="h-5 w-5" />}
          />

          <div className="flex items-center justify-between rounded-[16px] border border-border bg-surface p-3.5">
            <div className="flex items-center gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary-light text-primary">
                <Moon className="h-5 w-5" />
              </div>
              <div>
                <p className="text-[14px] font-semibold text-text">المظهر (داكن / فاتح)</p>
                <p className="text-[12px] text-text-muted">تبديل وضع الألوان بسهولة</p>
              </div>
            </div>
            <ThemeToggle />
          </div>

          <Link href="/dashboard/notifications" className="block">
            <ListRow
              title="مركز الإشعارات والتنبيهات"
              subtitle="تخصيص تنبيهات المحادثات الجديدة والتصعيد"
              trailing="chevron"
              icon={<Bell className="h-5 w-5" />}
            />
          </Link>
        </div>
      </div>

      {/* 3. Advanced Tools & Capabilities (for Admins) */}
      {isAdmin && (
        <div className="space-y-3">
          <SectionHeader title="أدوات متقدمة والذكاء الاصطناعي" />

          <div className="space-y-2.5">
            <Link href="/dashboard/settings/canned-replies" className="block">
              <ListRow
                title="الردود الجاهزة"
                subtitle="قوالب سريعة للرد على العملاء"
                trailing="chevron"
                icon={<Sliders className="h-5 w-5" />}
              />
            </Link>

            <Link href="/dashboard/settings/escalation" className="block">
              <ListRow
                title="سياسات التصعيد ومستوى الخدمة (SLA)"
                subtitle="قواعد تحويل المحادثات من الذكاء الاصطناعي للموظفين"
                trailing="chevron"
                icon={<Users className="h-5 w-5" />}
              />
            </Link>

            <Link href="/dashboard/settings/api-keys" className="block">
              <ListRow
                title="مفاتيح الربط البرمجي (API Keys)"
                subtitle="توليد وإدارة مفاتيح التكاملات المخصصة"
                trailing="chevron"
                icon={<KeyRound className="h-5 w-5" />}
              />
            </Link>
          </div>

          <div className="mt-4 rounded-2xl border border-border bg-surface p-5">
            <h3 className="mb-3 text-base font-semibold text-text">تفعيل وإلغاء مهام الوكيل الذكي</h3>
            <CapabilityManager rows={rows} />
          </div>
        </div>
      )}

      {/* 4. Security & Password */}
      <section id="security" className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <div>
          <h2 className="text-base font-semibold text-text">أمان الحساب</h2>
          <p className="mt-0.5 text-xs text-text-muted">
            تغيير كلمة المرور الخاصة بحسابك: <span dir="ltr" className="font-semibold">{context.email}</span>
          </p>
        </div>
        <PasswordForm />
      </section>

      {/* 5. Sign Out */}
      <form action={signOutAction} className="pt-2 pb-6">
        <button
          type="submit"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-error/40 bg-error/5 text-[14px] font-semibold text-error transition hover:bg-error/10 active:scale-[0.99]"
        >
          <LogOut className="h-4 w-4" />
          <span>تسجيل الخروج من الحساب</span>
        </button>
      </form>
    </div>
  )
}
