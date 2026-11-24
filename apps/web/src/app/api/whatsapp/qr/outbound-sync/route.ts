import { NextRequest, NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/db/admin'
import { secretEquals } from '@/lib/credentials/service'
import { syncOwnerWhatsAppMessage, parseOwnerWhatsAppMessage } from '@/lib/channels/whatsapp-owner-sync'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

/**
 * Messages the owner typed manually in the WhatsApp phone app (fromMe on the
 * linked QR device). They are persisted as outbound/human_whatsapp in the same
 * conversation and never enqueue an inbound job, so the AI does not answer them.
 */
export async function POST(req: NextRequest) {
  const expected = process.env.WHATSAPP_GATEWAY_TOKEN?.trim() ?? ''
  const authorization = req.headers.get('authorization') ?? ''
  const supplied = authorization.startsWith('Bearer ') ? authorization.slice(7) : ''
  if (!expected || !secretEquals(supplied, expected)) return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  try {
    const raw = await req.text()
    if (raw.length > 32 * 1024) return NextResponse.json({ error: 'payload_too_large' }, { status: 413 })
    let body: unknown
    try { body = JSON.parse(raw) } catch { return NextResponse.json({ error: 'invalid_json' }, { status: 400 }) }
    const input = parseOwnerWhatsAppMessage(body)
    if (!input) return NextResponse.json({ error: 'invalid_outbound_payload' }, { status: 400 })
    const result = await syncOwnerWhatsAppMessage(createAdminClient(), input)
    if (result.status === 'channel_unavailable') return NextResponse.json({ error: 'channel_unavailable' }, { status: 404 })
    return NextResponse.json({ ok: true, ...result })
  } catch (error) {
    console.error('WhatsApp QR owner message sync failed', { reason: error instanceof Error ? error.message.slice(0, 200) : 'sync_error' })
    return NextResponse.json({ error: 'outbound_sync_failed' }, { status: 500 })
  }
}
