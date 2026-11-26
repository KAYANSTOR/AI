import type { Metadata } from 'next'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { FastPath } from './fastpath'
import { stageForStoredStep } from '@/lib/onboarding/stages'
import type { SmokeTestOutcome } from '@/lib/onboarding/smoke-test'
import type { ReplyTestResult } from '@/lib/onboarding/reply-test'
import { selectBusinessAgent } from '@/lib/runtime/business-agent'
import { loadOnboardingChannels } from '@/lib/onboarding/channel-readiness'
import { readActivationEvidence } from '@/lib/onboarding/activation-evidence'
import { describeChannelState, selectOnboardingWhatsAppChannel, isOnboardingChannelReady } from '@/lib/channels/connect'

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

  const businessId = (profile?.business_id as string | null) ?? null
  const [businessResult, channels, agent] = await Promise.all([
    businessId
      ? db.from('businesses').select('name').eq('id', businessId).eq('organization_id', context.organizationId).maybeSingle()
      : Promise.resolve({ data: null, error: null }),
    businessId ? loadOnboardingChannels(db, context.organizationId, businessId) : Promise.resolve([]),
    businessId ? selectBusinessAgent(db, context.organizationId, businessId, false) : Promise.resolve(null),
  ])

  if (businessResult.error) {
    console.error('Unable to load onboarding stage data', {
      business: businessResult.error,
    })
    throw new Error('تعذّر تحميل بعض بيانات الإعداد. حاول تحديث الصفحة.')
  }

  const channel = selectOnboardingWhatsAppChannel(channels.filter((row) => row.channel_type === 'whatsapp'))
  const readyOtherChannels = channels.filter((row) => row.channel_type !== 'whatsapp' && isOnboardingChannelReady(row)).length
  const channelState = channel ? describeChannelState(channel) : null
  const storedTest = profile?.smoke_test_result && typeof profile.smoke_test_result === 'object'
    ? profile.smoke_test_result as Record<string, unknown>
    : null
  const rawChecks = Array.isArray(storedTest?.checks) ? storedTest.checks : null
  // This is display-only. Activation validates the current configuration fingerprint on the server.
  const storedProof = typeof storedTest?.fingerprint === 'string'
    ? readActivationEvidence(storedTest, storedTest.fingerprint) : null
  const currentReady = channels.some(isOnboardingChannelReady) && agent?.status === 'active'
  const showStoredTest = storedTest?.passed !== true || Boolean(storedProof && currentReady)
  const initialOutcome: SmokeTestOutcome | null = storedTest && rawChecks && showStoredTest
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
  const initialReply: ReplyTestResult | null = showStoredTest && rawReply && ['answered', 'skipped', 'failed'].includes(String(rawReply.status))
    ? {
        status: rawReply.status as ReplyTestResult['status'],
        reply: typeof rawReply.reply === 'string' ? rawReply.reply : undefined,
        message: String(rawReply.message ?? ''),
      }
    : null

  return (
    <main className="mx-auto w-full max-w-3xl space-y-7 px-1 py-2">
      <header className="text-center">
        <p className="text-sm font-bold text-secondary">Kayan AI</p>
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
              ? { state: channelState, number: String(channel.external_identifier ?? '') || null, mode: channel.connection_mode ?? null }
              : null,
            readyOtherChannels,
          },
          agent: agent
            ? { name: String(agent.name), status: String(agent.status) }
            : null,
          savedDescription: String(profile?.setup_description ?? ''),
          hasSavedAgentSetup: Boolean(profile?.setup_description && profile?.system_prompt_addition),
          canManage: context.role === 'owner' || context.role === 'admin',
          completed: {
            basics: Boolean(profile?.business_type_id),
            connect: channels.some(isOnboardingChannelReady),
            agent: Boolean(agent?.status === 'active' && profile?.setup_description && profile?.system_prompt_addition),
            test: Boolean(initialOutcome?.passed && initialReply?.status === 'answered'),
          },
        }}
      />
    </main>
  )
}
