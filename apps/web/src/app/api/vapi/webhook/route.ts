import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { acquireWebhookEvent, markWebhookProcessed } from '@/lib/channels/idempotency'
import { executeTool } from '@/lib/ai/tools'
import { buildBusinessSystemPrompt } from '@/lib/ai/prompt'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Vapi server webhook.
 * Handles: assistant-request, tool-calls / function-call, status updates.
 * Never logs secrets. Organization is resolved from metadata.organizationId.
 */
export async function POST(req: NextRequest) {
  const started = Date.now()
  let eventRowId: string | null = null
  const supabase = createAdminClient()

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

    const organizationId = resolveOrganizationId(message, call, body)
    if (!organizationId) {
      await markWebhookProcessed(supabase, eventRowId, 'failed', 'missing organizationId')
      return NextResponse.json(
        { error: 'organizationId required in assistant metadata' },
        { status: 400 }
      )
    }

    if (
      type === 'tool-calls' ||
      type === 'function-call' ||
      type === 'tool_calls' ||
      message.toolCallList ||
      message.functionCall
    ) {
      const results = await handleToolCalls(supabase, organizationId, message)
      await markWebhookProcessed(supabase, eventRowId, 'processed')
      return NextResponse.json({ results }, { headers: timingHeader(started) })
    }

    if (type === 'assistant-request') {
      const systemPrompt = await buildBusinessSystemPrompt(supabase, organizationId)
      await markWebhookProcessed(supabase, eventRowId, 'processed')
      return NextResponse.json(
        {
          assistant: {
            model: {
              messages: [{ role: 'system', content: systemPrompt }],
            },
          },
        },
        { headers: timingHeader(started) }
      )
    }

    await markWebhookProcessed(supabase, eventRowId, 'processed')
    return NextResponse.json({ ok: true }, { headers: timingHeader(started) })
  } catch (e) {
    const msg = e instanceof Error ? e.message : 'webhook error'
    if (eventRowId) {
      await markWebhookProcessed(supabase, eventRowId, 'failed', msg)
    }
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}

function resolveOrganizationId(
  message: Record<string, unknown>,
  call: Record<string, unknown>,
  body: Record<string, unknown>
): string | null {
  const meta =
    (call.metadata as Record<string, unknown> | undefined) ??
    (message.metadata as Record<string, unknown> | undefined) ??
    (body.metadata as Record<string, unknown> | undefined) ??
    {}
  const id = meta.organizationId ?? meta.organization_id ?? body.organizationId
  return id ? String(id) : null
}

async function handleToolCalls(
  supabase: ReturnType<typeof createAdminClient>,
  organizationId: string,
  message: Record<string, unknown>
) {
  const list =
    (message.toolCallList as Array<Record<string, unknown>> | undefined) ??
    (message.toolCalls as Array<Record<string, unknown>> | undefined) ??
    []

  if (!list.length && message.functionCall) {
    const fc = message.functionCall as Record<string, unknown>
    const name = String(fc.name ?? '')
    const params =
      typeof fc.parameters === 'string'
        ? (JSON.parse(fc.parameters) as Record<string, unknown>)
        : ((fc.parameters as Record<string, unknown>) ?? {})
    const out = await executeTool(name, params, { organizationId, supabase })
    return [
      {
        toolCallId: String(fc.id ?? 'call_0'),
        result: out.ok ? out.result : { error: out.error },
      },
    ]
  }

  const results = []
  for (const item of list) {
    const id = String(item.id ?? item.toolCallId ?? crypto.randomUUID())
    const fn = (item.function ?? item) as Record<string, unknown>
    const name = String(fn.name ?? item.name ?? '')
    let params: Record<string, unknown> = {}
    const raw = fn.arguments ?? fn.parameters ?? item.arguments
    if (typeof raw === 'string') {
      try {
        params = JSON.parse(raw) as Record<string, unknown>
      } catch {
        params = {}
      }
    } else if (raw && typeof raw === 'object') {
      params = raw as Record<string, unknown>
    }
    const out = await executeTool(name, params, { organizationId, supabase })
    results.push({
      toolCallId: id,
      result: out.ok ? out.result : { error: out.error },
    })
  }
  return results
}

function timingHeader(started: number): HeadersInit {
  return { 'Server-Timing': `app;dur=${Date.now() - started}` }
}
