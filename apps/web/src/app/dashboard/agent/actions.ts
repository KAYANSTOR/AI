'use server'

import { revalidatePath } from 'next/cache'
import { createClient } from '@/lib/supabase/server'
import { getCurrentOrg, type OrgContext } from '@/lib/org'
import { getToolPolicy } from '@/lib/ai/registry'
import { applyBusinessType } from '@/lib/capabilities/profile'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'

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
  if (error) {
    console.error('Unable to record agent audit event', error)
    throw new Error('تعذّر تسجيل العملية في سجل التدقيق.')
  }
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
    if (error) return { ok: false, error: supabaseActionError(error) }

    await audit(org.organizationId, agent.business_id, 'agent.updated', agent.id, {
      name,
      locale: input.locale,
      temperature,
      status: input.status,
    })

    revalidatePath('/dashboard/agent')
    return { ok: true, message: 'تم حفظ إعدادات الوكيل.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حفظ الوكيل. حاول مرة أخرى.') }
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
    if (error) return { ok: false, error: supabaseActionError(error) }

    const version = typeof data === 'number' ? data : undefined
    await audit(org.organizationId, agent.business_id, 'agent.prompt_published', agent.id, {
      version,
      characters: input.instructions.trim().length,
    })

    revalidatePath('/dashboard/agent')
    return { ok: true, message: 'تم نشر النسخة ' + (version ?? ''), version }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر نشر التعليمات. حاول مرة أخرى.') }
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
    if (error) return { ok: false, error: supabaseActionError(error) }

    const version = typeof data === 'number' ? data : undefined
    await audit(org.organizationId, agent.business_id, 'agent.prompt_rolled_back', agent.id, {
      restored_from: input.version,
      new_version: version,
    })

    revalidatePath('/dashboard/agent')
    return { ok: true, message: 'تمت استعادة النسخة ' + input.version + ' كنسخة جديدة.', version }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّرت الاستعادة. حاول مرة أخرى.') }
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
    if (error) return { ok: false, error: supabaseActionError(error) }

    await audit(org.organizationId, agent.business_id, 'agent.tool_policy_changed', agent.id, {
      tool: input.toolName,
      is_allowed: input.isAllowed,
      requires_confirmation: requiresConfirmation,
    })

    revalidatePath('/dashboard/agent')
    return { ok: true, message: 'تم تحديث صلاحية الأداة.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحديث الأداة. حاول مرة أخرى.') }
  }
}

export async function saveAgentKnowledgeItemAction(input: {
  id?: string | null
  title: string
  content: string
  category: string
}): Promise<AgentActionResult & { id?: string }> {
  try {
    const org = await requireAgentAdmin()
    const title = input.title.trim().slice(0, 255)
    const content = input.content.trim()
    if (!title) return { ok: false, error: 'عنوان المعلومة مطلوب.' }
    if (!content) return { ok: false, error: 'نص المعلومة مطلوب.' }

    const supabase = await createClient()
    if (input.id) {
      const { data, error } = await supabase
        .from('knowledge_base')
        .update({
          title,
          content,
          category: input.category || 'general',
          updated_at: new Date().toISOString(),
        })
        .eq('id', input.id)
        .eq('organization_id', org.organizationId)
        .select('id')
        .maybeSingle()

      if (error) return { ok: false, error: supabaseActionError(error) }
      if (!data) return { ok: false, error: 'لم يتم العثور على المعلومة.' }
      revalidatePath('/dashboard/agent')
      return { ok: true, message: 'تم تحديث المعلومة بنجاح.', id: data.id }
    }

    const { data, error } = await supabase
      .from('knowledge_base')
      .insert({
        organization_id: org.organizationId,
        title,
        content,
        category: input.category || 'general',
        is_active: true,
        updated_at: new Date().toISOString(),
      })
      .select('id')
      .single()

    if (error) return { ok: false, error: supabaseActionError(error) }
    revalidatePath('/dashboard/agent')
    return { ok: true, message: 'تمت إضافة المعلومة بنجاح.', id: data.id }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حفظ المعلومة.') }
  }
}

export async function deleteAgentKnowledgeItemAction(id: string): Promise<AgentActionResult> {
  try {
    const org = await requireAgentAdmin()
    const supabase = await createClient()
    const { error } = await supabase
      .from('knowledge_base')
      .delete()
      .eq('id', id)
      .eq('organization_id', org.organizationId)

    if (error) return { ok: false, error: supabaseActionError(error) }
    revalidatePath('/dashboard/agent')
    return { ok: true, message: 'تم حذف المعلومة من المعرفة.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر حذف المعلومة.') }
  }
}

export async function toggleAgentKnowledgeItemAction(id: string, isActive: boolean): Promise<AgentActionResult> {
  try {
    const org = await requireAgentAdmin()
    const supabase = await createClient()
    const { error } = await supabase
      .from('knowledge_base')
      .update({ is_active: isActive, updated_at: new Date().toISOString() })
      .eq('id', id)
      .eq('organization_id', org.organizationId)

    if (error) return { ok: false, error: supabaseActionError(error) }
    revalidatePath('/dashboard/agent')
    return { ok: true, message: isActive ? 'تم تفعيل المعلومة.' : 'تم تعطيل المعلومة.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تعديل حالة المعلومة.') }
  }
}

export async function updateBusinessTypeAndInstructionsAction(input: {
  agentId: string
  businessTypeId: string
  businessName: string
  setupDescription?: string
  industry?: string
  publicPhoneNumber?: string
  systemPromptAddition: string
}): Promise<AgentActionResult> {
  try {
    const org = await requireAgentAdmin()
    const agent = await assertAgentInOrg(input.agentId, org.organizationId)
    const supabase = await createClient()

    const name = input.businessName.trim()
    if (!name) return { ok: false, error: 'اسم النشاط مطلوب.' }
    if (!input.businessTypeId) return { ok: false, error: 'نوع النشاط مطلوب.' }

    // 1. Update business name
    if (agent.business_id) {
      await supabase
        .from('businesses')
        .update({ name, updated_at: new Date().toISOString() })
        .eq('id', agent.business_id)
        .eq('organization_id', org.organizationId)
    }

    // 2. Apply business type (updates business_profiles.business_type_id and default capabilities)
    await applyBusinessType(supabase, org.organizationId, input.businessTypeId)

    // 3. Update business profile details
    const { error: profileError } = await supabase
      .from('business_profiles')
      .update({
        setup_description: input.setupDescription?.trim() || null,
        industry: input.industry?.trim() || null,
        public_phone_number: input.publicPhoneNumber?.trim() || null,
        system_prompt_addition: input.systemPromptAddition.trim() || null,
        updated_at: new Date().toISOString(),
      })
      .eq('organization_id', org.organizationId)

    if (profileError) return { ok: false, error: supabaseActionError(profileError) }

    // 4. Publish agent prompt version
    let version: number | undefined
    if (input.systemPromptAddition) {
      const { data: pubData, error: pubErr } = await supabase.rpc('publish_agent_prompt', {
        p_agent_id: agent.id,
        p_system_prompt_addition: input.systemPromptAddition.trim(),
      })
      if (!pubErr && typeof pubData === 'number') {
        version = pubData
      }
    }

    // 5. Upsert business info in knowledge base
    const summaryContent = [
      `اسم النشاط: ${name}`,
      input.industry ? `المجال: ${input.industry}` : '',
      input.setupDescription ? `طبيعة العمل والخدمات: ${input.setupDescription}` : '',
      input.publicPhoneNumber ? `هاتف التواصل: ${input.publicPhoneNumber}` : '',
    ]
      .filter(Boolean)
      .join('\n')

    const { data: existingKb } = await supabase
      .from('knowledge_base')
      .select('id')
      .eq('organization_id', org.organizationId)
      .eq('category', 'business_info')
      .ilike('title', '%هوية ونشاط الشركة%')
      .maybeSingle()

    if (existingKb?.id) {
      await supabase
        .from('knowledge_base')
        .update({
          content: summaryContent,
          updated_at: new Date().toISOString(),
        })
        .eq('id', existingKb.id)
    } else {
      await supabase.from('knowledge_base').insert({
        organization_id: org.organizationId,
        title: 'هوية ونشاط الشركة',
        content: summaryContent,
        category: 'business_info',
        is_active: true,
        updated_at: new Date().toISOString(),
      })
    }

    await audit(org.organizationId, agent.business_id, 'agent.business_profile_updated', agent.id, {
      businessTypeId: input.businessTypeId,
      businessName: name,
      version,
    })

    revalidatePath('/dashboard/agent')
    revalidatePath('/dashboard')
    return { ok: true, message: 'تم تحديث نوع النشاط والبيانات وتعليمات الوكيل بنجاح.' }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحديث نوع النشاط والبيانات.') }
  }
}

