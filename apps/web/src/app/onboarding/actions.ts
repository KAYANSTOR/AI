'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/db/server'
import { createAdminClient } from '@/lib/db/admin'
import { getCurrentOrg, type OrgContext } from '@/lib/org'
import { actionErrorMessage, dbActionError } from '@/lib/i18n/action-error'
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
import { buildBusinessSystemPrompt } from '@/lib/ai/prompt'
import { selectBusinessAgent } from '@/lib/runtime/business-agent'
import { activationFingerprint, readActivationEvidence } from '@/lib/onboarding/activation-evidence'
import { normalizeChannelNumber } from '@/lib/channels/management'
import {
  buildPromptAddition,
  generateAgentSetupDraft,
  parseAgentSetupDraft,
  type SetupDraftResult,
} from '@/lib/ai/setup-draft'
import { guardAiAction } from '@/lib/ai/usage-guard'

export type OnboardingResult = { ok: boolean; error?: string; message?: string }

async function requireOnboardingAdmin(): Promise<OrgContext> {
  const org = await getCurrentOrg()
  if (!org) throw new Error('الجلسة منتهية. سجّل الدخول من جديد.')
  if (org.role !== 'owner' && org.role !== 'admin') {
    throw new Error('إعداد النشاط متاح لمالك النشاط أو المسؤول فقط.')
  }
  return org
}

async function loadActivationContext(
  db: Awaited<ReturnType<typeof createClient>>,
  org: OrgContext
) {
  const { data: profile, error } = await db
    .from('business_profiles')
    .select('business_id, activation_state, smoke_test_status, smoke_test_result, updated_at')
    .eq('organization_id', org.organizationId)
    .maybeSingle()
  if (error) throw error
  const businessId = typeof profile?.business_id === 'string' ? profile.business_id : null
  const agent = businessId ? await selectBusinessAgent(db, org.organizationId, businessId) : null
  const system = agent ? await buildBusinessSystemPrompt(db, org.organizationId, String(agent.id)) : null
  const fingerprint = agent && businessId && system ? activationFingerprint({
    organizationId: org.organizationId,
    businessId,
    agentId: String(agent.id),
    provider: String(agent.model_provider ?? ''),
    model: process.env.GEMINI_MODEL?.trim() || 'gemini-3.1-flash-lite-preview',
    locale: String(agent.locale ?? ''),
    temperature: String(agent.temperature ?? ''),
    system,
    name: String(agent.name ?? ''),
  }) : ''
  return { profile, businessId, system, fingerprint, activationState: String(profile?.activation_state ?? 'workspace_ready') }
}

async function runActivationChecks(
  db: Awaited<ReturnType<typeof createClient>>,
  org: OrgContext,
  message: string
) {
  const [structuralOutcome, context] = await Promise.all([evaluateSmokeTest(db, org), loadActivationContext(db, org)])
  const blocked = context.system && process.env.GEMINI_API_KEY
    ? await guardAiAction({ organizationId: org.organizationId, userId: org.userId, route: 'reply_test' })
    : null
  const reply: ReplyTestResult = !context.system
    ? { status: 'failed', message: 'لا يوجد وكيل نشط لهذا النشاط. أكمل إعداد الوكيل أولاً.' }
    : blocked ? { status: 'failed', message: blocked } : await tryAgentReply({ system: context.system, message })
  return {
    outcome: { ...withReplyTestCheck(structuralOutcome, reply.status), testedAt: new Date().toISOString() },
    reply,
    activationState: context.activationState,
    fingerprint: context.fingerprint,
    businessId: context.businessId,
    profileUpdatedAt: context.profile?.updated_at,
  }
}

function persistedSmokeResult(
  outcome: SmokeTestOutcome,
  reply: ReplyTestResult,
  message: string,
  fingerprint: string
) {
  return { ...outcome, reply, testMessage: message.trim(), fingerprint }
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

export async function saveBasicsAction(input: {
  name: string
  businessTypeId?: string
  phone?: string
  timezone?: string
  city?: string
  websiteUrl?: string
}): Promise<OnboardingResult> {
  try {
    const org = await requireOnboardingAdmin()
    const name = input.name?.trim()
    if (name.length < 2) return { ok: false, error: 'اكتب اسم النشاط (حرفان على الأقل).' }
    if (name.length > 120) return { ok: false, error: 'اسم النشاط طويل جدًا.' }
    const city = input.city?.trim() ?? ''
    if (city.length > 120) return { ok: false, error: 'اسم المدينة طويل جدًا.' }
    const websiteUrl = input.websiteUrl?.trim() ?? ''
    if (websiteUrl) {
      try {
        const parsedUrl = new URL(websiteUrl)
        if (!['http:', 'https:'].includes(parsedUrl.protocol) || parsedUrl.username || parsedUrl.password) {
          return { ok: false, error: 'اكتب رابطاً يبدأ بـ https:// أو http://.' }
        }
      } catch {
        return { ok: false, error: 'اكتب رابط موقع صحيحاً.' }
      }
    }
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
    const db = await createClient()
    const { data: profile, error: profileError } = await db
      .from('business_profiles')
      .select('business_id, business_type_id, timezone, public_phone_number')
      .eq('organization_id', org.organizationId)
      .maybeSingle()
    if (profileError) return { ok: false, error: dbActionError(profileError) }
    const businessId = (profile?.business_id as string | null) ?? null
    const profilePatch: Record<string, unknown> = {
      updated_at: new Date().toISOString(),
    }
    if (input.phone !== undefined) profilePatch.public_phone_number = publicPhone
    if (timezone && (!profile?.timezone || profile.timezone === 'UTC')) profilePatch.timezone = timezone
    if (businessTypeId && businessTypeId !== profile?.business_type_id) {
      await applyBusinessType(db, org.organizationId, businessTypeId)
    }
    const { error: profileUpdateError } = await db
      .from('business_profiles')
      .update(profilePatch)
      .eq('organization_id', org.organizationId)
    if (profileUpdateError) return { ok: false, error: dbActionError(profileUpdateError) }
    if (businessId) {
      const { error: businessError } = await db
        .from('businesses')
        .update({
          name,
          city: city || null,
          website_url: websiteUrl || null,
          ...(timezone ? { timezone } : {}),
        })
        .eq('id', businessId)
      if (businessError) return { ok: false, error: dbActionError(businessError) }
    }
    if (name !== org.organizationName) {
      const { error: orgError } = await db
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

export async function saveOnboardingStepAction(step: number): Promise<OnboardingResult> {
  try {
    const org = await requireOnboardingAdmin()
    if (!Number.isInteger(step) || step < 1 || step > 4) {
      return { ok: false, error: 'خطوة إعداد غير صالحة.' }
    }
    const db = await createClient()
    const { error } = await db
      .from('business_profiles')
      .update({ onboarding_step: step, updated_at: new Date().toISOString() })
      .eq('organization_id', org.organizationId)
    if (error) return { ok: false, error: dbActionError(error) }
    revalidatePath('/onboarding')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حفظ تقدم الإعداد.') }
  }
}

export async function advanceStageAction(stage: number): Promise<OnboardingResult> {
  try {
    const org = await requireOnboardingAdmin()
    if (!isOnboardingStage(stage)) return { ok: false, error: 'مرحلة غير معروفة.' }
    const db = await createClient()
    const { data: profile, error: readError } = await db
      .from('business_profiles')
      .select('activation_state, smoke_test_status')
      .eq('organization_id', org.organizationId)
      .maybeSingle()
    if (readError) return { ok: false, error: dbActionError(readError) }
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
    if (error) return { ok: false, error: dbActionError(error) }
    revalidatePath('/onboarding')
    revalidatePath('/dashboard')
    return { ok: true }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحديث المرحلة.') }
  }
}

export async function connectWhatsAppAction(input: { phoneNumber: string }): Promise<OnboardingResult> {
  try {
    const org = await requireOnboardingAdmin()
    const db = await createClient()
    const { data: profile } = await db
      .from('business_profiles')
      .select('business_id, public_phone_number')
      .eq('organization_id', org.organizationId)
      .maybeSingle()
    const { data: existing, error: existingError } = await db
      .from('channels')
      .select('id')
      .eq('organization_id', org.organizationId)
      .eq('channel_type', 'whatsapp')
      .limit(1)
    if (existingError) throw existingError
    if (!(existing ?? []).length) {
      const { count } = await db
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
      db,
      organizationId: org.organizationId,
      businessId: (profile?.business_id as string | null) ?? null,
      number: input.phoneNumber,
    })
    if (!result.ok) return { ok: false, error: result.error }
    if (!profile?.public_phone_number) {
      await db
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
    if (process.env.GEMINI_API_KEY) {
      const blocked = await guardAiAction({ organizationId: org.organizationId, userId: org.userId, route: 'setup_draft' })
      if (blocked) return { ok: false, error: blocked }
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
    const db = await createClient()
    const { error } = await db
      .from('business_profiles')
      .update({ setup_description: description })
      .eq('organization_id', org.organizationId)
    if (error) return { ok: false, error: dbActionError(error) }
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

export async function saveAgentSetupAction(input: {
  draft: unknown
}): Promise<OnboardingResult> {
  try {
    const org = await requireOnboardingAdmin()
    const db = await createClient()
    const { data: profile, error: profileError } = await db
      .from('business_profiles')
      .select('business_id, setup_description')
      .eq('organization_id', org.organizationId)
      .maybeSingle()
    if (profileError) return { ok: false, error: dbActionError(profileError) }
    const businessId = typeof profile?.business_id === 'string' ? profile.business_id : null
    if (!businessId) return { ok: false, error: 'أكمل بيانات النشاط قبل إعداد الوكيل.' }
    const { draft } = parseAgentSetupDraft(input.draft, org.organizationName + ' AI')
    const promptAddition = buildPromptAddition(draft, org.organizationName + ' AI')
    const agent = await selectBusinessAgent(db, org.organizationId, businessId, false)
    if (!agent) {
      const { data: created, error: createError } = await db
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
      if (createError) return { ok: false, error: dbActionError(createError) }
      const { error: publishError } = await db.rpc('publish_agent_prompt', {
        p_agent_id: created.id,
        p_system_prompt_addition: promptAddition,
      })
      if (publishError) return { ok: false, error: dbActionError(publishError) }
    } else {
      const { error: nameError } = await db
        .from('ai_agents')
        .update({ name: draft.agentName, temperature: 0.2, status: 'active' })
        .eq('id', agent.id)
      if (nameError) return { ok: false, error: dbActionError(nameError) }
      const { error: publishError } = await db.rpc('publish_agent_prompt', {
        p_agent_id: agent.id,
        p_system_prompt_addition: promptAddition,
      })
      if (publishError) return { ok: false, error: dbActionError(publishError) }
    }
    const { error: descriptionError } = await db
      .from('business_profiles')
      .update({
        setup_description: draft.summary,
        system_prompt_addition: promptAddition,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', org.organizationId)
    if (descriptionError) return { ok: false, error: dbActionError(descriptionError) }
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

export async function runActivationTestAction(input?: {
  message?: string
}): Promise<
  OnboardingResult & { outcome?: SmokeTestOutcome; reply?: ReplyTestResult }
> {
  try {
    const org = await requireOnboardingAdmin()
    const db = await createClient()
    const message = input?.message ?? 'السلام عليكم، أريد حجز موعد.'
    if (typeof message !== 'string' || message.trim().length < 2 || message.length > 2000) {
      return { ok: false, error: 'اكتب رسالة تجريبية من حرفين إلى 2000 حرف.' }
    }
    const { outcome, reply, activationState, fingerprint, businessId, profileUpdatedAt } = await runActivationChecks(db, org, message)
    const versionMs = Date.parse(String(profileUpdatedAt ?? ''))
    if (!businessId || !Number.isFinite(versionMs)) return { ok: false, error: 'أكمل بيانات النشاط أولاً.' }
    const storedOutcome = persistedSmokeResult(outcome, reply, message, fingerprint)
    const { data, error } = await createAdminClient()
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
      .eq('business_id', businessId)
      .gte('updated_at', new Date(versionMs).toISOString())
      .lt('updated_at', new Date(versionMs + 1).toISOString())
      .select('business_id').maybeSingle()
    if (error) return { ok: false, error: dbActionError(error) }
    if (!data) return { ok: false, error: 'تغير النشاط أثناء الاختبار. أعد المحاولة.' }
    revalidatePath('/onboarding')
    return { ok: true, outcome, reply }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تشغيل الاختبار.') }
  }
}

export async function activateAccountAction(): Promise<
  OnboardingResult & { outcome?: SmokeTestOutcome }
> {
  try {
    const org = await requireOnboardingAdmin()
    const db = await createClient()
    const [structural, context] = await Promise.all([evaluateSmokeTest(db, org), loadActivationContext(db, org)])
    const { profile, businessId, fingerprint, activationState } = context
    if (activationState === 'active') return { ok: true, message: 'نشاطك مفعّل بالفعل' }
    const evidence = profile?.smoke_test_status === 'passed' && process.env.GEMINI_API_KEY?.trim()
      ? readActivationEvidence(profile.smoke_test_result, fingerprint)
      : null
    const outcome = withReplyTestCheck(structural, evidence ? 'answered' : 'failed')
    const versionMs = Date.parse(String(profile?.updated_at ?? ''))
    if (!businessId || !profile || !outcome.passed || !evidence || !Number.isFinite(versionMs)) {
      return {
        ok: false,
        error: !evidence
          ? 'انتهت صلاحية اختبار الرد أو تغيرت الإعدادات. أعد الاختبار قبل تشغيل النشاط.'
          : 'لم تكتمل الجاهزية الحالية. راجع القنوات والوكيل ثم أعد الاختبار.',
        outcome,
      }
    }

    // No model request is made here. The protected server-side evidence proves
    // the reply; readiness and the current prompt fingerprint are checked again.
    // Compare-and-set prevents concurrent profile changes from being overwritten.
    const { data, error } = await createAdminClient()
      .from('business_profiles')
      .update({
        activation_state: 'active',
        activation_step: 11,
        smoke_test_status: 'passed',
        smoke_test_result: persistedSmokeResult(
          { ...outcome, testedAt: evidence.testedAt }, evidence.reply, evidence.testMessage, fingerprint
        ),
      })
      .eq('organization_id', org.organizationId)
      .eq('business_id', businessId)
      .eq('smoke_test_status', 'passed')
      .eq('smoke_test_result->>fingerprint', fingerprint)
      .eq('smoke_test_result->>testedAt', evidence.testedAt)
      // The database client serializes timestamps to milliseconds; retain the full
      // matching millisecond rather than comparing a truncated value to microseconds.
      .gte('updated_at', new Date(versionMs).toISOString())
      .lt('updated_at', new Date(versionMs + 1).toISOString())
      .select('business_id')
      .maybeSingle()
    if (error) return { ok: false, error: dbActionError(error) }
    if (!data) return { ok: false, error: 'تغيرت إعدادات النشاط أثناء التفعيل. أعد الاختبار.' }

    await auditSetup(org.organizationId, businessId, 'tenant.activated', 'organization', org.organizationId, { source: 'fastpath' })
    revalidatePath('/dashboard')
    revalidatePath('/onboarding')
    return { ok: true, message: 'تم تشغيل نشاطك' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تشغيل النشاط. حاول مرة أخرى.') }
  }
}
