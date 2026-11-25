import { NextResponse } from 'next/server'
import { requireExecutiveAssistantApi } from '@/lib/personal-assistant/api-context'
import { appendThreadMessage, listThread } from '@/lib/personal-assistant/thread'
import { runPersonalAssistantTurn } from '@/lib/personal-assistant/runtime'
import { buildEngineDeps, mirrorToWhatsApp } from '@/lib/central-bot/deps'
import { assertWithinLimit, EntitlementExceededError } from '@/lib/billing/entitlements'
import { getAiGuardPolicy } from '@/lib/billing/free-tier'
import { guardAssistantText } from '@/lib/personal-assistant/web-media'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const MAX_CHARS = 2000

/** Unified thread: web + WhatsApp messages of this owner only (RLS-scoped read). */
export async function GET() {
  const access = await requireExecutiveAssistantApi()
  if (access instanceof NextResponse) return access
  try {
    const [messages, policy] = await Promise.all([
      listThread(access.db, access.owner),
      getAiGuardPolicy(access.admin, access.owner.organizationId).catch(() => null),
    ])
    const limits = policy
      ? { audioMaxSeconds: policy.audioMaxSeconds, mediaMaxBytes: policy.mediaMaxBytes, documents: policy.documentsAllowed, maxInputChars: policy.maxInputChars }
      : null
    return NextResponse.json({ messages, limits }, { headers: { 'Cache-Control': 'no-store' } })
  } catch {
    return NextResponse.json({ error: 'thread_list_failed' }, { status: 500 })
  }
}

export async function POST(request: Request) {
  const access = await requireExecutiveAssistantApi()
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
  let guarded: Awaited<ReturnType<typeof guardAssistantText>>
  try {
    guarded = await guardAssistantText(access.admin, access.owner, text, { policy: await getAiGuardPolicy(access.admin, access.owner.organizationId) })
  } catch {
    return NextResponse.json({ error: 'billing_check_failed' }, { status: 503 })
  }
  if (!guarded.ok) return NextResponse.json({ error: guarded.error, reply: guarded.reply ?? null }, { status: guarded.status })
  try {
    await appendThreadMessage(access.admin, access.owner, { direction: 'inbound', source: 'web', content: text })
    const turn = await runPersonalAssistantTurn(access.admin, access.owner, guarded.text, { engine: buildEngineDeps(access.admin) })
    await appendThreadMessage(access.admin, access.owner, { direction: 'outbound', source: 'web', content: turn.reply })
    const mirrored = await mirrorToWhatsApp(access.admin, access.owner, `من الموقع: ${text.slice(0, 300)}\n\n${turn.reply}`)
    return NextResponse.json({ reply: turn.reply, mirrored })
  } catch (error) {
    console.error('personal_chat_failed', { reason: error instanceof Error ? error.message.slice(0, 120) : 'unknown' })
    return NextResponse.json({ error: 'assistant_unavailable' }, { status: 502 })
  }
}
