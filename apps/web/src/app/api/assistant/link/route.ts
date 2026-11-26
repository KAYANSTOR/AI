import { NextResponse } from 'next/server'
import { requirePersonalAssistantApi } from '@/lib/personal-assistant/api-context'
import { createLinkCode } from '@/lib/central-bot/router'
import { getCentralLinkConfig } from '@/lib/central-bot/config'
import { readCentralLinkStatus, unlinkCentralBot } from '@/lib/central-bot/link-status'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** Link status (phone masked) for the one-tap WhatsApp card. */
export async function GET() {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  try {
    return NextResponse.json(await readCentralLinkStatus(access.db, access.owner), { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'link_status_failed' }, { status: 500, headers: NO_STORE })
  }
}

/** New single-use activation code + wa.me deep link. */
export async function POST() {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  const config = getCentralLinkConfig()
  if (!config) return NextResponse.json({ error: 'central_bot_not_configured' }, { status: 503, headers: NO_STORE })
  try {
    const link = await createLinkCode(access.admin, access.owner, { displayNumber: config.displayNumber })
    return NextResponse.json(link, { status: 201, headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'link_code_failed' }, { status: 500, headers: NO_STORE })
  }
}

/** Unlink the WhatsApp number (the kill-switch state is kept). */
export async function DELETE() {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  try {
    await unlinkCentralBot(access.admin, access.owner)
    return NextResponse.json({ ok: true }, { headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'link_disconnect_failed' }, { status: 500, headers: NO_STORE })
  }
}
