import { NextResponse } from 'next/server'
import { requirePersonalAssistantApi } from '@/lib/personal-assistant/api-context'
import { appendThreadMessage, listThread } from '@/lib/personal-assistant/thread'
import { runPersonalAssistantTurn } from '@/lib/personal-assistant/runtime'
import { buildEngineDeps, mirrorToWhatsApp } from '@/lib/central-bot/deps'
import { assertWithinLimit, EntitlementExceededError } from '@/lib/billing/entitlements'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_CHARS = 2000

/** Unified thread: web + WhatsApp messages of this owner only (RLS-scoped read). */
export async function GET() {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  try {
    const messages = await listThread(access.db, access.owner)
    return NextResponse.json({ messages }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'thread_list_failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  const body = await request.json().catch(() => null) as { text?: unknown } | null
  const text = typeof body?.text === 'string' ? body.text.trim() : ''
  if (!text || text.length > MAX_CHARS) return NextResponse.json({ error: 'invalid_text' }, { status: 400 })
  try {
    await assertWithinLimit(access.admin, access.owner.organizationId, 'ai_messages')
  } catch (error) {
    if (error instanceof EntitlementExceededError) return NextResponse.json({ error: 'entitlement_exceeded' }, { status: 429 })
    return NextResponse.json({ error: 'billing_check_failed' }, { status: 503 })
  }
  try {
    await appendThreadMessage(access.admin, access.owner, { direction: 'inbound', source: 'web', content: text })
    const turn = await runPersonalAssistantTurn(access.admin, access.owner, text, { engine: buildEngineDeps(access.admin) })
    await appendThreadMessage(access.admin, access.owner, { direction: 'outbound', source: 'web', content: turn.reply })
    const mirrored = await mirrorToWhatsApp(access.admin, access.owner, `من الموقع: ${text.slice(0, 300)}\n\n${turn.reply}`)
    return NextResponse.json({ reply: turn.reply, mirrored })
  } catch (error) {
    console.error('personal_chat_failed', { reason: error instanceof Error ? error.message.slice(0, 120) : 'unknown' })
    return NextResponse.json({ error: 'assistant_unavailable' }, { status: 502 })
  }
}
