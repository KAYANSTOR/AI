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

async function runActivationChecks(
  supabase: Awaited<ReturnType<typeof createClient>>,
  org: OrgContext,
  message: string
) {
  const structuralOutcome = await evaluateSmokeTest(supabase, org)
  const { data: profile, error: profileError } = await supabase
    .from('business_profiles')
    .select('business_id, activation_state')
    .eq('organization_id', org.organizationId)
    .maybeSingle()
  if (profileError) throw profileError

  const businessId = (profile?.business_id as string | null) ?? null
  const { data: agent, error: agentError } = businessId
    ? await supabase
        .from('ai_agents')
        .select('id')
        .eq('organization_id', org.organizationId)
        .eq('business_id', businessId)
        .eq('status', 'active')
        .order('created_at', { ascending: true })
        .limit(1)
        .maybeSingle()
    : { data: null, error: null }
  if (agentError) throw agentError

  const reply = await tryAgentReply({
    supabase,
    organizationId: org.organizationId,
    agentId: (agent?.id as string | undefined) ?? null,
    message,
  })

  return {
    outcome: withReplyTestCheck(structuralOutcome, reply.status),
    reply,
    activationState: String(profile?.activation_state ?? 'workspace_ready'),
  }
}

function persistedSmokeResult(
  outcome: SmokeTestOutcome,
  reply: ReplyTestResult,
  message: string
) {
  return {
    ...outcome,
    reply,
    testMessage: message.trim(),
  }
}

/** The audit trail must record setup decisions, but it must never break the setup itself. */
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

function validTimezone(value: string | undefined): string | null {
  const zone = value?.trim()
  if (!zone || zone.length > 60) return null
  try {
    new Intl.DateTimeFormat('en-US', { timeZone: zone })
    return zone
  } catch {
    return null
  }
}

/**
 * Stage 1 — ابدأ.
 *
 * Autosaved as the customer types and saved again by the primary action. Everything the
 * plan calls "safe defaults" is accepted here (timezone from the browser when the profile
 * still has none), and nothing optional blocks the stage from completing.
 */
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

    const timezone = validTimezone(input.timezone)

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
    if (timezone && (!profile?.timezone || profile.timezone === 'UTC')) profilePatch.timezone = timezone

    if (businessTypeId && businessTypeId !== profile?.business_type_id) {
      // applyBusinessType also re-seeds the organization's capabilities from the type's
      // defaults, so switching the type here keeps modules consistent with the choice.
      await applyBusinessType(supabase, org.organizationId, businessTypeId)
    }

    const { error: profileUpdateError } = await supabase
      .from('business_profiles')
      .update(profilePatch)
      .eq('organization_id', org.organizationId)
    if (profileUpdateError) return { ok: false, error: supabaseActionError(profileUpdateError) }

    if (businessId) {
      const { error: businessError } = await supabase
        .from('businesses')
        .update({ name, ...(timezone ? { timezone } : {}) })
        .eq('id', businessId)
      if (businessError) return { ok: false, error: supabaseActionError(businessError) }
    }

    // The header and selectors read the organization name, so a rename belongs in both
    // places; a failure here is not worth blocking the save over.
    if (name !== org.organizationName) {
      const { error: orgError } = await supabase
        .from('organizations')
        .update({ name })
        .eq('id', org.organizationId)
      if (orgError) console.error('Unable to rename organization', orgError)
    }

    revalidatePath('/onboarding')
    revalidatePath('/dashboard')
    return { ok: true, message: 'تم الحفظ.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر الحفظ. حاول مرة أخرى.') }
  }
}

/**
 * Moves between the four stages.
 *
 * The activation state is derived on the server from the stage being entered and the
 * stored smoke-test result; `active` stays unreachable from here so only
 * activateAccountAction() can activate a tenant.
 */
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

/**
 * Stage 2 — the WhatsApp connection.
 *
 * The customer supplies their own number; the provider identifier is resolved server-side
 * (lib/channels/connect-service.ts). A connection that could not be verified is stored as
 * pending and reported as such, with a retry that repeats this same call.
 */
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
        // Entitlements still apply, but the message explains the situation instead of
        // quoting a plan limit the customer has never seen.
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

    // Keep the profile's public number in step with the channel the customer entered.
    if (!profile?.public_phone_number) {
      await supabase
        .from('business_profiles')
        .update({ public_phone_number: normalizeChannelNumber(input.phoneNumber) })
        .eq('organization_id', org.organizationId)
    }

    await auditSetup(
      org.organizationId,
      (profile?.business_id as string | null) ?? null,
      'channel.whatsapp_connect_requested',
      'channel',
      null,
      { status: result.outcome.status, reason: result.outcome.reason }
    )

    revalidatePath('/onboarding')
    revalidatePath('/dashboard/channels')
    return { ok: true, message: result.outcome.message }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'لم يكتمل ربط واتساب. حاول مرة أخرى.') }
  }
}

/**
 * Stage 3 — generates the draft from the owner's description.
 *
 * Generation is read-only: nothing is written until the customer reviews the draft and
 * accepts it, so a bad draft cannot silently become configuration.
 */
export async function generateAgentSetupAction(input: {
  description: string
}): Promise<OnboardingResult & { result?: SetupDraftResult }> {
  try {
    const org = await requireOnboardingAdmin()
    const description = input.description?.trim() ?? ''
    if (description.length < 10) {
      return { ok: false, error: 'اكتب وصفاً قصيراً لنشاطك (10 أحرف على الأقل).' }
    }
    if (description.length > 1400) {
      return { ok: false, error: 'الوصف طويل جدًا. اختصره في بضع جمل.' }
    }

    const result = await generateAgentSetupDraft({
      description,
      businessName: org.organizationName,
    })
    return { ok: true, result }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تجهيز الوكيل. حاول مرة أخرى.') }
  }
}

/** Saves the owner's raw description draft without publishing it to the agent prompt. */
export async function saveAgentSetupDescriptionAction(input: {
  description: string
}): Promise<OnboardingResult> {
  try {
    const org = await requireOnboardingAdmin()
    const description = input?.description
    if (typeof description !== 'string') {
      return { ok: false, error: 'اكتب وصف النشاط بصيغة صحيحة.' }
    }
    if (description.length > 1400) {
      return { ok: false, error: 'الوصف طويل جدًا. اختصره في بضع جمل.' }
    }

    const supabase = await createClient()
    const { error } = await supabase
      .from('business_profiles')
      .update({ setup_description: description })
      .eq('organization_id', org.organizationId)
    if (error) return { ok: false, error: supabaseActionError(error) }

    await auditSetup(
      org.organizationId,
      null,
      'agent.setup_description_saved',
      'business_profile',
      null,
      { description_length: description.length }
    )

    revalidatePath('/onboarding')
    return { ok: true, message: 'تم حفظ الوصف.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حفظ الوصف. حاول مرة أخرى.') }
  }
}

/**
 * Saves the reviewed draft: the agent's name, the published instruction block and the
 * owner's own description. The prompt is rebuilt from the validated draft here, so what is
 * stored never depends on what the browser sent beyond the allowed fields.
 */
export async function saveAgentSetupAction(input: {
  draft: unknown
}): Promise<OnboardingResult> {
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

    await auditSetup(
      org.organizationId,
      (profile?.business_id as string | null) ?? null,
      'agent.setup_saved',
      'ai_agent',
      agent?.id ?? null,
      { services: draft.services.length, style: draft.replyStyle, handoff: draft.handoff }
    )

    revalidatePath('/onboarding')
    revalidatePath('/dashboard/agent')
    return { ok: true, message: 'تم اعتماد إعداد الوكيل.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حفظ إعداد الوكيل.') }
  }
}

/**
 * Stage 4 — the guided test.
 *
 * The checks are the same production checks Go Live re-runs; the customer-facing labels are
 * added by the UI. The result is stored so a reload shows the same outcome.
 */
export async function runActivationTestAction(input?: {
  message?: string
}): Promise<
  OnboardingResult & { outcome?: SmokeTestOutcome; reply?: ReplyTestResult }
> {
  try {
    const org = await requireOnboardingAdmin()
    const supabase = await createClient()
    const message = input?.message ?? 'السلام عليكم، أريد حجز موعد.'
    const { outcome, reply, activationState } = await runActivationChecks(
      supabase,
      org,
      message
    )
    const storedOutcome = persistedSmokeResult(outcome, reply, message)

    const { error } = await createAdminClient()
      .from('business_profiles')
      .update({
        smoke_test_status: outcome.passed ? 'passed' : 'failed',
        smoke_test_result: storedOutcome,
        activation_state: stateAfterActivationTest({
          currentState: activationState,
          passed: outcome.passed,
        }),
        activation_step: stepAfterActivationTest({ currentState: activationState }),
      })
      .eq('organization_id', org.organizationId)
    if (error) return { ok: false, error: supabaseActionError(error) }

    revalidatePath('/onboarding')
    return {
      ok: outcome.passed,
      outcome: storedOutcome,
      reply,
      message: outcome.passed ? 'كل شيء جاهز ✅' : 'بعض الخطوات ما زالت ناقصة.',
    }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر إجراء الاختبار. حاول مرة أخرى.') }
  }
}

/**
 * Go Live — server-gated.
 *
 * The stored result is never trusted alone: the checks are re-evaluated here, so a stale
 * "passed" flag cannot activate a tenant that lost its channel or agent.
 */
export async function activateAccountAction(): Promise<
  OnboardingResult & { outcome?: SmokeTestOutcome }
> {
  try {
    const org = await requireOnboardingAdmin()
    const supabase = await createClient()
    const message = 'السلام عليكم، أريد حجز موعد.'
    const { outcome, reply, activationState } = await runActivationChecks(
      supabase,
      org,
      message
    )
    const admin = createAdminClient()
    const storedOutcome = persistedSmokeResult(outcome, reply, message)

    if (!outcome.passed) {
      const { error: saveError } = await admin
        .from('business_profiles')
        .update({
          smoke_test_status: 'failed',
          smoke_test_result: storedOutcome,
          activation_state: stateAfterActivationTest({
            currentState: activationState,
            passed: false,
          }),
        })
        .eq('organization_id', org.organizationId)
      if (saveError) return { ok: false, error: supabaseActionError(saveError), outcome }
      return {
        ok: false,
        error: 'لم يكتمل الإعداد بعد. راجع الخطوات الناقصة ثم أعد الاختبار.',
        outcome: storedOutcome,
      }
    }

    const { data: profile } = await supabase
      .from('business_profiles')
      .select('business_id')
      .eq('organization_id', org.organizationId)
      .maybeSingle()

    const { error } = await admin
      .from('business_profiles')
      .update({
        activation_state: 'active',
        activation_step: 11,
        smoke_test_status: 'passed',
        smoke_test_result: storedOutcome,
      })
      .eq('organization_id', org.organizationId)
    if (error) return { ok: false, error: supabaseActionError(error) }

    await auditSetup(
      org.organizationId,
      (profile?.business_id as string | null) ?? null,
      'tenant.activated',
      'organization',
      org.organizationId,
      { source: 'fastpath' }
    )

    revalidatePath('/dashboard')
    revalidatePath('/onboarding')
    return { ok: true, message: 'تم تشغيل نشاطك 🎉' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تشغيل النشاط. حاول مرة أخرى.') }
  }
}
