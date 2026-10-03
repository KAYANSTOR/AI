import { Suspense } from 'react'
import { redirect } from 'next/navigation'
import { Bot } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { TOOL_POLICIES } from '@/lib/ai/registry'
import type { AgentConsoleData } from './agent-console'
import { AgentTrainer } from './agent-trainer'
import { calculateAgentReadiness } from '@/lib/ai/readiness'
import { ar } from '@/lib/i18n/ar'

export const dynamic = 'force-dynamic'

export default async function AgentPage() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')

  const supabase = await createClient()

  if (!context.businessId) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-text">وكيل الذكاء الاصطناعي</h1>
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          لا يوجد نشاط مُهيّأ لهذه الشركة بعد.{' '}
          <Link href="/onboarding" className="font-semibold underline">
            أكمل إعداد النشاط
          </Link>{' '}
          ليتم إنشاء الوكيل تلقائيًا.
        </p>
      </div>
    )
  }

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('id', context.businessId)
    .eq('organization_id', context.organizationId)
    .maybeSingle()

  if (!business) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-text">وكيل الذكاء الاصطناعي</h1>
        <p className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-text">
          تعذّر تحميل النشاط الحالي.
        </p>
      </div>
    )
  }

  const { data: agent, error: agentError } = await supabase
    .from('ai_agents')
    .select('id, name, locale, temperature, status, business_id')
    .eq('business_id', business.id)
    .eq('organization_id', context.organizationId)
    .neq('status', 'archived')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (agentError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-text">وكيل الذكاء الاصطناعي</h1>
        <p className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-text">
          {ar.errors.load}
        </p>
      </div>
    )
  }

  if (!agent) redirect('/onboarding')

  return (
    <div className="space-y-6">
      {/* 0ms Instant Header */}
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light/40">
          <Bot size={22} className="text-primary-dark" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">وكيل الذكاء الاصطناعي</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            مركز تدريب وتجهيز واختبار الوكيل الذكي لنشاط «{business.name}».
          </p>
        </div>
      </header>

      {/* Streamed Trainer & Readiness Console */}
      <Suspense fallback={<AgentTrainerSkeleton />}>
        <AgentTrainerSection
          organizationId={context.organizationId}
          businessName={business.name}
          enabledCapabilities={context.enabledCapabilities}
          agentId={agent.id}
          agentName={agent.name}
          agentLocale={agent.locale}
          agentTemperature={agent.temperature}
          agentStatus={agent.status}
        />
      </Suspense>
    </div>
  )
}

async function AgentTrainerSection({
  organizationId,
  businessName,
  enabledCapabilities,
  agentId,
  agentName,
  agentLocale,
  agentTemperature,
  agentStatus,
}: {
  organizationId: string
  businessName: string
  enabledCapabilities: string[]
  agentId: string
  agentName: string | null
  agentLocale: string | null
  agentTemperature: number | null
  agentStatus: string | null
}) {
  const supabase = await createClient()
  const enabled = new Set(enabledCapabilities)

  const [readiness, { data: profile }, { data: versions }, { data: policies }] = await Promise.all([
    calculateAgentReadiness(supabase, organizationId),
    supabase
      .from('business_profiles')
      .select('business_type_id, industry, setup_description, public_phone_number, system_prompt_addition')
      .eq('organization_id', organizationId)
      .maybeSingle(),
    supabase
      .from('agent_prompt_versions')
      .select('version, status, published_at, system_prompt_addition')
      .eq('agent_id', agentId)
      .order('version', { ascending: false }),
    supabase
      .from('agent_tool_policies')
      .select('tool_name, is_allowed, requires_confirmation')
      .eq('agent_id', agentId),
  ])

  const policyByTool = new Map(
    (policies ?? []).map((row) => [
      row.tool_name as string,
      row as { is_allowed: boolean; requires_confirmation: boolean },
    ])
  )
  const published = (versions ?? []).find((row) => row.status === 'published') ?? null

  const data: AgentConsoleData = {
    agentId,
    name: agentName ?? 'FrontDesk',
    locale: agentLocale ?? 'ar',
    temperature: Number(agentTemperature ?? 0.2),
    status: agentStatus ?? 'active',
    modelProvider: 'Gemini API (Google AI Studio)',
    publishedVersion: published?.version ?? null,
    publishedInstructions: published?.system_prompt_addition ?? '',
    versions: (versions ?? []).map((row) => ({
      version: row.version as number,
      status: row.status as string,
      publishedAt: (row.published_at as string | null) ?? null,
      characters: ((row.system_prompt_addition as string | null) ?? '').length,
    })),
    tools: Object.values(TOOL_POLICIES).map((policy) => {
      const override = policyByTool.get(policy.name)
      return {
        policy,
        isAllowed: override ? Boolean(override.is_allowed) : true,
        requiresConfirmation: override
          ? Boolean(override.requires_confirmation)
          : policy.requiresConfirmation,
        capabilityEnabled: policy.capability === null || enabled.has(policy.capability),
      }
    }),
  }

  return (
    <AgentTrainer
      agentId={agentId}
      businessName={businessName}
      initialReadiness={readiness}
      consoleData={data}
      initialProfile={{
        businessTypeId: profile?.business_type_id ?? '',
        industry: profile?.industry ?? '',
        setupDescription: profile?.setup_description ?? '',
        publicPhoneNumber: profile?.public_phone_number ?? '',
        systemPromptAddition: profile?.system_prompt_addition ?? '',
      }}
    />
  )
}

function AgentTrainerSkeleton() {
  return (
    <div className="grid grid-cols-1 gap-6 lg:grid-cols-3 animate-pulse">
      <div className="space-y-5 lg:col-span-2">
        <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
          <div className="h-6 w-36 rounded bg-border" />
          <div className="space-y-2">
            <div className="h-4 w-full rounded bg-border/50" />
            <div className="h-4 w-4/5 rounded bg-border/50" />
          </div>
          <div className="h-28 rounded-xl bg-border/30" />
        </div>
        <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
          <div className="h-6 w-40 rounded bg-border" />
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="h-20 rounded-xl bg-border/30" />
            ))}
          </div>
        </div>
      </div>
      <div className="rounded-2xl border border-border bg-surface p-5 space-y-4">
        <div className="h-6 w-28 rounded bg-border" />
        <div className="h-80 rounded-xl bg-border/20" />
        <div className="h-11 rounded-xl bg-border/40" />
      </div>
    </div>
  )
}
