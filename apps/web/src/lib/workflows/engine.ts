import type { SupabaseClient } from '@supabase/supabase-js'
import { createNotification } from '@/lib/notifications'

export type WorkflowNodeType =
  | 'trigger'
  | 'action'
  | 'condition'
  | 'wait'
  | 'assign'
  | 'notify'
  | 'handoff'
  | 'stop'
  | 'loop'

export type WorkflowNode = {
  id: string
  type: WorkflowNodeType
  config?: Record<string, unknown>
  next?: string | null
  onTrue?: string | null
  onFalse?: string | null
}

export type WorkflowDefinition = {
  nodes: WorkflowNode[]
  edges?: { from: string; to: string }[]
}

const DEFAULT_MAX_ITERATIONS = 50

function nodeMap(def: WorkflowDefinition): Map<string, WorkflowNode> {
  return new Map(def.nodes.map((n) => [n.id, n]))
}

function resolveNext(node: WorkflowNode, branch?: boolean): string | null {
  if (node.type === 'condition') {
    return branch ? node.onTrue ?? null : node.onFalse ?? null
  }
  return node.next ?? null
}

function evalCondition(
  config: Record<string, unknown> | undefined,
  context: Record<string, unknown>
): boolean {
  const field = String(config?.field ?? '')
  const op = String(config?.op ?? 'eq')
  const expected = config?.value
  const actual = context[field]

  switch (op) {
    case 'eq':
      return actual === expected
    case 'neq':
      return actual !== expected
    case 'exists':
      return actual != null && actual !== ''
    case 'gt':
      return Number(actual) > Number(expected)
    case 'lt':
      return Number(actual) < Number(expected)
    default:
      return false
  }
}

export async function startWorkflowRun(
  supabase: SupabaseClient,
  input: {
    organizationId: string
    workflowId: string
    triggerPayload?: Record<string, unknown>
    idempotencyKey?: string
    context?: Record<string, unknown>
  }
): Promise<{ runId: string; status: string }> {
  const { data: workflow, error } = await supabase
    .from('workflows')
    .select('id, status, definition, version, max_iterations')
    .eq('id', input.workflowId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (error) throw error
  if (!workflow) throw new Error('workflow_not_found')
  if (workflow.status !== 'published' && workflow.status !== 'tested') {
    throw new Error('workflow_not_runnable')
  }

  const definition = workflow.definition as WorkflowDefinition
  const start =
    definition.nodes.find((n) => n.type === 'trigger') ?? definition.nodes[0] ?? null
  if (!start) throw new Error('workflow_has_no_nodes')

  const { data: run, error: runError } = await supabase
    .from('workflow_runs')
    .insert({
      organization_id: input.organizationId,
      workflow_id: workflow.id,
      workflow_version: workflow.version ?? 1,
      status: 'running',
      trigger_payload: input.triggerPayload ?? {},
      context: input.context ?? {},
      current_node_id: start.id,
      max_iterations: DEFAULT_MAX_ITERATIONS,
      idempotency_key: input.idempotencyKey ?? null,
    })
    .select('id, status')
    .single()

  if (runError) {
    if (runError.code === '23505' && input.idempotencyKey) {
      const { data: existing } = await supabase
        .from('workflow_runs')
        .select('id, status')
        .eq('organization_id', input.organizationId)
        .eq('idempotency_key', input.idempotencyKey)
        .maybeSingle()
      if (existing) return { runId: existing.id, status: existing.status }
    }
    throw runError
  }

  await advanceWorkflowRun(supabase, {
    organizationId: input.organizationId,
    runId: run.id,
  })

  const { data: refreshed } = await supabase
    .from('workflow_runs')
    .select('status')
    .eq('id', run.id)
    .maybeSingle()

  return { runId: run.id, status: refreshed?.status ?? run.status }
}

export async function advanceWorkflowRun(
  supabase: SupabaseClient,
  input: { organizationId: string; runId: string }
): Promise<{ status: string }> {
  const { data: run, error } = await supabase
    .from('workflow_runs')
    .select(
      'id, workflow_id, status, context, current_node_id, iteration_count, max_iterations, wait_until'
    )
    .eq('id', input.runId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()

  if (error) throw error
  if (!run) throw new Error('run_not_found')
  if (run.status === 'completed' || run.status === 'failed' || run.status === 'stopped') {
    return { status: run.status }
  }

  if (run.status === 'waiting' && run.wait_until) {
    if (new Date(run.wait_until).getTime() > Date.now()) {
      return { status: 'waiting' }
    }
  }

  const { data: workflow } = await supabase
    .from('workflows')
    .select('definition')
    .eq('id', run.workflow_id)
    .maybeSingle()

  const definition = (workflow?.definition ?? { nodes: [] }) as WorkflowDefinition
  const nodes = nodeMap(definition)
  let currentId = run.current_node_id as string | null
  let context = { ...(run.context as Record<string, unknown>) }
  let iterations = Number(run.iteration_count ?? 0)
  const maxIterations = Number(run.max_iterations ?? DEFAULT_MAX_ITERATIONS)

  while (currentId) {
    if (iterations >= maxIterations) {
      await failRun(supabase, input, 'max_iterations_exceeded', currentId, context, iterations)
      return { status: 'failed' }
    }

    const node = nodes.get(currentId)
    if (!node) {
      await failRun(supabase, input, 'unknown_node', currentId, context, iterations)
      return { status: 'failed' }
    }

    iterations += 1

    try {
      if (node.type === 'stop') {
        await completeRun(supabase, input, context, iterations, node.id)
        await logStep(supabase, input, node, 'completed', {}, { stopped: true }, iterations)
        return { status: 'completed' }
      }

      if (node.type === 'wait') {
        const minutes = Number(node.config?.minutes ?? 0)
        const waitUntil = new Date(Date.now() + Math.max(0, minutes) * 60_000).toISOString()
        await supabase
          .from('workflow_runs')
          .update({
            status: 'waiting',
            wait_until: waitUntil,
            current_node_id: resolveNext(node),
            context,
            iteration_count: iterations,
            updated_at: new Date().toISOString(),
          })
          .eq('id', input.runId)
          .eq('organization_id', input.organizationId)
        await logStep(supabase, input, node, 'completed', node.config ?? {}, { waitUntil }, iterations)
        return { status: 'waiting' }
      }

      if (node.type === 'condition') {
        const ok = evalCondition(node.config, context)
        await logStep(supabase, input, node, 'completed', node.config ?? {}, { result: ok }, iterations)
        currentId = resolveNext(node, ok)
        continue
      }

      if (node.type === 'notify') {
        const memberId = (node.config?.memberId as string | null) ?? null
        await createNotification(supabase, {
          organizationId: input.organizationId,
          memberId,
          entityType: 'workflow_run',
          entityId: input.runId,
          notificationType: String(node.config?.type ?? 'assignment'),
          title: String(node.config?.title ?? 'إشعار سير عمل'),
          body: String(node.config?.body ?? ''),
          idempotencyKey: `wf-notify:${input.runId}:${node.id}:${iterations}`,
        })
        await logStep(supabase, input, node, 'completed', node.config ?? {}, { notified: true }, iterations)
        currentId = resolveNext(node)
        continue
      }

      if (node.type === 'action') {
        const key = String(node.config?.key ?? 'noop')
        context = { ...context, lastAction: key, [`action_${key}`]: true }
        await logStep(supabase, input, node, 'completed', node.config ?? {}, { key }, iterations)
        currentId = resolveNext(node)
        continue
      }

      if (node.type === 'loop') {
        // Bounded only: requires config.max and increments context.loopIndex
        const max = Math.min(Number(node.config?.max ?? 3), 20)
        const idx = Number(context.loopIndex ?? 0)
        if (idx >= max) {
          await logStep(supabase, input, node, 'completed', node.config ?? {}, { exited: true }, iterations)
          currentId = resolveNext(node)
          continue
        }
        context = { ...context, loopIndex: idx + 1 }
        await logStep(supabase, input, node, 'completed', node.config ?? {}, { loopIndex: idx + 1 }, iterations)
        currentId = (node.config?.body as string) || resolveNext(node)
        continue
      }

      // trigger / assign / handoff: record and continue
      await logStep(supabase, input, node, 'completed', node.config ?? {}, {}, iterations)
      currentId = resolveNext(node)
    } catch (err) {
      const message = err instanceof Error ? err.message : 'node_failed'
      await logStep(supabase, input, node, 'failed', node.config ?? {}, {}, iterations, message)
      await failRun(supabase, input, message, node.id, context, iterations)
      return { status: 'failed' }
    }
  }

  await completeRun(supabase, input, context, iterations, null)
  return { status: 'completed' }
}

async function logStep(
  supabase: SupabaseClient,
  input: { organizationId: string; runId: string },
  node: WorkflowNode,
  status: 'completed' | 'failed' | 'skipped',
  stepInput: Record<string, unknown>,
  output: Record<string, unknown>,
  iteration: number,
  error?: string
) {
  await supabase.from('workflow_run_steps').insert({
    organization_id: input.organizationId,
    run_id: input.runId,
    node_id: node.id,
    node_type: node.type,
    status,
    input: stepInput,
    output,
    error: error ?? null,
    iteration,
  })
}

async function completeRun(
  supabase: SupabaseClient,
  input: { organizationId: string; runId: string },
  context: Record<string, unknown>,
  iterations: number,
  nodeId: string | null
) {
  await supabase
    .from('workflow_runs')
    .update({
      status: 'completed',
      context,
      iteration_count: iterations,
      current_node_id: nodeId,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.runId)
    .eq('organization_id', input.organizationId)
}

async function failRun(
  supabase: SupabaseClient,
  input: { organizationId: string; runId: string },
  message: string,
  nodeId: string | null,
  context: Record<string, unknown>,
  iterations: number
) {
  await supabase
    .from('workflow_runs')
    .update({
      status: 'failed',
      last_error: message.slice(0, 500),
      current_node_id: nodeId,
      context,
      iteration_count: iterations,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq('id', input.runId)
    .eq('organization_id', input.organizationId)
}
