// @ts-nocheck
import { openai } from '@ai-sdk/openai'
import { streamText, tool } from 'ai'
import { z } from 'zod'
import { createClient } from '@/lib/supabase/server'
import { NextResponse } from 'next/server'
import { getDashboardContext } from '@/lib/dashboard/context'

export const maxDuration = 60

export async function POST(req: Request) {
  try {
    const supabase = await createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return new NextResponse('Unauthorized', { status: 401 })

    // For simplicity, we fetch the org from DB directly
    const { data: member } = await supabase
      .from('organization_members')
      .select('organization_id')
      .eq('user_id', user.id)
      .single()
      
    if (!member) return new NextResponse('Unauthorized', { status: 401 })
    const orgId = member.organization_id

    const { messages } = await req.json()

    const result = streamText({
      model: openai('gpt-4o'),
      system: `You are FrontDesk AI's internal Business Agent (Copilot). 
You help the business owner or staff manage their operations. 
You can answer questions about their data using tools.
Be professional, concise, and helpful. Always answer in Arabic.`,
      messages,
      tools: {
        getBusinessMetrics: tool({
          description: 'Get high level business metrics (conversations, leads, orders, revenue) for the current organization.',
          parameters: z.object({}),
          execute: async () => {
            const [
              { count: conversations },
              { count: leads },
              { data: orders },
            ] = await Promise.all([
              supabase.from('conversations').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
              supabase.from('leads').select('*', { count: 'exact', head: true }).eq('organization_id', orgId),
              supabase.from('orders').select('total_amount').eq('organization_id', orgId).eq('status', 'completed'),
            ])
            const revenue = orders?.reduce((acc, o) => acc + (Number(o.total_amount) || 0), 0) || 0
            return {
              total_conversations: conversations || 0,
              total_leads: leads || 0,
              completed_orders: orders?.length || 0,
              total_revenue_sar: revenue
            }
          }
        }),
      }
    })

    return result.toTextStreamResponse()
  } catch (error) {
    console.error('Copilot API Error:', error)
    return new NextResponse('Internal Server Error', { status: 500 })
  }
}
