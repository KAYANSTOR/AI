'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrg, type OrgContext } from '@/lib/org'
import { getToolPolicy } from '@/lib/ai/registry'

export type AgentActionResult = { ok: boolean; error?: string; message?: string; version?: number }

const LOCALES = ['ar', 'en'] as const
const STATUSES = ['active', 'suspended', 'archived'] as const

/** Changing what the AI says or may do is an owner/admin operation. */
async function requireAgentAdmin(): Promise<OrgContext> {
  const org = await getCurrentOrg()
  if (!org) throw new Error('الجلسة منتهية. سجّل الدخول من جديد.')
  if (org.role !== 'owner' && org.role !== 'admin') {
    throw new Error('صلاحية إدارة الوكيل متاحة للمالك أو المسؤول فقط.')
  }
  return org
}

async function audit(
  organizationId: string,
  businessId: string | null,
  action: string,
  entityId: string | null,
  metadata: Record<string, unknown>
) {
  const supabase = await createClient()
  const { error } = await supabase.rpc('log_audit_event', {
    p_organization_id: organizationId,
    p_action: action,
    p_entity_type: 'ai_agent',
    p_entity_id: entityId,
    p_business_id: businessId,
    p_metadata: metadata,
  })
  if (error) throw new Error('تعذّر تسجيل العملية في سجل التدقيق: ' + error.message)
}

/** Confirms the agent belongs to the caller's organization before any write. */
async function assertAgentInOrg(agentId: string, organizationId: string) {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('ai_agents')
    .select('id, organization_id, business_id, status')
    .eq('id', agentId)
    .eq('organization_id', organizationId)
    .maybeSingle()
  if (error) throw new Error(error.message)
  if (!data) throw new Error('الوكيل غير موجود في هذه الشركة.')
  return data
}

export async function saveAgentProfileAction(input: {
  agentId: string
  name: string
  locale: string
  temperature: number
  status: string
}): Promise<AgentActionResult> {
  try {
    const org = await requireAgentAdmin()
    const agent = await assertAgentInOrg(input.agentId, org.organizationId)

    const name = input.name.trim()
    if (name.length < 2) return { ok: false, error: 'اسم الوكيل قصير جدًا.' }
    if (!LOCALES.includes(input.locale as (typeof LOCALES)[number])) {
      return { ok: false, error: 'لغة غير مدعومة.' }
    }
    if (!STATUSES.includes(input.status as (typeof STATUSES)[number])) {
      return { ok: false, error: 'حالة غير مدعومة.' }
    }
    const temperature = Number(input.temperature)
    if (!Number.isFinite(temperature) || temperature < 0 || temperature > 1) {
      return { ok: false, error: 'درجة الإبداع يجب أن تكون بين 0 و 1.' }
    }

    const supabase = await createClient()
    // ai_agents has an owner/admin UPDATE policy (aa_update), so the user's own session
    // performs the write and RLS is the tenant guard.
    const { error } = await supabase
      .from('ai_agents')
      .update({
        name,
        locale: input.locale,
        temperature,
        status: input.status,
        updated_at: new Date().toISOString(),
      })
      .eq('id', agent.id)
    if (error) return { ok: false, error: error.message }

    await audit(org.organizationId, agent.business_id, 'agent.updated', agent.id, {
      name,
      locale: input.locale,
      temperature,
      status: input.status,
    })

    revalidatePath('/dashboard/agent')
    return { ok: true, message: 'تم حفظ إعدادات الوكيل.' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'تعذّر حفظ الوكيل.' }
  }
}

export async function publishPromptAction(input: {
  agentId: string
  instructions: string
}): Promise<AgentActionResult> {
  try {
    const org = await requireAgentAdmin()
    const agent = await assertAgentInOrg(input.agentId, org.organizationId)

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('publish_agent_prompt', {
      p_agent_id: agent.id,
      p_system_prompt_addition: input.instructions,
    })
    if (error) return { ok: false, error: error.message }

    const version = typeof data === 'number' ? data : undefined
    await audit(org.organizationId, agent.business_id, 'agent.prompt_published', agent.id, {
      version,
      characters: input.instructions.trim().length,
    })

    revalidatePath('/dashboard/agent')
    return { ok: true, message: 'تم نشر النسخة ' + (version ?? ''), version }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'تعذّر نشر التعليمات.' }
  }
}

export async function rollbackPromptAction(input: {
  agentId: string
  version: number
}): Promise<AgentActionResult> {
  try {
    const org = await requireAgentAdmin()
    const agent = await assertAgentInOrg(input.agentId, org.organizationId)

    if (!Number.isInteger(input.version) || input.version < 1) {
      return { ok: false, error: 'رقم نسخة غير صالح.' }
    }

    const supabase = await createClient()
    const { data, error } = await supabase.rpc('rollback_agent_prompt', {
      p_agent_id: agent.id,
      p_version: input.version,
    })
    if (error) return { ok: false, error: error.message }

    const version = typeof data === 'number' ? data : undefined
    await audit(org.organizationId, agent.business_id, 'agent.prompt_rolled_back', agent.id, {
      restored_from: input.version,
      new_version: version,
    })

    revalidatePath('/dashboard/agent')
    return { ok: true, message: 'تمت استعادة النسخة ' + input.version + ' كنسخة جديدة.', version }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'تعذّرت الاستعادة.' }
  }
}

export async function setToolPolicyAction(input: {
  agentId: string
  toolName: string
  isAllowed: boolean
  requiresConfirmation: boolean
}): Promise<AgentActionResult> {
  try {
    const org = await requireAgentAdmin()
    const agent = await assertAgentInOrg(input.agentId, org.organizationId)

    // The registry is the source of truth: an unknown tool name is not governable.
    const policy = getToolPolicy(input.toolName)
    if (!policy) return { ok: false, error: 'أداة غير معروفة.' }

    // A read-only tool cannot require confirmation; the registry would win at runtime
    // anyway, so refusing here avoids storing a policy that lies about behaviour.
    const requiresConfirmation = policy.risk === 'read' ? false : input.requiresConfirmation

    const supabase = await createClient()
    const { error } = await supabase.rpc('set_agent_tool_policy', {
      p_agent_id: agent.id,
      p_tool_name: input.toolName,
      p_is_allowed: input.isAllowed,
      p_requires_confirmation: requiresConfirmation,
    })
    if (error) return { ok: false, error: error.message }

    await audit(org.organizationId, agent.business_id, 'agent.tool_policy_changed', agent.id, {
      tool: input.toolName,
      is_allowed: input.isAllowed,
      requires_confirmation: requiresConfirmation,
    })

    revalidatePath('/dashboard/agent')
    return { ok: true, message: 'تم تحديث صلاحية الأداة.' }
  } catch (error) {
    return { ok: false, error: error instanceof Error ? error.message : 'تعذّر تحديث الأداة.' }
  }
}
