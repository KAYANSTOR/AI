import Link from 'next/link'
import { redirect } from 'next/navigation'
import { KeyRound, LogOut, Building2, Mail, Phone, User } from 'lucide-react'
import { getDashboardContext } from '@/lib/dashboard/context'
import { roleLabel } from '@/lib/i18n/labels'
import { SectionHeader } from '@/components/ui/section-header'
import { ListRow } from '@/components/ui/list-row'
import { PasswordForm } from '@/app/dashboard/settings/password-form'
import { signOutAction } from '@/lib/auth/actions'
import { isPersonalWorkspace } from '@/lib/dashboard/navigation-policy'

export const dynamic = 'force-dynamic'

export default async function AccountPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const personal = isPersonalWorkspace(context)
  const initial = context.organizationName.trim().slice(0, 1) || context.email?.slice(0, 1) || 'ك'
  const role = roleLabel(context.role, 'عضو')
  const accountRole = personal && context.role === 'owner' ? 'مالك الحساب' : role
  const ContactIcon = context.email ? Mail : Phone

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">الحساب</h1>
        <p className="mt-1 text-sm text-text-muted">{personal ? 'بيانات حسابك الشخصي.' : 'بيانات حسابك والشركة المرتبطة به.'}</p>
      </div>

      {/* Profile header — Figma Account */}
      <div className="flex items-center gap-4 rounded-2xl border border-border bg-surface p-4">
        <div className="flex h-16 w-16 shrink-0 items-center justify-center rounded-full bg-primary-light text-xl font-bold text-secondary" aria-hidden="true">
          {initial}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-lg font-bold text-text">{context.organizationName}</p>
          <span className="mt-1 inline-flex rounded-full border border-success/30 bg-success/10 px-2.5 py-0.5 text-[11px] font-semibold text-success">
            {accountRole}
          </span>
        </div>
      </div>

      <section className="space-y-2.5">
        <SectionHeader title="بيانات الحساب" />
        <ListRow
          title={context.email ? 'البريد الإلكتروني' : 'رقم الهاتف'}
          subtitle={context.email ?? context.phone ?? '—'}
          trailing="meta"
          meta=""
          icon={<ContactIcon className="h-5 w-5" aria-hidden="true" />}
        />
        <ListRow
          title={personal ? 'اسم الحساب' : 'اسم الشركة'}
          subtitle={context.organizationName}
          trailing="meta"
          icon={<Building2 className="h-5 w-5" aria-hidden="true" />}
        />
        <ListRow
          title="الدور"
          subtitle={accountRole}
          trailing="meta"
          icon={<User className="h-5 w-5" aria-hidden="true" />}
        />
      </section>

      <section id="password" className="space-y-3 rounded-2xl border border-border bg-surface p-5">
        <div className="flex items-center gap-2">
          <KeyRound className="h-5 w-5 text-secondary" aria-hidden="true" />
          <div>
            <h2 className="text-base font-semibold text-text">تغيير كلمة المرور</h2>
            <p className="text-xs text-text-muted">حدّث كلمة المرور الخاصة بحسابك.</p>
          </div>
        </div>
        <PasswordForm />
      </section>

      <div className="space-y-2.5">
        <Link href="/dashboard#dashboard-guide" className="block"><ListRow title="دليل الاستخدام" subtitle="استأنف الجولة أو أعدها من الرئيسية" trailing="chevron" /></Link>
        <Link href="/dashboard/settings" className="block">
          <ListRow
            title={personal ? 'إعدادات الحساب الشخصي' : 'إعدادات مساحة العمل'}
            subtitle={personal ? 'المظهر والإشعارات' : 'المظهر والقنوات وميزات العمل'}
            trailing="chevron"
          />
        </Link>
        {!personal && <Link href="/dashboard/team" className="block">
          <ListRow
            title="الفريق والصلاحيات"
            subtitle="الأعضاء والأدوار"
            trailing="chevron"
          />
        </Link>}
      </div>

      <form action={signOutAction} className="pb-6 pt-2">
        <button
          type="submit"
          className="flex h-12 w-full items-center justify-center gap-2 rounded-xl border border-error/40 bg-error/5 text-[14px] font-semibold text-error transition hover:bg-error/10 active:scale-[0.99]"
        >
          <LogOut className="h-4 w-4" />
          <span>تسجيل الخروج</span>
        </button>
      </form>
    </div>
  )
}
