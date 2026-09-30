import { openai } from '@ai-sdk/openai'
import { convertToModelMessages, streamText, tool, type UIMessage } from 'ai'
import { z } from 'zod'
import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isSupabaseConfigured } from '@/lib/supabase/env'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 60

/** Operators can point the copilot at another OpenAI-compatible model. */
const MODEL = process.env.COPILOT_MODEL || 'gpt-4o'

/**
 * The internal business copilot.
 *
 * Configuration and authorisation are decided before anything privileged is built, so a
 * request that cannot be authorised gets its own status code instead of the generic 500 the
 * catch-all would otherwise produce.
 */
export async function POST(req: Request) {
  if (!isSupabaseConfigured()) {
    return NextResponse.json({ error: 'supabase_not_configured' }, { status: 503 })
  }

  let supabase: Awaited<ReturnType<typeof createClient>>
  try {
    supabase = await createClient()
  } catch {
    return NextResponse.json({ error: 'supabase_not_configured' }, { status: 503 })
  }

  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })

  const { data: member, error: memberError } = await supabase
    .from('organization_members')
    .select('organization_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()

  if (memberError) {
    console.error('Copilot membership lookup failed:', memberError.message)
    return NextResponse.json({ error: 'membership_lookup_failed' }, { status: 500 })
  }
  if (!member) return NextResponse.json({ error: 'no_organization' }, { status: 403 })

  // Provider configuration is reported only to an authorised caller: an anonymous request
  // must be told it is unauthorized, not which secrets the deployment is missing.
  if (!process.env.OPENAI_API_KEY) {
    return NextResponse.json(
      { error: 'ai_provider_not_configured', required_env: ['OPENAI_API_KEY'] },
      { status: 503 }
    )
  }

  const organizationId = member.organization_id as string

  let messages: UIMessage[]
  try {
    const body = (await req.json()) as { messages?: unknown }
    if (!Array.isArray(body?.messages)) {
      return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 })
    }
    messages = body.messages as UIMessage[]
  } catch {
    return NextResponse.json({ error: 'invalid_request_body' }, { status: 400 })
  }

  if (!messages.length) {
    return NextResponse.json({ error: 'messages_required' }, { status: 400 })
  }

  try {
    const result = streamText({
      model: openai(MODEL),
      system: `You are FrontDesk AI's internal Business Agent (Copilot).
You help the business owner or staff manage their operations.
You can answer questions about their data using tools.
Be professional, concise, and helpful. Always answer in Arabic.`,
      messages: await convertToModelMessages(messages),
      tools: {
        getBusinessMetrics: tool({
          description:
            'Get high level business metrics (conversations, leads, orders, revenue) for the current organization.',
          inputSchema: z.object({}),
          execute: async () => {
            const [
              { count: conversations },
              { count: leads },
              { data: orders },
            ] = await Promise.all([
              supabase
                .from('conversations')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organizationId),
              supabase
                .from('leads')
                .select('*', { count: 'exact', head: true })
                .eq('organization_id', organizationId),
              supabase
                .from('orders')
                .select('total_amount')
                .eq('organization_id', organizationId)
                .eq('status', 'completed'),
            ])
            const revenue = orders?.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0) || 0
            return {
              total_conversations: conversations || 0,
              total_leads: leads || 0,
              completed_orders: orders?.length || 0,
              total_revenue_sar: revenue,
            }
          },
        }),
      },
    })

    return result.toUIMessageStreamResponse()
  } catch (error) {
    console.error('Copilot API error:', error instanceof Error ? error.message : error)
    return NextResponse.json({ error: 'ai_request_failed' }, { status: 502 })
  }
}
