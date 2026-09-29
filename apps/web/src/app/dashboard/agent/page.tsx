import { redirect } from 'next/navigation'
import { Bot } from 'lucide-react'
import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrg } from '@/lib/org'
import { TOOL_POLICIES } from '@/lib/ai/registry'
import { getEnabledCapabilities } from '@/lib/ai/capabilities'
import { AgentConsole, type AgentConsoleData } from './agent-console'

export const dynamic = 'force-dynamic'

export default async function AgentPage() {
  const org = await getCurrentOrg()
  if (!org) redirect('/login')

  const supabase = await createClient()

  const { data: business } = await supabase
    .from('businesses')
    .select('id, name')
    .eq('organization_id', org.organizationId)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (!business) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-text">الوكيل الذكي</h1>
        <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">
          لا يوجد نشاط مُهيّأ لهذه الشركة بعد.{' '}
          <Link href="/dashboard/setup" className="font-semibold underline">
            أكمل إعداد النشاط
          </Link>{' '}
          ليتم إنشاء الوكيل تلقائيًا.
        </p>
      </div>
    )
  }

  const [{ data: agent, error: agentError }, enabled] = await Promise.all([
    supabase
      .from('ai_agents')
      .select('id, name, locale, temperature, status, model_provider, business_id')
      .eq('business_id', business.id)
      .neq('status', 'archived')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle(),
    getEnabledCapabilities(supabase, org.organizationId),
  ])

  if (agentError) {
    return (
      <div className="space-y-4">
        <h1 className="text-2xl font-bold tracking-tight text-text">الوكيل الذكي</h1>
        <p className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-text">
          تعذّر تحميل الوكيل: {agentError.message}
        </p>
      </div>
    )
  }

  if (!agent) redirect('/dashboard/setup')

  const [{ data: versions }, { data: policies }] = await Promise.all([
    supabase
      .from('agent_prompt_versions')
      .select('version, status, published_at, system_prompt_addition')
      .eq('agent_id', agent.id)
      .order('version', { ascending: false }),
    supabase
      .from('agent_tool_policies')
      .select('tool_name, is_allowed, requires_confirmation')
      .eq('agent_id', agent.id),
  ])

  const policyByTool = new Map(
    (policies ?? []).map((row) => [row.tool_name as string, row as { is_allowed: boolean; requires_confirmation: boolean }])
  )
  const published = (versions ?? []).find((row) => row.status === 'published') ?? null

  const data: AgentConsoleData = {
    agentId: agent.id,
    name: agent.name ?? 'FrontDesk',
    locale: agent.locale ?? 'ar',
    temperature: Number(agent.temperature ?? 0.2),
    status: agent.status ?? 'active',
    modelProvider: agent.model_provider ?? 'anthropic',
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
        // An agent with no stored policy falls back to the registry default, which is
        // exactly what the runtime does.
        isAllowed: override ? Boolean(override.is_allowed) : true,
        requiresConfirmation: override ? Boolean(override.requires_confirmation) : policy.requiresConfirmation,
        capabilityEnabled: policy.capability === null || enabled.has(policy.capability),
      }
    }),
  }

  return (
    <div className="space-y-6">
      <header className="flex items-start gap-3">
        <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-light/40">
          <Bot size={22} className="text-primary-dark" aria-hidden="true" />
        </span>
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">الوكيل الذكي</h1>
          <p className="mt-0.5 text-sm text-text-muted">
            اضبط هوية الوكيل وتعليماته وأدواته المسموحة لنشاط «{business.name}».
          </p>
        </div>
      </header>

      <AgentConsole data={data} />
    </div>
  )
}
