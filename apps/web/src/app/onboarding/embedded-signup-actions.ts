'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/org'
import { actionErrorMessage } from '@/lib/i18n/action-error'
import { completeEmbeddedSignup } from '@/lib/channels/embedded-signup'

export type OnboardingResult = { ok: boolean; error?: string; message?: string }

async function requireOnboardingAdmin() {
  const org = await getCurrentOrg()
  if (!org) throw new Error('الجلسة منتهية. سجّل الدخول من جديد.')
  if (org.role !== 'owner' && org.role !== 'admin') {
    throw new Error('إعداد النشاط متاح لمالك النشاط أو المسؤول فقط.')
  }
  return org
}

async function auditSetup(
  organizationId: string,
  businessId: string | null,
  action: string,
  entityType: string,
  entityId: string | null,
  metadata: Record<string, unknown>
) {
  try {
    const supabase = await createClient()
    const { error } = await supabase.rpc('log_audit_event', {
      p_organization_id: organizationId,
      p_action: action,
      p_entity_type: entityType,
      p_entity_id: entityId,
      p_business_id: businessId,
      p_metadata: metadata,
    })
    if (error) console.error('Unable to record onboarding audit event', error)
  } catch (error) {
    console.error('Unable to record onboarding audit event', error)
  }
}

/**
 * Completes Meta Embedded Signup after the customer finishes the Facebook popup.
 */
export async function completeWhatsAppEmbeddedSignupAction(input: {
  code: string
  phoneNumberId: string
  wabaId: string
  businessPortfolioId?: string | null
}): Promise<OnboardingResult> {
  try {
    const org = await requireOnboardingAdmin()
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('business_profiles')
      .select('business_id')
      .eq('organization_id', org.organizationId)
      .maybeSingle()

    const result = await completeEmbeddedSignup({
      organizationId: org.organizationId,
      businessId: (profile?.business_id as string | null) ?? null,
      session: {
        code: input.code,
        phoneNumberId: input.phoneNumberId,
        wabaId: input.wabaId,
        businessPortfolioId: input.businessPortfolioId ?? null,
      },
    })

    if (!result.ok) return { ok: false, error: result.error }

    await auditSetup(
      org.organizationId,
      (profile?.business_id as string | null) ?? null,
      'channel.whatsapp_embedded_signup',
      'channel',
      null,
      {
        phone_number_id: result.phoneNumberId,
        waba_id: result.wabaId,
        display_number: result.displayNumber,
      }
    )

    revalidatePath('/onboarding')
    revalidatePath('/dashboard/channels')
    return { ok: true, message: result.message }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر إتمام ربط واتساب عبر Meta.') }
  }
}
