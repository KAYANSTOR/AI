import { redirect } from 'next/navigation'
import { Shield, UserCog, UserRound, Eye } from 'lucide-react'
import { getDashboardContext } from '@/lib/dashboard/context'
import { createClient } from '@/lib/db/server'
import { findUserIdentitiesByIds } from '@/lib/auth/users'
import { roleLabel } from '@/lib/i18n/labels'
import { SectionHeader } from '@/components/ui/section-header'
import { ListRow } from '@/components/ui/list-row'
import { MobileEmptyState } from '@/components/ui/empty-state'
import { AddExistingMemberForm, TeamMemberControls } from './team-management'

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
  manager: {
    subtitle: 'إدارة المهام ومتابعة الفريق',
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
    .select('id, user_id, role, is_active, created_at')
    .eq('organization_id', context.organizationId)
    .order('created_at', { ascending: true })

  if (error) {
    console.error('Unable to load team members', error)
  }

  const userIds = (members ?? []).map((m) => m.user_id).filter(Boolean)
  const emailByUserId = new Map<string, string>()

  if (userIds.length > 0) {
    try {
      const users = await findUserIdentitiesByIds(userIds as string[])
      for (const user of users) emailByUserId.set(user.id, user.email)
    } catch (error) {
      console.error('Unable to load team member email addresses', error)
    }
  }

  const roleDescriptions = [
    { id: 'owner', title: 'مالك', subtitle: 'كل الصلاحيات والفوترة' },
    { id: 'admin', title: 'مدير', subtitle: 'الإعدادات والفريق' },
    { id: 'manager', title: 'مدير عمليات', subtitle: 'إدارة المهام ومتابعة الفريق' },
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
          أنت في وضع الاطلاع فقط. إضافة الأعضاء وتغيير الأدوار متاحان للمالك أو المدير.
        </p>
      )}

      <section className="space-y-2.5">
        <SectionHeader title="الأعضاء" />
        {error ? (
          <p role="alert" className="rounded-xl border border-error/30 bg-error/5 px-4 py-3 text-sm text-error">
            تعذر تحميل أعضاء الفريق من قاعدة البيانات. أعد المحاولة لاحقاً.
          </p>
        ) : (members ?? []).length === 0 ? (
          <MobileEmptyState
            title="لا يوجد أعضاء بعد"
            description="سيظهر هنا أعضاء المؤسسة بعد تسجيلهم وإضافتهم إلى مساحة العمل."
            icon={<UserCog className="h-8 w-8" aria-hidden="true" />}
          />
        ) : (
          (members ?? []).map((member) => {
            const role = (member.role as string) || 'member'
            const meta = ROLE_META[role] || ROLE_META.member
            const Icon = meta.icon
            const memberId = member.id as string
            const memberUserId = member.user_id as string
            const email = emailByUserId.get(memberUserId) || memberUserId
            const isYou = memberUserId === context.userId
            const isActive = Boolean(member.is_active)
            return (
              <ListRow
                key={memberId}
                title={isYou ? `${email} (أنت)` : email}
                subtitle={`${meta.subtitle} · ${isActive ? 'نشط' : 'غير نشط'}`}
                trailing={isAdmin ? 'custom' : 'badge'}
                trailingContent={
                  isAdmin ? (
                    <TeamMemberControls
                      memberId={memberId}
                      memberLabel={email}
                      role={role}
                      isActive={isActive}
                      allowOwner={context.role === 'owner'}
                      isSelf={isYou}
                    />
                  ) : undefined
                }
                badgeLabel={isActive ? roleLabel(role) : 'معطّل'}
                badgeTone={isActive ? meta.tone : 'warning'}
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

      {isAdmin ? (
        <AddExistingMemberForm allowOwner={context.role === 'owner'} />
      ) : null}
    </div>
  )
}
