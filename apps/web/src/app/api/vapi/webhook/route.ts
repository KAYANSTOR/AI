import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'
import { resolveContactIdentity, normalizeE164 } from '@/lib/channels/contacts'
import { executeTool, getToolDefinitionsForAgent } from '@/lib/ai/tools'
import { buildBusinessSystemPrompt } from '@/lib/ai/prompt'
import { ensureOpenConversation } from '@/lib/runtime/conversation'
import { resolveBusinessAgent, resolveChannelExact } from '@/lib/runtime/tenant'
import { verifyVapiRequest } from '@/lib/runtime/security'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Vapi server webhook (the only voice provider — ADR-0001).
 *
 * Tenant resolution is exact: the dialed Vapi phone number id maps to
 * channels(channel_type='phone', provider_account_id). Nothing in the payload can
 * select an organization, and tool calls run through the same governed executor as
 * every other channel.
 */
export async function POST(req: NextRequest) {
  const started = Date.now()

  if (!verifyVapiRequest(req.headers)) {
    return NextResponse.json({ error: 'invalid_vapi_signature' }, { status: 401 })
  }

  const supabase = createAdminClient()
  let eventRowId: string | null = null

  try {
    const body = (await req.json()) as Record<string, unknown>
    const message = (body.message ?? body) as Record<string, unknown>
    const type = String(message.type ?? body.type ?? 'unknown')
    const call = (message.call ?? body.call ?? {}) as Record<string, unknown>
    const callId = String(call.id ?? message.callId ?? body.callId ?? crypto.randomUUID())
    const externalEventId = `${type}:${callId}:${String(message.timestamp ?? Date.now())}`

    const acquired = await acquireWebhookEvent(supabase, 'vapi', externalEventId, body)
    if (acquired.status === 'duplicate') {
      return NextResponse.json({ status: 'duplicate' })
    }
    if (acquired.status === 'error') {
      return NextResponse.json({ error: acquired.message }, { status: 500 })
    }
    eventRowId = acquired.eventRowId

    const phoneNumberId = extractPhoneNumberId(call, message, body)
    if (!phoneNumberId) {
      await markWebhookProcessed(supabase, eventRowId, 'failed', 'missing_vapi_phone_number_id')
      return NextResponse.json({ error: 'missing_vapi_phone_number_id' }, { status: 400 })
    }

    const channel = await resolveChannelExact(supabase, {
      channelType: 'phone',
      providerAccountId: phoneNumberId,
    })
    if (!channel) {
      await markWebhookProcessed(supabase, eventRowId, 'failed', 'unmapped_vapi_number')
      return NextResponse.json({ status: 'unmapped_vapi_number' })
    }

    await supabase
      .from('webhook_events')
      .update({
        organization_id: channel.organizationId,
        channel_id: channel.id,
        event_type: callEventType(type),
        signature_verified: true,
      })
      .eq('id', eventRowId)

    const callerNumber = extractCallerNumber(call, message)
    const contact = callerNumber
      ? await resolveContactIdentity(supabase, channel.organizationId, {
          channel: 'phone',
          phone: normalizeE164(callerNumber),
          externalUserId: normalizeE164(callerNumber),
        })
      : null

    const conversationId = contact
      ? await ensureOpenConversation(supabase, {
          organizationId: channel.organizationId,
          businessId: channel.businessId,
          contactId: contact.contactId,
          channelId: channel.id,
        })
      : null

    const agent = await resolveBusinessAgent(supabase, channel.businessId)

    if (type === 'assistant-request') {
      if (!agent) {
        await markWebhookProcessed(supabase, eventRowId, 'failed', 'business_inactive_or_agent_unavailable')
        return NextResponse.json({ error: 'assistant_unavailable' }, { status: 409 })
      }

      const [prompt, tools] = await Promise.all([
        buildBusinessSystemPrompt(supabase, channel.organizationId, agent.id),
        getToolDefinitionsForAgent(supabase, channel.organizationId, agent.id),
      ])
      await markWebhookProcessed(supabase, eventRowId, 'processed')
      return NextResponse.json(
        {
          assistant: {
            model: {
              messages: [{ role: 'system', content: prompt }],
              tools: tools.map((tool) => ({
                type: 'function',
                function: {
                  name: tool.name,
                  description: tool.description,
                  parameters: tool.input_schema,
                },
              })),
            },
          },
        },
        { headers: timingHeader(started) }
      )
    }

    if (isToolCallEvent(type, message)) {
      if (!agent) {
        await markWebhookProcessed(supabase, eventRowId, 'failed', 'business_inactive_or_agent_unavailable')
        return NextResponse.json({ error: 'assistant_unavailable' }, { status: 409 })
      }

      const results = await handleToolCalls(supabase, {
        organizationId: channel.organizationId,
        businessId: channel.businessId,
        conversationId,
        contactId: contact?.contactId ?? null,
        agentId: agent.id,
        message,
      })
      await markWebhookProcessed(supabase, eventRowId, 'processed')
      return NextResponse.json({ results }, { headers: timingHeader(started) })
    }

    // Call lifecycle events (status-update, end-of-call-report, …) are recorded as
    // audit evidence — the database is the source of truth for call outcomes.
    await recordCallLifecycle(supabase, {
      organizationId: channel.organizationId,
      businessId: channel.businessId,
      callId,
      type,
      message,
      call,
    })
    await markWebhookProcessed(supabase, eventRowId, 'processed')
    return NextResponse.json({ ok: true }, { headers: timingHeader(started) })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'vapi webhook error'
    if (eventRowId) await markWebhookProcessed(supabase, eventRowId, 'failed', message)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}

function readString(value: unknown) {
  return typeof value === 'string' ? value.trim() : ''
}

function extractPhoneNumberId(
  call: Record<string, unknown>,
  message: Record<string, unknown>,
  body: Record<string, unknown>
): string {
  const candidates: unknown[] = [
    (call.phoneNumber as Record<string, unknown> | undefined)?.id,
    call.phoneNumberId,
    (message.phoneNumber as Record<string, unknown> | undefined)?.id,
    message.phoneNumberId,
    (body.phoneNumber as Record<string, unknown> | undefined)?.id,
    body.phoneNumberId,
  ]
  for (const candidate of candidates) {
    const value = readString(candidate)
    if (value) return value
  }
  return ''
}

function extractCallerNumber(call: Record<string, unknown>, message: Record<string, unknown>) {
  const customer =
    (call.customer as Record<string, unknown> | undefined) ??
    (message.customer as Record<string, unknown> | undefined)
  return readString(customer?.number)
}

function callEventType(type: string) {
  if (type === 'status-update') return 'call.status'
  if (type === 'end-of-call-report') return 'call.ended'
  if (isToolCallEvent(type, {})) return 'tool.requested'
  return 'call.event'
}

function isToolCallEvent(type: string, message: Record<string, unknown>) {
  return (
    type === 'tool-calls' ||
    type === 'function-call' ||
    type === 'tool_calls' ||
    Boolean(message.toolCallList) ||
    Boolean(message.toolCalls) ||
    Boolean(message.functionCall)
  )
}

async function handleToolCalls(
  supabase: ReturnType<typeof createAdminClient>,
  context: {
    organizationId: string
    businessId: string
    conversationId: string | null
    contactId: string | null
    agentId: string
    message: Record<string, unknown>
  }
) {
  const list =
    (context.message.toolCallList as Array<Record<string, unknown>> | undefined) ??
    (context.message.toolCalls as Array<Record<string, unknown>> | undefined) ??
    []

  const calls = list.length
    ? list.map((item) => {
        const fn = (item.function ?? item) as Record<string, unknown>
        return {
          id: String(item.id ?? item.toolCallId ?? crypto.randomUUID()),
          name: readString(fn.name ?? item.name),
          params: parseArguments(fn.arguments ?? fn.parameters ?? item.arguments),
        }
      })
    : context.message.functionCall
      ? [
          {
            id: String((context.message.functionCall as Record<string, unknown>).id ?? 'call_0'),
            name: readString((context.message.functionCall as Record<string, unknown>).name),
            params: parseArguments(
              (context.message.functionCall as Record<string, unknown>).parameters
            ),
          },
        ]
      : []

  const results = []
  for (const call of calls) {
    const out = await executeTool(call.name, call.params, {
      organizationId: context.organizationId,
      businessId: context.businessId,
      conversationId: context.conversationId,
      contactId: context.contactId,
      agentId: context.agentId,
      supabase,
      actor: 'agent',
    })
    results.push({ toolCallId: call.id, result: out.ok ? out.result : { error: out.error } })
  }
  return results
}

function parseArguments(raw: unknown): Record<string, unknown> {
  if (typeof raw === 'string') {
    try {
      const parsed = JSON.parse(raw) as unknown
      return parsed && typeof parsed === 'object' ? (parsed as Record<string, unknown>) : {}
    } catch {
      return {}
    }
  }
  return raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {}
}

async function recordCallLifecycle(
  supabase: ReturnType<typeof createAdminClient>,
  input: {
    organizationId: string
    businessId: string
    callId: string
    type: string
    message: Record<string, unknown>
    call: Record<string, unknown>
  }
) {
  const endedReason = readString(
    input.message.endedReason ?? input.call.endedReason ?? input.call.ended_reason
  )
  const durationSeconds = Number(
    input.call.durationSeconds ?? input.message.durationSeconds ?? 0
  )
  const summary = readString(input.message.summary)

  const { error } = await supabase.from('audit_events').insert({
    organization_id: input.organizationId,
    business_id: input.businessId,
    actor_type: 'provider',
    action: 'call.' + input.type,
    entity_type: 'call',
    metadata: {
      call_id: input.callId,
      ended_reason: endedReason || null,
      duration_seconds: Number.isFinite(durationSeconds) ? durationSeconds : 0,
      summary: summary || null,
    },
  })
  if (error) throw new Error(error.message)
}

function timingHeader(started: number): HeadersInit {
  return { 'Server-Timing': `app;dur=${Date.now() - started}` }
}
