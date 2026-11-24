import type { DbClient } from '@/lib/db/client'

/**
 * The personal assistant is a separate product surface. It is visible and usable only
 * when the organization's sector is `personal_assistant` or the owner console enabled
 * the "Personal Assistant" add-on (organizations.personal_assistant_addon_enabled).
 */
export const PERSONAL_ASSISTANT_SECTOR = 'personal_assistant'
export const PERSONAL_ASSISTANT_CAPABILITY = 'personal_assistant'

export type PersonalAssistantAccessInput = {
  businessType?: string | null
  businessTypeId?: string | null
  addonEnabled?: boolean | null
}

export function isPersonalAssistantEligible(input: PersonalAssistantAccessInput): boolean {
  return input.businessType === PERSONAL_ASSISTANT_SECTOR
    || input.businessTypeId === PERSONAL_ASSISTANT_SECTOR
    || input.addonEnabled === true
}

/** Reads the sector and add-on flag for one organization (fails closed on errors). */
export async function loadPersonalAssistantAccess(db: DbClient, organizationId: string): Promise<boolean> {
  try {
    const [{ data: org }, { data: profile }] = await Promise.all([
      db.from('organizations').select('id, business_type, personal_assistant_addon_enabled')
        .eq('id', organizationId).maybeSingle(),
      db.from('business_profiles').select('business_type_id')
        .eq('organization_id', organizationId).maybeSingle(),
    ])
    return isPersonalAssistantEligible({
      businessType: (org?.business_type as string | null | undefined) ?? null,
      businessTypeId: (profile?.business_type_id as string | null | undefined) ?? null,
      addonEnabled: org?.personal_assistant_addon_enabled === true,
    })
  } catch (error) {
    console.error('personal_assistant_access_check_failed', { organizationId, reason: error instanceof Error ? error.message : 'unknown' })
    return false
  }
}

export const PERSONAL_ASSISTANT_FORBIDDEN = {
  error: 'personal_assistant_not_enabled',
  message: 'المساعد الشخصي غير مفعّل لحسابك. فعّل إضافة «المساعد الشخصي» من صفحة الباقات.',
  upgradeUrl: '/dashboard/billing',
} as const
