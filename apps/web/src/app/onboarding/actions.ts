'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getCurrentOrg, type OrgContext } from '@/lib/org'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'
import { isBusinessTypeId } from '@/lib/capabilities/business-types'
import { applyBusinessType } from '@/lib/capabilities/profile'
import {
  activationStateForStep,
  stateAfterActivationTest,
  stepAfterActivationTest,
} from '@/lib/onboarding/activation'
import { isOnboardingStage, stepForStage, type OnboardingStage } from '@/lib/onboarding/stages'
import { evaluateSmokeTest, withReplyTestCheck, type SmokeTestOutcome } from '@/lib/onboarding/smoke-test'
import { connectWhatsAppChannel } from '@/lib/channels/connect-service'
import { isPlausiblePhoneNumber } from '@/lib/channels/connect'
import { tryAgentReply, type ReplyTestResult } from '@/lib/onboarding/reply-test'
import { normalizeChannelNumber } from '@/lib/channels/management'
import {
  buildPromptAddition,
  generateAgentSetupDraft,
  parseAgentSetupDraft,
  type SetupDraftResult,
} from '@/lib/ai/setup-draft'

export type OnboardingResult = { ok: boolean; error?: string; message?: string }

async function requireOnboardingAdmin(): Promise<OrgContext> {
  const org = await getCurrentOrg()
  if (!org) throw new Error('الجلسة منتهية. سجّل الدخول من جديد.')
  if (org.role !== 'owner' && org.role !== 'admin') {
    throw new Error('إعداد النشاط متاح لمالك النشاط أو المسؤول فقط.')
  }
  return org
}

// NOTE: Full file restored from commit 3c1809a — remaining functions kept via git history if truncated.
export async function connectWhatsAppAction(input: { phoneNumber: string }): Promise<OnboardingResult> {
  try {
    const org = await requireOnboardingAdmin()
    const supabase = await createClient()

    const { data: profile } = await supabase
      .from('business_profiles')
      .select('business_id, public_phone_number')
      .eq('organization_id', org.organizationId)
      .maybeSingle()

    const { data: existing } = await supabase
      .from('channels')
      .select('id')
      .eq('organization_id', org.organizationId)
      .eq('channel_type', 'whatsapp')
      .maybeSingle()

    if (!existing) {
      const { count } = await supabase
        .from('channels')
        .select('id', { count: 'exact', head: true })
        .eq('organization_id', org.organizationId)
      if ((count ?? 0) >= 1) {
        return {
          ok: false,
          error: 'خطتك الحالية تسمح بقناة واحدة. أوقف القناة الحالية أو رقِّ الباقة لإضافة واتساب.',
        }
      }
    }

    const result = await connectWhatsAppChannel({
      supabase,
      organizationId: org.organizationId,
      businessId: (profile?.business_id as string | null) ?? null,
      number: input.phoneNumber,
    })

    if (!result.ok) return { ok: false, error: result.error }

    if (!profile?.public_phone_number) {
      await supabase
        .from('business_profiles')
        .update({ public_phone_number: normalizeChannelNumber(input.phoneNumber) })
        .eq('organization_id', org.organizationId)
    }

    revalidatePath('/onboarding')
    revalidatePath('/dashboard/channels')
    return { ok: true, message: result.outcome.message }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'لم يكتمل ربط واتساب. حاول مرة أخرى.') }
  }
}

export async function saveBasicsAction(input: {
  name: string
  businessTypeId?: string
  phone?: string
  timezone?: string
}): Promise<OnboardingResult> {
  try {
    const org = await requireOnboardingAdmin()
    const name = input.name?.trim()
    if (name.length < 2) return { ok: false, error: 'اكتب اسم النشاط (حرفان على الأقل).' }
    if (name.length > 120) return { ok: false, error: 'اسم النشاط طويل جدًا.' }
    const businessTypeId = input.businessTypeId?.trim()
    if (businessTypeId && !isBusinessTypeId(businessTypeId)) {
      return { ok: false, error: 'نوع النشاط غير معروف.' }
    }
    const phoneInput = input.phone?.trim()
    let publicPhone: string | null = null
    if (phoneInput) {
      if (!isPlausiblePhoneNumber(phoneInput)) {
        return { ok: false, error: 'اكتب رقم النشاط بصيغة دولية، مثال +967777123456.' }
      }
      publicPhone = normalizeChannelNumber(phoneInput)
    }
    const supabase = await createClient()
    const { data: profile, error: profileError } = await supabase
      .from('business_profiles')
      .select('business_id, business_type_id, timezone, public_phone_number')
      .eq('organization_id', org.organizationId)
      .maybeSingle()
    if (profileError) return { ok: false, error: supabaseActionError(profileError) }
    const businessId = (profile?.business_id as string | null) ?? null
    const profilePatch: Record<string, unknown> = {
      public_phone_number: publicPhone,
      updated_at: new Date().toISOString(),
    }
    if (businessTypeId && businessTypeId !== profile?.business_type_id) {
      await applyBusinessType(supabase, org.organizationId, businessTypeId)
    }
    const { error: profileUpdateError } = await supabase
      .from('business_profiles')
      .update(profilePatch)
      .eq('organization_id', org.organizationId)
    if (profileUpdateError) return { ok: false, error: supabaseActionError(profileUpdateError) }
    if (businessId) {
      const { error: businessError } = await supabase.from('businesses').update({ name }).eq('id', businessId)
      if (businessError) return { ok: false, error: supabaseActionError(businessError) }
    }
    if (name !== org.organizationName) {
      await supabase.from('organizations').update({ name }).eq('id', org.organizationId)
    }
    revalidatePath('/onboarding')
    revalidatePath('/dashboard')
    return { ok: true, message: 'تم الحفظ.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر الحفظ. حاول مرة أخرى.') }
  }
}

export async function advanceStageAction(stage: number): Promise<OnboardingResult> {
  try {
    const org = await requireOnboardingAdmin()
    if (!isOnboardingStage(stage)) return { ok: false, error: 'مرحلة غير معروفة.' }
    const supabase = await createClient()
    const { data: profile, error: readError } = await supabase
      .from('business_profiles')
      .select('activation_state, smoke_test_status')
      .eq('organization_id', org.organizationId)
      .maybeSingle()
    if (readError) return { ok: false, error: supabaseActionError(readError) }
    const step = stepForStage(stage as OnboardingStage)
    const nextState = activationStateForStep({
      step,
      storedState: String(profile?.activation_state ?? 'workspace_ready'),
      smokeStatus: (profile?.smoke_test_status as string | null) ?? null,
    })
    const { error } = await createAdminClient()
      .from('business_profiles')
      .update({ activation_step: step, activation_state: nextState })
      .eq('organization_id', org.organizationId)
    if (error) return { ok: false, error: supabaseActionError(error) }
    revalidatePath('/onboarding')
    revalidatePath('/dashboard')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحديث المرحلة.') }
  }
}

export async function generateAgentSetupAction(input: {
  description: string
}): Promise<OnboardingResult & { result?: SetupDraftResult }> {
  try {
    const org = await requireOnboardingAdmin()
    const description = input.description?.trim() ?? ''
    if (description.length < 10) return { ok: false, error: 'اكتب وصفاً قصيراً لنشاطك (10 أحرف على الأقل).' }
    if (description.length > 1400) return { ok: false, error: 'الوصف طويل جدًا. اختصره في بضع جمل.' }
    const result = await generateAgentSetupDraft({ description, businessName: org.organizationName })
    return { ok: true, result }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تجهيز الوكيل. حاول مرة أخرى.') }
  }
}

export async function saveAgentSetupDescriptionAction(input: {
  description: string
}): Promise<OnboardingResult> {
  try {
    const org = await requireOnboardingAdmin()
    const description = input?.description
    if (typeof description !== 'string') return { ok: false, error: 'اكتب وصف النشاط بصيغة صحيحة.' }
    if (description.length > 1400) return { ok: false, error: 'الوصف طويل جدًا. اختصره في بضع جمل.' }
    const supabase = await createClient()
    const { error } = await supabase
      .from('business_profiles')
      .update({ setup_description: description })
      .eq('organization_id', org.organizationId)
    if (error) return { ok: false, error: supabaseActionError(error) }
    revalidatePath('/onboarding')
    return { ok: true, message: 'تم حفظ الوصف.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حفظ الوصف. حاول مرة أخرى.') }
  }
}

export async function saveAgentSetupAction(input: { draft: unknown }): Promise<OnboardingResult> {
  try {
    const org = await requireOnboardingAdmin()
    const supabase = await createClient()
    const { data: profile } = await supabase
      .from('business_profiles')
      .select('business_id, setup_description')
      .eq('organization_id', org.organizationId)
      .maybeSingle()
    const { draft } = parseAgentSetupDraft(input.draft, org.organizationName + ' AI')
    const promptAddition = buildPromptAddition(draft, org.organizationName + ' AI')
    const { data: agent, error: agentError } = await supabase
      .from('ai_agents')
      .select('id, name')
      .eq('organization_id', org.organizationId)
      .neq('status', 'archived')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle()
    if (agentError) return { ok: false, error: supabaseActionError(agentError) }
    if (!agent) {
      const { data: created, error: createError } = await supabase
        .from('ai_agents')
        .insert({
          organization_id: org.organizationId,
          business_id: (profile?.business_id as string | null) ?? null,
          name: draft.agentName,
          slug: 'frontdesk',
          model_provider: 'gemini',
          temperature: 0.2,
          status: 'active',
          locale: 'ar',
        })
        .select('id')
        .single()
      if (createError) return { ok: false, error: supabaseActionError(createError) }
      const { error: publishError } = await supabase.rpc('publish_agent_prompt', {
        p_agent_id: created.id,
        p_system_prompt_addition: promptAddition,
      })
      if (publishError) return { ok: false, error: supabaseActionError(publishError) }
    } else {
      const { error: nameError } = await supabase
        .from('ai_agents')
        .update({ name: draft.agentName, temperature: 0.2, status: 'active' })
        .eq('id', agent.id)
      if (nameError) return { ok: false, error: supabaseActionError(nameError) }
      const { error: publishError } = await supabase.rpc('publish_agent_prompt', {
        p_agent_id: agent.id,
        p_system_prompt_addition: promptAddition,
      })
      if (publishError) return { ok: false, error: supabaseActionError(publishError) }
    }
    const { error: descriptionError } = await supabase
      .from('business_profiles')
      .update({
        setup_description: draft.summary,
        system_prompt_addition: promptAddition,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', org.organizationId)
    if (descriptionError) return { ok: false, error: supabaseActionError(descriptionError) }
    revalidatePath('/onboarding')
    revalidatePath('/dashboard/agent')
    return { ok: true, message: 'تم اعتماد إعداد الوكيل.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حفظ إعداد الوكيل.') }
  }
}

export async function runActivationTestAction(input?: {
  message?: string
}): Promise<OnboardingResult & { outcome?: SmokeTestOutcome; reply?: ReplyTestResult }> {
  try {
    const org = await requireOnboardingAdmin()
    const supabase = await createClient()
    const message = input?.message ?? 'السلام عليكم، أريد حجز موعد.'
    const structuralOutcome = await evaluateSmokeTest(supabase, org)
    const { data: profile } = await supabase
      .from('business_profiles')
      .select('business_id, activation_state')
      .eq('organization_id', org.organizationId)
      .maybeSingle()
    const businessId = (profile?.business_id as string | null) ?? null
    const { data: agent } = businessId
      ? await supabase
          .from('ai_agents')
          .select('id')
          .eq('organization_id', org.organizationId)
          .eq('business_id', businessId)
          .eq('status', 'active')
          .order('created_at', { ascending: true })
          .limit(1)
          .maybeSingle()
      : { data: null }
    const reply = await tryAgentReply({
      supabase,
      organizationId: org.organizationId,
      agentId: (agent?.id as string | undefined) ?? null,
      message,
    })
    const outcome = withReplyTestCheck(structuralOutcome, reply.status)
    const activationState = String(profile?.activation_state ?? 'workspace_ready')
    await createAdminClient()
      .from('business_profiles')
      .update({
        smoke_test_status: outcome.passed ? 'passed' : 'failed',
        smoke_test_result: { ...outcome, reply, testMessage: message.trim() },
        activation_state: stateAfterActivationTest({ currentState: activationState, passed: outcome.passed }),
        activation_step: stepAfterActivationTest({ currentState: activationState }),
      })
      .eq('organization_id', org.organizationId)
    revalidatePath('/onboarding')
    return { ok: true, outcome, reply }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تشغيل الاختبار.') }
  }
}
