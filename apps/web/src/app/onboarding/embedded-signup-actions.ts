'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { getCurrentOrg } from '@/lib/org'
import { actionErrorMessage } from '@/lib/i18n/action-error'
import {
  completeEmbeddedSignup,
  createEmbeddedSignupOAuthState,
  verifyEmbeddedSignupOAuthState,
} from '@/lib/channels/embedded-signup'

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
    const db = await createClient()
    const { error } = await db.rpc('log_audit_event', {
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
/**
 * Issues a short-lived OAuth state for the authenticated organization.
 * The client receives no signing key; the callback validates the signature on the server.
 */
export async function createWhatsAppEmbeddedSignupOAuthStateAction(): Promise<
  { ok: true; state: string; redirectUri: string } | { ok: false; error: string }
> {
  try {
    const org = await requireOnboardingAdmin()
    const result = createEmbeddedSignupOAuthState(org.organizationId)
    return { ok: true, ...result }
  } catch (error) {
    return {
      ok: false,
      error: actionErrorMessage(error, 'تعذّر بدء الربط مع Meta. حدّث الصفحة وحاول مرة أخرى.'),
    }
  }
}

export async function completeWhatsAppEmbeddedSignupAction(input: {
  code: string
  state: string
  phoneNumberId?: string | null
  wabaId?: string | null
  businessPortfolioId?: string | null
}): Promise<OnboardingResult> {
  try {
    const org = await requireOnboardingAdmin()
    const oauthState = verifyEmbeddedSignupOAuthState(input.state, org.organizationId)
    if (!oauthState) {
      return { ok: false, error: 'انتهت صلاحية جلسة Meta أو لم تتطابق مع الحساب الحالي. أعد بدء الربط.' }
    }

    const db = await createClient()

    const { data: profile } = await db
      .from('business_profiles')
      .select('business_id')
      .eq('organization_id', org.organizationId)
      .maybeSingle()

    const result = await completeEmbeddedSignup({
      organizationId: org.organizationId,
      businessId: (profile?.business_id as string | null) ?? null,
      organizationName: org.organizationName,
      session: {
        code: input.code,
        phoneNumberId: input.phoneNumberId ?? null,
        wabaId: input.wabaId ?? null,
        businessPortfolioId: input.businessPortfolioId ?? null,
        redirectUri: oauthState.redirectUri,
      },
    })

    if (!result.ok) return { ok: false, error: result.error }

    await auditSetup(
      org.organizationId,
      result.businessId,
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
