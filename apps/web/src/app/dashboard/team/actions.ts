'use server'

import { revalidatePath } from 'next/cache'
import { audit, requireAdminCapability, type AuthorizedContext } from '@/lib/capabilities/guard'
import { actionErrorMessage, dbActionError } from '@/lib/i18n/action-error'
import { findUserByEmail } from '@/lib/auth/users'
import {
  addOrganizationMember,
  isTeamRole,
  setMemberActive,
  TeamAccessError,
  updateMemberRole,
} from '@/lib/team'

export type TeamActionResult =
  | { ok: true; message: string }
  | { ok: false; error: string }

function actionError(error: unknown, fallback: string) {
  if (error instanceof TeamAccessError) return error.message
  return actionErrorMessage(error, fallback)
}

export async function addExistingMemberAction(input: {
  email: string
  role: string
}): Promise<TeamActionResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireAdminCapability(null)
  } catch (error) {
    return { ok: false, error: actionError(error, 'غير مصرح بإدارة أعضاء الفريق.') }
  }

  const email = typeof input?.email === 'string' ? input.email.trim().toLowerCase() : ''
  const role = typeof input?.role === 'string' ? input.role : ''
  if (email.length > 320 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { ok: false, error: 'أدخل بريداً إلكترونياً صحيحاً.' }
  }
  if (!isTeamRole(role)) {
    return { ok: false, error: 'الدور المحدد غير صالح.' }
  }

  try {
    const user = await findUserByEmail(email)
    if (!user) {
      return {
        ok: false,
        error: 'لا يوجد حساب مسجل بهذا البريد. يجب أن ينشئ المستخدم حساباً أولاً؛ الدعوات البريدية غير مهيأة في قاعدة البيانات الحالية.',
      }
    }

    const { data: existing, error: memberError } = await ctx.db
      .from('organization_members')
      .select('id, is_active')
      .eq('organization_id', ctx.organizationId)
      .eq('user_id', user.id)
      .maybeSingle()

    if (memberError) return { ok: false, error: dbActionError(memberError) }
    if (existing) {
      return {
        ok: false,
        error: existing.is_active
          ? 'هذا المستخدم عضو بالفعل في المؤسسة.'
          : 'هذا المستخدم عضو غير نشط بالفعل؛ أعد تفعيله من قائمة الأعضاء.',
      }
    }

    const member = await addOrganizationMember(ctx.db, {
      organizationId: ctx.organizationId,
      actorRole: ctx.role,
      userId: user.id as string,
      role,
    })

    await audit(ctx, 'team.member_added', 'organization_member', member.id, {
      email,
      role,
    })
    revalidatePath('/dashboard/team')
    return { ok: true, message: 'تمت إضافة العضو إلى المؤسسة.' }
  } catch (error) {
    return { ok: false, error: actionError(error, 'تعذرت إضافة العضو.') }
  }
}

export async function changeMemberRoleAction(
  memberId: string,
  nextRole: string
): Promise<TeamActionResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireAdminCapability(null)
  } catch (error) {
    return { ok: false, error: actionError(error, 'غير مصرح بإدارة أعضاء الفريق.') }
  }

  if (!isTeamRole(nextRole)) return { ok: false, error: 'الدور المحدد غير صالح.' }
  if (typeof memberId !== 'string' || memberId.length > 128 || !memberId) {
    return { ok: false, error: 'لم يتم العثور على العضو.' }
  }

  try {
    const { data: member, error } = await ctx.db
      .from('organization_members')
      .select('id, user_id, role')
      .eq('organization_id', ctx.organizationId)
      .eq('id', memberId)
      .maybeSingle()

    if (error) return { ok: false, error: dbActionError(error) }
    if (!member) return { ok: false, error: 'لم يتم العثور على العضو.' }
    if (member.user_id === ctx.userId) {
      return { ok: false, error: 'لا يمكنك تغيير دور حسابك من هنا.' }
    }

    await updateMemberRole(ctx.db, {
      organizationId: ctx.organizationId,
      actorRole: ctx.role,
      memberId,
      nextRole,
    })

    await audit(ctx, 'team.member_role_changed', 'organization_member', memberId, {
      from: member.role,
      to: nextRole,
    })
    revalidatePath('/dashboard/team')
    return { ok: true, message: 'تم تحديث دور العضو.' }
  } catch (error) {
    return { ok: false, error: actionError(error, 'تعذر تحديث دور العضو.') }
  }
}

export async function setMemberActiveAction(
  memberId: string,
  isActive: boolean
): Promise<TeamActionResult> {
  let ctx: AuthorizedContext
  try {
    ctx = await requireAdminCapability(null)
  } catch (error) {
    return { ok: false, error: actionError(error, 'غير مصرح بإدارة أعضاء الفريق.') }
  }

  if (typeof memberId !== 'string' || memberId.length > 128 || !memberId) {
    return { ok: false, error: 'لم يتم العثور على العضو.' }
  }
  if (typeof isActive !== 'boolean') {
    return { ok: false, error: 'حالة العضو غير صالحة.' }
  }

  try {
    const { data: member, error } = await ctx.db
      .from('organization_members')
      .select('id, user_id, is_active')
      .eq('organization_id', ctx.organizationId)
      .eq('id', memberId)
      .maybeSingle()

    if (error) return { ok: false, error: dbActionError(error) }
    if (!member) return { ok: false, error: 'لم يتم العثور على العضو.' }
    if (member.user_id === ctx.userId && !isActive) {
      return { ok: false, error: 'لا يمكنك تعطيل حسابك الحالي.' }
    }
    if (Boolean(member.is_active) === isActive) {
      return { ok: true, message: isActive ? 'العضو مفعّل بالفعل.' : 'العضو معطّل بالفعل.' }
    }

    await setMemberActive(ctx.db, {
      organizationId: ctx.organizationId,
      actorRole: ctx.role,
      memberId,
      isActive,
    })

    await audit(ctx, isActive ? 'team.member_activated' : 'team.member_deactivated', 'organization_member', memberId)
    revalidatePath('/dashboard/team')
    return { ok: true, message: isActive ? 'تم تفعيل العضو.' : 'تم تعطيل العضو.' }
  } catch (error) {
    return { ok: false, error: actionError(error, 'تعذر تحديث حالة العضو.') }
  }
}
