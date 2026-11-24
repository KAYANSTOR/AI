import { NextResponse } from 'next/server'
import { requirePersonalAssistantApi } from '@/lib/personal-assistant/api-context'
import { createLinkCode } from '@/lib/central-bot/router'
import { centralDisplayNumber, getCentralBotConfig } from '@/lib/central-bot/config'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'Cache-Control': 'no-store' }

/** Link status (phone masked) for the one-tap WhatsApp card. */
export async function GET() {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  const { data } = await access.db.from('personal_assistant_links')
    .select('whatsapp_phone, verified_at, kill_switch_active, token_expires_at')
    .eq('org_id', access.owner.organizationId).eq('user_id', access.owner.userId).maybeSingle()
  const phone = data?.whatsapp_phone ? String(data.whatsapp_phone) : null
  return NextResponse.json({
    configured: Boolean(getCentralBotConfig() && centralDisplayNumber()),
    linked: Boolean(data?.verified_at && phone),
    phoneMasked: phone ? `${phone.slice(0, 5)}•••${phone.slice(-3)}` : null,
    killSwitchActive: data?.kill_switch_active === true,
  }, { headers: NO_STORE })
}

/** New single-use activation code + wa.me deep link. */
export async function POST() {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  const displayNumber = centralDisplayNumber()
  if (!displayNumber) return NextResponse.json({ error: 'central_bot_not_configured' }, { status: 503 })
  try {
    const link = await createLinkCode(access.admin, access.owner, { displayNumber })
    return NextResponse.json(link, { status: 201, headers: NO_STORE })
  } catch {
    return NextResponse.json({ error: 'link_code_failed' }, { status: 500 })
  }
}

/** Unlink the WhatsApp number (the kill-switch state is kept). */
export async function DELETE() {
  const access = await requirePersonalAssistantApi()
  if (access instanceof NextResponse) return access
  await access.admin.from('personal_assistant_links')
    .update({ whatsapp_phone: null, verified_at: null, verification_token: null, token_expires_at: null })
    .eq('org_id', access.owner.organizationId).eq('user_id', access.owner.userId)
  return NextResponse.json({ ok: true })
}
