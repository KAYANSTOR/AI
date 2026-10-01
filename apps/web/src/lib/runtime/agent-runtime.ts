import type { SupabaseClient } from '@supabase/supabase-js'
import { buildBusinessSystemPrompt } from '@/lib/ai/prompt'
import { executeTool, getToolDefinitionsForAgent } from '@/lib/ai/tools'
import { evaluateReplyGovernance, staffHandoffNotice } from '@/lib/ai/governance'
import { getProvider } from '@/lib/providers'
import type { ModelMessage } from '@/lib/providers'
import { createNotification } from '@/lib/notifications'

export async function runAgentTurn(args: {
  supabase: SupabaseClient
  organizationId: string
  businessId: string
  conversationId: string
  contactId: string
  channel: string
  userText: string
  agentId?: string | null
  serverActionResult?: unknown
}) {
  const providerName = 'gemini'
  const model = process.env.GEMINI_MODEL ?? 'gemini-3.8-flash'

  const [{ data: history, error: historyError }, prompt, toolSet] = await Promise.all([
    args.supabase
      .from('messages')
      .select('direction,content,created_at')
      .eq('organization_id', args.organizationId)
      .eq('conversation_id', args.conversationId)
      .order('created_at', { ascending: false })
      .limit(20),
    buildBusinessSystemPrompt(args.supabase, args.organizationId, args.agentId),
    getToolDefinitionsForAgent(args.supabase, args.organizationId, args.agentId),
  ])
  if (historyError) throw new Error(historyError.message)

  const messages: ModelMessage[] = (history ?? [])
    .reverse()
    .filter((row) => Boolean(row.content))
    .map((row) => ({
      role: row.direction === 'inbound' ? 'user' : 'assistant',
      content: String(row.content),
    }))
  if (messages.at(-1)?.role !== 'user') messages.push({ role: 'user', content: args.userText })
  if (args.serverActionResult !== undefined) {
    messages.push({
      role: 'user',
      content: 'Trusted server action result:\n' + JSON.stringify(args.serverActionResult),
    })
  }

  const agent = args.agentId
    ? { id: args.agentId }
    : (
        await args.supabase
          .from('ai_agents')
          .select('id')
          .eq('business_id', args.businessId)
          .eq('status', 'active')
          .order('created_at')
          .limit(1)
          .maybeSingle()
      ).data
  const promptVersion = agent?.id
    ? (
        await args.supabase
          .from('agent_prompt_versions')
          .select('id')
          .eq('agent_id', agent.id)
          .eq('status', 'published')
          .maybeSingle()
      ).data
    : null

  const run = await args.supabase
    .from('agent_runs')
    .insert({
      organization_id: args.organizationId,
      business_id: args.businessId,
      agent_id: agent?.id ?? null,
      conversation_id: args.conversationId,
      channel: args.channel,
      model_provider: providerName,
      model,
      prompt_version_id: promptVersion?.id ?? null,
      status: 'running',
    })
    .select('id')
    .single()
  if (run.error || !run.data) throw new Error(run.error?.message ?? 'Unable to start agent run')

  const runId = run.data.id
  const started = Date.now()
  let inputTokens = 0
  let outputTokens = 0
  try {
    for (let round = 0; round < 5; round += 1) {
      const provider = getProvider()
      const result = await provider.call({ system: prompt, messages, tools: toolSet })
      inputTokens += result.inputTokens
      outputTokens += result.outputTokens

      const textParts = result.content
        .filter((b): b is { type: 'text'; text: string } => b.type === 'text')
        .map((b) => b.text)
      const toolBlocks = result.content.filter(
        (b): b is { type: 'tool_use'; id: string; name: string; input: Record<string, unknown> } =>
          b.type === 'tool_use'
      )
      if (!toolBlocks.length) {
        let reply = textParts.join('\n').trim()
        if (!reply) throw new Error('Model returned an empty response')

        const decision = evaluateReplyGovernance({
          userText: args.userText,
          reply,
        })

        if (decision.action === 'block' || decision.action === 'escalate') {
          await args.supabase
            .from('conversations')
            .update({
              status: 'handed_off',
              ai_enabled: false,
              state: 'human_handoff',
              handoff_reason: decision.reasons.join(','),
              ai_paused_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq('id', args.conversationId)
            .eq('organization_id', args.organizationId)

          await createNotification(args.supabase, {
            organizationId: args.organizationId,
            entityType: 'conversation',
            entityId: args.conversationId,
            notificationType: 'high_priority',
            title: 'تصعيد من حوكمة الوكيل',
            body: `أسباب: ${decision.reasons.join(', ')} (ثقة ${decision.confidence.toFixed(2)})`,
            idempotencyKey: `gov-escalate:${args.conversationId}:${runId}`,
          })

          await args.supabase.from('audit_events').insert({
            organization_id: args.organizationId,
            business_id: args.businessId,
            actor_type: 'system',
            action: 'agent.governance_escalation',
            entity_type: 'conversation',
            entity_id: args.conversationId,
            metadata: { reasons: decision.reasons, confidence: decision.confidence, runId },
          })

          reply = staffHandoffNotice('ar')
        }

        await args.supabase
          .from('agent_runs')
          .update({
            status: 'completed',
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            latency_ms: Date.now() - started,
            completed_at: new Date().toISOString(),
          })
          .eq('id', runId)
        await args.supabase.from('usage_ledger').insert({
          organization_id: args.organizationId,
          business_id: args.businessId,
          event_type: 'ai_tokens',
          units: inputTokens + outputTokens,
          reference_type: 'agent_run',
          reference_id: runId,
          metadata: {
            input_tokens: inputTokens,
            output_tokens: outputTokens,
            model,
            governance: decision.action,
            confidence: decision.confidence,
          },
        })
        return reply
      }

      messages.push({ role: 'assistant', content: result.content as unknown as Record<string, unknown>[] })
      const results: Record<string, unknown>[] = []
      for (const tool of toolBlocks) {
        const toolResult = await executeTool(
          tool.name,
          tool.input,
          {
            organizationId: args.organizationId,
            businessId: args.businessId,
            conversationId: args.conversationId,
            contactId: args.contactId,
            supabase: args.supabase,
            agentId: agent?.id ?? null,
            actor: 'agent',
          }
        )
        results.push({
          type: 'tool_result',
          tool_use_id: tool.id,
          name: tool.name,
          content: JSON.stringify(toolResult.ok ? toolResult.result : { error: toolResult.error }),
        })
      }
      messages.push({ role: 'user', content: results })
    }
    throw new Error('Agent tool loop exceeded maximum rounds')
  } catch (error) {
    await args.supabase
      .from('agent_runs')
      .update({
        status: 'failed',
        input_tokens: inputTokens,
        output_tokens: outputTokens,
        latency_ms: Date.now() - started,
        error_code: error instanceof Error ? error.message.slice(0, 120) : 'agent_error',
        completed_at: new Date().toISOString(),
      })
      .eq('id', runId)
    if (inputTokens + outputTokens > 0) {
      await args.supabase.from('usage_ledger').insert({
        organization_id: args.organizationId,
        business_id: args.businessId,
        event_type: 'ai_tokens',
        units: inputTokens + outputTokens,
        reference_type: 'agent_run',
        reference_id: runId,
        metadata: {
          input_tokens: inputTokens,
          output_tokens: outputTokens,
          model,
          failed: true,
        },
      })
    }
    throw error
  }
}
