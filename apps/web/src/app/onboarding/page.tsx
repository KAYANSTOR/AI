import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { FastPath } from './fastpath'
import { stageForStoredStep } from '@/lib/onboarding/stages'
import type { SmokeTestOutcome } from '@/lib/onboarding/smoke-test'
import type { ReplyTestResult } from '@/lib/onboarding/reply-test'
import { describeChannelState } from '@/lib/channels/connect'

export const metadata: Metadata = {
  title: 'إعداد النشاط وتشغيل الوكيل | Kayan AI',
  robots: { index: false, follow: false, noarchive: true, nosnippet: true },
}

export const dynamic = 'force-dynamic'

export default async function OnboardingPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  const db = await createClient()

  const { data: profile, error: profileError } = await db
    .from('business_profiles')
    .select('business_id, business_type_id, timezone, public_phone_number, activation_step, activation_state, setup_description, system_prompt_addition, smoke_test_result')
    .eq('organization_id', context.organizationId)
    .maybeSingle()

  if (profileError) {
    console.error('Unable to load onboarding profile', profileError)
    throw new Error('تعذّر تحميل حالة إعداد النشاط. حاول تحديث الصفحة.')
  }

  const businessId = (profile?.business_id as string | null) ?? context.businessId
  const [businessResult, channelResult, agentResult] = await Promise.all([
    businessId
      ? db.from('businesses').select('name').eq('id', businessId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    db.from('channels')
      .select('id, channel_type, verification_status, external_identifier, is_active')
      .eq('organization_id', context.organizationId)
      .eq('channel_type', 'whatsapp')
      .maybeSingle(),
    db.from('ai_agents')
      .select('id, name, status')
      .eq('organization_id', context.organizationId)
      .neq('status', 'archived')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  if (businessResult.error || channelResult.error || agentResult.error) {
    console.error('Unable to load onboarding stage data', {
      business: businessResult.error,
      channel: channelResult.error,
      agent: agentResult.error,
    })
    throw new Error('تعذّر تحميل بعض بيانات الإعداد. حاول تحديث الصفحة.')
  }

  const channel = channelResult.data
  const channelState = channel ? describeChannelState(channel) : null
  const storedTest = profile?.smoke_test_result && typeof profile.smoke_test_result === 'object'
    ? profile.smoke_test_result as Record<string, unknown>
    : null
  const rawChecks = Array.isArray(storedTest?.checks) ? storedTest.checks : null
  const initialOutcome: SmokeTestOutcome | null = storedTest && rawChecks
    ? {
        passed: storedTest.passed === true,
        status: storedTest.status === 'passed' ? 'passed' : 'failed',
        summary: String(storedTest.summary ?? ''),
        testedAt: String(storedTest.testedAt ?? ''),
        checks: rawChecks as SmokeTestOutcome['checks'],
      }
    : null
  const rawReply = storedTest?.reply && typeof storedTest.reply === 'object'
    ? storedTest.reply as Record<string, unknown>
    : null
  const initialReply: ReplyTestResult | null = rawReply && ['answered', 'skipped', 'failed'].includes(String(rawReply.status))
    ? {
        status: rawReply.status as ReplyTestResult['status'],
        reply: typeof rawReply.reply === 'string' ? rawReply.reply : undefined,
        message: String(rawReply.message ?? ''),
      }
    : null

  return (
    <main className="mx-auto w-full max-w-3xl space-y-7 px-1 py-2">
      <header className="text-center">
        <p className="text-sm font-bold text-primary">Kayan AI</p>
        <h1 className="mt-2 text-2xl font-bold text-text sm:text-3xl">جهّز نشاطك وشغّل وكيلك</h1>
        <p className="mt-2 text-sm leading-6 text-text-muted">رحلة واحدة من تعريف النشاط إلى ربط القناة وإعداد الوكيل واختباره قبل التشغيل.</p>
      </header>
      <FastPath
        initialStage={stageForStoredStep(Number(profile?.activation_step ?? 1))}
        data={{
          organizationName: context.organizationName,
          businessName: String(businessResult.data?.name ?? context.organizationName),
          businessTypeId: String(profile?.business_type_id ?? context.businessTypeId ?? ''),
          publicPhone: String(profile?.public_phone_number ?? ''),
          timezone: String(profile?.timezone && profile.timezone !== 'UTC' ? profile.timezone : 'Asia/Aden'),
          smokeTestResult: initialOutcome,
          initialReply,
          initialTestMessage: typeof storedTest?.testMessage === 'string' ? storedTest.testMessage : null,
          connect: {
            whatsapp: channel && channelState
              ? { state: channelState, number: String(channel.external_identifier ?? '') || null }
              : null,
            phone: null,
          },
          agent: agentResult.data
            ? { name: String(agentResult.data.name), status: String(agentResult.data.status) }
            : null,
          savedDescription: String(profile?.setup_description ?? ''),
          hasSavedAgentSetup: Boolean(profile?.setup_description && profile?.system_prompt_addition),
          canManage: context.role === 'owner' || context.role === 'admin',
          completed: {
            basics: Boolean(profile?.business_type_id),
            connect: Boolean(channel?.is_active && channel.verification_status === 'verified'),
            agent: Boolean(agentResult.data?.status === 'active' && profile?.setup_description && profile?.system_prompt_addition),
            test: Boolean(initialOutcome?.passed && initialReply?.status === 'answered'),
          },
        }}
      />
    </main>
  )
}
