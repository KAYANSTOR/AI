import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { stageForStoredStep } from '@/lib/onboarding/stages'
import { describeChannelState, type ChannelConnectionState } from '@/lib/channels/connect'
import type { SmokeTestOutcome } from '@/lib/onboarding/smoke-test'
import { FastPath, type FastPathData } from './fastpath'

/** The FastPath reads the tenant's own activation state: never prerender it. */
export const dynamic = 'force-dynamic'

type ChannelRow = {
  channel_type: string
  provider_account_id: string | null
  external_identifier: string | null
  verification_status: string | null
  is_active: boolean | null
}

function asSmokeOutcome(value: unknown): SmokeTestOutcome | null {
  const candidate = value as SmokeTestOutcome | null
  if (!candidate || typeof candidate !== 'object' || !Array.isArray(candidate.checks)) return null
  return candidate
}

export default async function OnboardingPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const supabase = await createClient()

  const [profileResult, businessResult, channelsResult, phoneResult, agentResult] = await Promise.all([
    supabase
      .from('business_profiles')
      .select(
        'business_id, business_type_id, public_phone_number, timezone, setup_description, system_prompt_addition, smoke_test_result'
      )
      .eq('organization_id', context.organizationId)
      .maybeSingle(),
    supabase
      .from('businesses')
      .select('name')
      .eq('organization_id', context.organizationId)
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    supabase
      .from('channels')
      .select('channel_type, provider_account_id, external_identifier, verification_status, is_active')
      .eq('organization_id', context.organizationId),
    supabase
      .from('phone_connections')
      .select('existing_phone_number, forwarding_status')
      .eq('organization_id', context.organizationId)
      .maybeSingle(),
    supabase
      .from('ai_agents')
      .select('id, name, status')
      .eq('organization_id', context.organizationId)
      .neq('status', 'archived')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
  ])

  if (profileResult.error) {
    console.error('Onboarding: unable to load business profile', profileResult.error)
  }

  const profile = profileResult.data
  const channels = (channelsResult.data ?? []) as ChannelRow[]
  const whatsappRow = channels.find((row) => row.channel_type === 'whatsapp') ?? null
  const phoneRow = channels.find((row) => row.channel_type === 'phone') ?? null
  const phoneConnection = phoneResult.data

  const activeAgent = agentResult.data

  const whatsappState: ChannelConnectionState = describeChannelState(
    whatsappRow
      ? {
          verification_status: whatsappRow.verification_status,
          is_active: whatsappRow.is_active,
        }
      : null
  )
  const phoneState: ChannelConnectionState = describeChannelState(
    phoneRow
      ? {
          verification_status: phoneRow.verification_status,
          is_active: phoneRow.is_active,
        }
      : null
  )

  const savedDescription = (profile?.setup_description as string | null) ?? ''
  const hasSavedAgentSetup = Boolean(
    (profile?.system_prompt_addition as string | null) || savedDescription
  )

  const data: FastPathData = {
    organizationName: context.organizationName,
    businessName: businessResult.data?.name ?? context.organizationName,
    businessTypeId: context.businessTypeId ?? 'appointments',
    publicPhone: (profile?.public_phone_number as string | null) ?? '',
    timezone: context.timezone,
    smokeTestResult: asSmokeOutcome(profile?.smoke_test_result),
    initialReply: null,
    connect: {
      whatsapp: whatsappRow
        ? { state: whatsappState, number: whatsappRow.external_identifier ?? null }
        : null,
      phone: phoneRow || phoneConnection
        ? {
            state: phoneState,
            publicNumber:
              phoneRow?.external_identifier ?? phoneConnection?.existing_phone_number ?? null,
            forwardingStatus: phoneConnection?.forwarding_status ?? null,
          }
        : null,
    },
    agent: activeAgent
      ? { name: (activeAgent.name as string) ?? '', status: (activeAgent.status as string) ?? '' }
      : null,
    savedDescription,
    hasSavedAgentSetup,
    canManage: context.role === 'owner' || context.role === 'admin',
  }

  return <FastPath initialStage={stageForStoredStep(context.activationStep)} data={data} />
}
