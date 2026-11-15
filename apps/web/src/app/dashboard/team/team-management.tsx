'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, UserPlus } from 'lucide-react'
import { roleLabel } from '@/lib/i18n/labels'
import { TEAM_ROLES, type TeamRole } from '@/lib/team-roles'
import { Switch } from '@/components/ui/switch'
import {
  addExistingMemberAction,
  changeMemberRoleAction,
  setMemberActiveAction,
  type TeamActionResult,
} from './actions'

function RoleOptions({ allowOwner }: { allowOwner: boolean }) {
  return (
    <>
      {TEAM_ROLES.filter((role) => allowOwner || role !== 'owner').map((role) => (
        <option key={role} value={role}>
          {roleLabel(role)}
        </option>
      ))}
    </>
  )
}

function ActionFeedback({ result }: { result: TeamActionResult | null }) {
  if (!result) return null

  return (
    <p
      className={result.ok ? 'text-xs text-success' : 'text-xs text-error'}
      role={result.ok ? 'status' : 'alert'}
    >
      {result.ok ? result.message : result.error}
    </p>
  )
}

export function AddExistingMemberForm({
  allowOwner,
}: {
  allowOwner: boolean
}) {
  const router = useRouter()
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<TeamRole>('member')
  const [result, setResult] = useState<TeamActionResult | null>(null)
  const [pending, startTransition] = useTransition()

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setResult(null)
    startTransition(async () => {
      const response = await addExistingMemberAction({ email, role })
      setResult(response)
      if (response.ok) {
        setEmail('')
        router.refresh()
      }
    })
  }

  return (
    <form onSubmit={onSubmit} className="space-y-4 rounded-2xl border border-border bg-surface p-5">
      <div className="flex items-center gap-2">
        <UserPlus className="h-5 w-5 text-primary" aria-hidden="true" />
        <div>
          <h2 className="text-base font-semibold text-text">إضافة عضو مسجل</h2>
          <p className="mt-1 text-sm text-text-muted">
            أضف حساباً موجوداً بالفعل؛ إنشاء دعوات بريدية يتطلب دعماً غير متوفر في قاعدة البيانات الحالية.
          </p>
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
        <div>
          <label htmlFor="team-member-email" className="mb-1.5 block text-sm font-semibold text-text">
            البريد الإلكتروني
          </label>
          <input
            id="team-member-email"
            type="email"
            autoComplete="email"
            dir="ltr"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="min-h-[52px] w-full rounded-xl border border-border bg-surface px-4 text-start text-base text-text transition-colors focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 md:text-sm"
          />
        </div>
        <div>
          <label htmlFor="team-member-role" className="mb-1.5 block text-sm font-semibold text-text">
            الدور
          </label>
          <select
            id="team-member-role"
            value={role}
            onChange={(event) => setRole(event.target.value as TeamRole)}
            className="min-h-[52px] w-full rounded-xl border border-border bg-surface px-3 text-sm text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15"
          >
            <RoleOptions allowOwner={allowOwner} />
          </select>
        </div>
        <button
          type="submit"
          disabled={pending}
          className="inline-flex min-h-[52px] items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
        >
          {pending ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> : null}
          إضافة العضو
        </button>
      </div>
      <ActionFeedback result={result} />
    </form>
  )
}

export function TeamMemberControls({
  memberId,
  memberLabel,
  role,
  isActive,
  allowOwner,
  isSelf,
}: {
  memberId: string
  memberLabel: string
  role: string
  isActive: boolean
  allowOwner: boolean
  isSelf: boolean
}) {
  const router = useRouter()
  const [result, setResult] = useState<TeamActionResult | null>(null)
  const [pending, startTransition] = useTransition()
  const roleIsAssignable =
    TEAM_ROLES.includes(role as TeamRole) && (role !== 'owner' || allowOwner)

  function updateRole(nextRole: string) {
    setResult(null)
    startTransition(async () => {
      const response = await changeMemberRoleAction(memberId, nextRole)
      setResult(response)
      if (response.ok) router.refresh()
    })
  }

  function toggleActive() {
    setResult(null)
    startTransition(async () => {
      const response = await setMemberActiveAction(memberId, !isActive)
      setResult(response)
      if (response.ok) router.refresh()
    })
  }

  return (
    <div className="flex min-w-0 flex-col items-end gap-2">
      <div className="flex items-center gap-2">
        <label htmlFor={`member-role-${memberId}`} className="sr-only">
          دور العضو
        </label>
        <select
          id={`member-role-${memberId}`}
          value={roleIsAssignable ? role : ''}
          disabled={pending || isSelf || !roleIsAssignable}
          onChange={(event) => updateRole(event.target.value)}
          className="min-h-11 max-w-32 rounded-lg border border-border bg-surface px-2 text-xs text-text focus:border-primary focus:outline-none focus:ring-2 focus:ring-primary/15 disabled:opacity-60"
        >
          {!roleIsAssignable ? <option value="">{roleLabel(role)}</option> : null}
          <RoleOptions allowOwner={allowOwner} />
        </select>
        <Switch
          checked={isActive}
          onCheckedChange={toggleActive}
          disabled={pending || isSelf}
          aria-label={`${isActive ? 'تعطيل' : 'تفعيل'} العضو ${memberLabel}`}
        />
        {pending ? <Loader2 className="h-4 w-4 animate-spin text-primary" aria-hidden="true" /> : null}
      </div>
      <ActionFeedback result={result} />
    </div>
  )
}
