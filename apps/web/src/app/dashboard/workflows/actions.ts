'use server'

import { revalidatePath } from 'next/cache'
import { requireAdminCapability, audit } from '@/lib/capabilities/guard'
import { actionErrorMessage, supabaseActionError } from '@/lib/i18n/action-error'
import type { WorkflowDefinition } from '@/lib/workflows/engine'
import { startWorkflowRun } from '@/lib/workflows/engine'
import { getWorkflowTemplate } from '@/lib/workflows/templates'
import { assertWithinLimit, EntitlementExceededError } from '@/lib/billing/entitlements'

export type WorkflowActionResult =
  | { ok: true; workflowId?: string; runId?: string }
  | { ok: false; error: string }

function validateDefinition(definition: WorkflowDefinition): string | null {
  if (!definition?.nodes?.length) return 'يجب إضافة عقدة واحدة على الأقل.'
  const ids = new Set(definition.nodes.map((n) => n.id))
  if (ids.size !== definition.nodes.length) return 'معرّفات العقد يجب أن تكون فريدة.'
  const hasTrigger = definition.nodes.some((n) => n.type === 'trigger')
  if (!hasTrigger) return 'يجب وجود عقدة trigger.'
  const hasStop = definition.nodes.some((n) => n.type === 'stop')
  if (!hasStop) return 'يجب وجود عقدة stop لإنهاء السير.'
  return null
}

export async function createWorkflowAction(input: {
  name: string
  description?: string
  triggerType: string
  definition: WorkflowDefinition
}): Promise<WorkflowActionResult> {
  try {
    const ctx = await requireAdminCapability(null)
    const name = input.name.trim()
    if (!name) return { ok: false, error: 'الاسم مطلوب.' }
    if (!input.triggerType.trim()) return { ok: false, error: 'نوع المحفّز مطلوب.' }

    const defError = validateDefinition(input.definition)
    if (defError) return { ok: false, error: defError }

    const { data, error } = await ctx.supabase
      .from('workflows')
      .insert({
        organization_id: ctx.organizationId,
        business_id: ctx.businessId,
        name,
        description: input.description ?? null,
        trigger_type: input.triggerType.trim(),
        definition: input.definition,
        status: 'draft',
        version: 1,
        created_by: ctx.userId,
      })
      .select('id')
      .single()

    if (error || !data) return { ok: false, error: supabaseActionError(error) }

    await audit(ctx, 'workflow.created', 'workflow', data.id, {
      trigger_type: input.triggerType,
    })
    revalidatePath('/dashboard/workflows')
    return { ok: true, workflowId: data.id }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر إنشاء السير.') }
  }
}

export async function installWorkflowTemplateAction(
  templateId: string
): Promise<WorkflowActionResult> {
  try {
    const ctx = await requireAdminCapability(null)
    const template = getWorkflowTemplate(templateId)
    if (!template) return { ok: false, error: 'القالب غير موجود.' }

    return await createWorkflowAction({
      name: template.name,
      description: template.description,
      triggerType: template.triggerType,
      definition: template.definition,
    })
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تثبيت القالب.') }
  }
}

export async function updateWorkflowDraftAction(input: {
  workflowId: string
  name?: string
  description?: string
  triggerType?: string
  definition?: WorkflowDefinition
}): Promise<WorkflowActionResult> {
  try {
    const ctx = await requireAdminCapability(null)

    const { data: current, error: readError } = await ctx.supabase
      .from('workflows')
      .select('id, status')
      .eq('id', input.workflowId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()

    if (readError) return { ok: false, error: supabaseActionError(readError) }
    if (!current) return { ok: false, error: 'السير غير موجود.' }
    if (current.status === 'published' || current.status === 'retired') {
      return { ok: false, error: 'النسخة المنشورة غير قابلة للتعديل؛ أنشئ نسخة جديدة.' }
    }

    if (input.definition) {
      const defError = validateDefinition(input.definition)
      if (defError) return { ok: false, error: defError }
    }

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() }
    if (input.name !== undefined) patch.name = input.name.trim()
    if (input.description !== undefined) patch.description = input.description
    if (input.triggerType !== undefined) patch.trigger_type = input.triggerType.trim()
    if (input.definition !== undefined) patch.definition = input.definition

    const { error } = await ctx.supabase
      .from('workflows')
      .update(patch)
      .eq('id', input.workflowId)
      .eq('organization_id', ctx.organizationId)

    if (error) return { ok: false, error: supabaseActionError(error) }

    await audit(ctx, 'workflow.updated', 'workflow', input.workflowId)
    revalidatePath('/dashboard/workflows')
    return { ok: true, workflowId: input.workflowId }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحديث السير.') }
  }
}

export async function markWorkflowTestedAction(workflowId: string): Promise<WorkflowActionResult> {
  try {
    const ctx = await requireAdminCapability(null)
    const { data, error } = await ctx.supabase
      .from('workflows')
      .update({ status: 'tested', updated_at: new Date().toISOString() })
      .eq('id', workflowId)
      .eq('organization_id', ctx.organizationId)
      .in('status', ['draft', 'tested'])
      .select('id')
      .maybeSingle()

    if (error) return { ok: false, error: supabaseActionError(error) }
    if (!data) return { ok: false, error: 'لا يمكن تعليم السير كمُختبر من حالته الحالية.' }

    await audit(ctx, 'workflow.tested', 'workflow', workflowId)
    revalidatePath('/dashboard/workflows')
    return { ok: true, workflowId }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تحديث الحالة.') }
  }
}

export async function publishWorkflowAction(workflowId: string): Promise<WorkflowActionResult> {
  try {
    const ctx = await requireAdminCapability(null)

    const { data: current, error: readError } = await ctx.supabase
      .from('workflows')
      .select('id, status, definition, version')
      .eq('id', workflowId)
      .eq('organization_id', ctx.organizationId)
      .maybeSingle()

    if (readError) return { ok: false, error: supabaseActionError(readError) }
    if (!current) return { ok: false, error: 'السير غير موجود.' }
    if (current.status !== 'tested' && current.status !== 'draft') {
      return { ok: false, error: 'النشر مسموح من draft/tested فقط.' }
    }

    const defError = validateDefinition(current.definition as WorkflowDefinition)
    if (defError) return { ok: false, error: defError }

    const { error } = await ctx.supabase
      .from('workflows')
      .update({
        status: 'published',
        published_at: new Date().toISOString(),
        version: Number(current.version ?? 1),
        updated_at: new Date().toISOString(),
      })
      .eq('id', workflowId)
      .eq('organization_id', ctx.organizationId)

    if (error) return { ok: false, error: supabaseActionError(error) }

    await audit(ctx, 'workflow.published', 'workflow', workflowId, {
      version: current.version,
    })
    revalidatePath('/dashboard/workflows')
    return { ok: true, workflowId }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر النشر.') }
  }
}

export async function retireWorkflowAction(workflowId: string): Promise<WorkflowActionResult> {
  try {
    const ctx = await requireAdminCapability(null)
    const { data, error } = await ctx.supabase
      .from('workflows')
      .update({ status: 'retired', updated_at: new Date().toISOString() })
      .eq('id', workflowId)
      .eq('organization_id', ctx.organizationId)
      .eq('status', 'published')
      .select('id')
      .maybeSingle()

    if (error) return { ok: false, error: supabaseActionError(error) }
    if (!data) return { ok: false, error: 'يمكن إيقاف النسخ المنشورة فقط.' }

    await audit(ctx, 'workflow.retired', 'workflow', workflowId)
    revalidatePath('/dashboard/workflows')
    return { ok: true, workflowId }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر الإيقاف.') }
  }
}

export async function testRunWorkflowAction(
  workflowId: string,
  payload: Record<string, unknown> = {}
): Promise<WorkflowActionResult> {
  try {
    const ctx = await requireAdminCapability(null)
    try {
      await assertWithinLimit(ctx.supabase, ctx.organizationId, 'automation_runs', 1)
    } catch (err) {
      if (err instanceof EntitlementExceededError) {
        return { ok: false, error: 'تجاوزت حد تشغيل الأتمتة في خطتك.' }
      }
      throw err
    }

    const result = await startWorkflowRun(ctx.supabase, {
      organizationId: ctx.organizationId,
      workflowId,
      triggerPayload: payload,
      context: payload,
      idempotencyKey: `test:${workflowId}:${Date.now()}`,
    })
    await audit(ctx, 'workflow.test_run', 'workflow', workflowId, { runId: result.runId })
    return { ok: true, workflowId, runId: result.runId }
  } catch (error) {
    return { ok: false, error: actionErrorMessage(error, 'تعذّر تشغيل الاختبار.') }
  }
}
