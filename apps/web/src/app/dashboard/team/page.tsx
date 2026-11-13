import { redirect } from 'next/navigation'
import { Shield, UserCog, UserRound, Eye, UserPlus } from 'lucide-react'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { roleLabel } from '@/lib/i18n/labels'
import { SectionHeader } from '@/components/ui/section-header'
import { ListRow } from '@/components/ui/list-row'
import { MobileEmptyState } from '@/components/ui/empty-state'

export const dynamic = 'force-dynamic'

const ROLE_META: Record<
  string,
  { subtitle: string; tone: 'success' | 'warning' | 'neutral'; icon: typeof Shield }
> = {
  owner: {
    subtitle: 'كل الصلاحيات والفوترة',
    tone: 'success',
    icon: Shield,
  },
  admin: {
    subtitle: 'الإعدادات والفريق',
    tone: 'warning',
    icon: UserCog,
  },
  member: {
    subtitle: 'المحادثات والمهام',
    tone: 'neutral',
    icon: UserRound,
  },
  agent: {
    subtitle: 'الرد على المحادثات',
    tone: 'neutral',
    icon: UserRound,
  },
  read_only: {
    subtitle: 'عرض التحليلات فقط',
    tone: 'neutral',
    icon: Eye,
  },
}

export default async function TeamPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const db = await createClient()
  const isAdmin = context.role === 'owner' || context.role === 'admin'

  const { data: members, error } = await db
    .from('organization_members')
    .select('id, user_id, role, created_at')
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Unable to load team members', error)
  }

  const userIds = (members ?? []).map((m) => m.user_id).filter(Boolean)
  const emailByUserId = new Map<string, string>()

  if (userIds.length > 0) {
    const { data: users } = await db
      .from('users')
      .select('id, email')
      .in('id', userIds)

    for (const user of users ?? []) {
      emailByUserId.set(user.id as string, (user.email as string) || '')
    }
  }

  const roleDescriptions = [
    { id: 'owner', title: 'مالك', subtitle: 'كل الصلاحيات والفوترة' },
    { id: 'admin', title: 'مدير', subtitle: 'الإعدادات والفريق' },
    { id: 'member', title: 'موظف', subtitle: 'المحادثات والمهام' },
    { id: 'read_only', title: 'مشاهد', subtitle: 'عرض التحليلات فقط' },
  ]

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-text">الفريق والصلاحيات</h1>
        <p className="mt-1 text-sm text-text-muted">
          أعضاء المؤسسة وأدوارهم داخل مساحة العمل.
        </p>
      </div>

      {!isAdmin && (
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          أنت في وضع الاطلاع فقط. دعوة الأعضاء وتغيير الأدوار متاحة للمالك أو المدير.
        </p>
      )}

      <section className="space-y-2.5">
        <SectionHeader title="الأعضاء" />
        {(members ?? []).length === 0 ? (
          <MobileEmptyState
            title="لا يوجد أعضاء بعد"
            description="سيظهر هنا أعضاء المؤسسة بعد دعوتهم أو تسجيل الدخول لأول مرة."
            icon={<UserPlus className="h-8 w-8" aria-hidden="true" />}
          />
        ) : (
          (members ?? []).map((member) => {
            const role = (member.role as string) || 'member'
            const meta = ROLE_META[role] || ROLE_META.member
            const Icon = meta.icon
            const email = emailByUserId.get(member.user_id as string) || member.user_id
            const isYou = member.user_id === context.userId
            return (
              <ListRow
                key={member.id}
                title={isYou ? `${email} (أنت)` : email}
                subtitle={meta.subtitle}
                trailing="badge"
                badgeLabel={roleLabel(role)}
                badgeTone={meta.tone}
                icon={<Icon className="h-5 w-5" />}
              />
            )
          })
        )}
      </section>

      <section className="space-y-2.5">
        <SectionHeader title="الأدوار" />
        {roleDescriptions.map((role) => (
          <ListRow
            key={role.id}
            title={role.title}
            subtitle={role.subtitle}
            trailing="chevron"
            icon={<Shield className="h-5 w-5" />}
          />
        ))}
      </section>

      {isAdmin && (
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-base font-semibold text-text">دعوة عضو</h2>
          <p className="mt-1 text-sm text-text-muted">
            دعوة الأعضاء بالبريد الإلكتروني ستُفعّل في مرحلة لاحقة. حالياً يظهر الأعضاء المسجّلون في المؤسسة.
          </p>
        </div>
      )}
    </div>
  )
}
