import { NextResponse } from 'next/server'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { getDashboardContext } from '@/lib/dashboard/context'
import { runAgentPreviewTurn } from '@/lib/runtime/agent-runtime'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

const bodySchema = z.object({
  agentId: z.string().uuid(),
  messages: z
    .array(
      z.object({
        role: z.enum(['user', 'assistant']),
        content: z.string().trim().min(1).max(4000),
      })
    )
    .min(1)
    .max(24),
})

export async function POST(req: Request) {
  const context = await getDashboardContext()
  if (!context) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  if (!context.businessId) {
    return NextResponse.json({ error: 'business_not_configured' }, { status: 409 })
  }

  let body: z.infer<typeof bodySchema>
  try {
    body = bodySchema.parse(await req.json())
  } catch {
    return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 })
  }

  if (!process.env.GEMINI_API_KEY) {
    return NextResponse.json({ error: 'ai_provider_not_configured' }, { status: 503 })
  }

  const supabase = await createClient()
  const { data: agent, error } = await supabase
    .from('ai_agents')
    .select('id, organization_id, business_id, status')
    .eq('id', body.agentId)
    .eq('organization_id', context.organizationId)
    .eq('business_id', context.businessId)
    .eq('status', 'active')
    .maybeSingle()

  if (error) {
    console.error('Agent preview lookup failed:', error.message)
    return NextResponse.json({ error: 'agent_lookup_failed' }, { status: 500 })
  }
  if (!agent) return NextResponse.json({ error: 'agent_not_available' }, { status: 404 })

  try {
    const result = await runAgentPreviewTurn({
      supabase,
      organizationId: context.organizationId,
      businessId: context.businessId,
      agentId: agent.id,
      messages: body.messages.map((message) => ({
        role: message.role,
        content: message.content,
      })),
    })

    return NextResponse.json({
      reply: result.reply,
      toolTrace: result.toolTrace.map((trace) => ({
        name: trace.name,
        simulated: trace.simulated,
      })),
    })
  } catch (error) {
    console.error(
      'Agent preview failed:',
      error instanceof Error ? error.message : error
    )
    return NextResponse.json({ error: 'agent_preview_failed' }, { status: 502 })
  }
}
