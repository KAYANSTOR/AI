import { redirect } from 'next/navigation'
import { createClient } from '@/lib/db/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { TOOL_POLICIES } from '@/lib/ai/registry'
import { calculateAgentReadiness } from '@/lib/ai/readiness'
import type { AgentConsoleData } from './agent-console'

export async function loadAgentContext() {
  const context = await getDashboardContext()
  if (!context) redirect('/login')
  if (!context.businessId) return { kind: 'no_business' as const, context }

  const db = await createClient()
  const { data: business } = await db
    .from('businesses')
    .select('id, name')
    .eq('id', context.businessId)
    .eq('organization_id', context.organizationId)
    .maybeSingle()

  if (!business) return { kind: 'no_business' as const, context }

  const { data: agent, error: agentError } = await db
    .from('ai_agents')
    .select('id, name, locale, temperature, status, business_id, model_provider')
    .eq('business_id', business.id)
    .eq('organization_id', context.organizationId)
    .neq('status', 'archived')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (agentError) return { kind: 'error' as const, context }
  if (!agent) redirect('/onboarding')

  const agentId = agent.id as string
  const businessName = (business.name as string) || 'نشاطك'

  const [
    readiness,
    { data: published },
    { data: versions },
    { data: toolRows },
    { data: profile },
    { count: conversationCount },
  ] = await Promise.all([
    calculateAgentReadiness(db, context.organizationId),
    db
      .from('agent_prompt_versions')
      .select('version, system_prompt_addition, published_at, status')
      .eq('agent_id', agentId)
      .eq('status', 'published')
      .order('version', { ascending: false })
      .limit(1)
      .maybeSingle(),
    db
      .from('agent_prompt_versions')
      .select('version, status, published_at, system_prompt_addition')
      .eq('agent_id', agentId)
      .order('version', { ascending: false })
      .limit(12),
    db
      .from('agent_tool_policies')
      .select('tool_name, is_allowed, requires_confirmation')
      .eq('agent_id', agentId),
    db
      .from('business_profiles')
      .select(
        'business_type_id, industry, setup_description, public_phone_number, system_prompt_addition'
      )
      .eq('organization_id', context.organizationId)
      .maybeSingle(),
    db
      .from('conversations')
      .select('id', { count: 'exact', head: true })
      .eq('organization_id', context.organizationId),
  ])

  const enabled = new Set(context.enabledCapabilities ?? [])
  const policyByTool = new Map(
    (toolRows ?? []).map((r) => [r.tool_name as string, r] as const)
  )

  const consoleData: AgentConsoleData = {
    agentId,
    name: agent.name as string,
    locale: (agent.locale as string) || 'ar',
    temperature: Number(agent.temperature ?? 0.3),
    status: (agent.status as string) || 'draft',
    modelProvider: (agent.model_provider as string) || 'gemini',
    publishedVersion: (published?.version as number | null) ?? null,
    publishedInstructions: (published?.system_prompt_addition as string) ?? '',
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

  return {
    kind: 'ok' as const,
    context,
    agentId,
    businessName,
    readiness,
    consoleData,
    conversationCount: conversationCount ?? 0,
    initialProfile: {
      businessTypeId: profile?.business_type_id ?? '',
      industry: profile?.industry ?? '',
      setupDescription: profile?.setup_description ?? '',
      publicPhoneNumber: profile?.public_phone_number ?? '',
      systemPromptAddition: profile?.system_prompt_addition ?? '',
    },
  }
}
