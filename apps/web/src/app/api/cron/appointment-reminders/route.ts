import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/supabase/admin'
import { assertMarketingAllowed, ConsentBlockedError } from '@/lib/channels/consent'
import { enqueueOutbound } from '@/lib/channels/outbox'
import { DEFAULT_SEND_WINDOW, isInQuietHours } from '@/lib/channels/quiet-hours'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const WINDOW_24H_MS = 24 * 60 * 60 * 1000
const WINDOW_1H_MS = 60 * 60 * 1000
const SKEW_MS = 15 * 60 * 1000

async function handle(req: NextRequest) {
  if (!isAuthorizedCronRequest(req.headers.get('authorization'), process.env.CRON_SECRET)) {
    return NextResponse.json({ error: 'unauthorized' }, { status: 401 })
  }

  if (isInQuietHours(DEFAULT_SEND_WINDOW)) {
    return NextResponse.json({ skipped: 'quiet_hours' })
  }

  const supabase = createAdminClient()
  const now = Date.now()

  const { data: appointments, error } = await supabase
    .from('appointments')
    .select('id, organization_id, contact_id, starts_at, status, reminder_24h_sent_at, reminder_1h_sent_at')
    .in('status', ['pending', 'confirmed'])
    .gte('starts_at', new Date(now).toISOString())
    .lte('starts_at', new Date(now + WINDOW_24H_MS + SKEW_MS).toISOString())
    .limit(80)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })

  let sent24 = 0
  let sent1 = 0
  let blocked = 0
  let failed = 0

  for (const appt of appointments ?? []) {
    const starts = new Date(appt.starts_at).getTime()
    const delta = starts - now

    const needs24 =
      !appt.reminder_24h_sent_at && delta <= WINDOW_24H_MS + SKEW_MS && delta > WINDOW_1H_MS
    const needs1 = !appt.reminder_1h_sent_at && delta <= WINDOW_1H_MS + SKEW_MS && delta > 0

    if (!needs24 && !needs1) continue

    const kind = needs1 ? '1h' : '24h'
    const column = kind === '1h' ? 'reminder_1h_sent_at' : 'reminder_24h_sent_at'

    try {
      await assertMarketingAllowed(supabase, {
        contactId: appt.contact_id,
        channel: 'whatsapp',
      })
    } catch (err) {
      if (err instanceof ConsentBlockedError) {
        blocked++
        continue
      }
      throw err
    }

    const { data: contact } = await supabase
      .from('contacts')
      .select('id, phone, full_name')
      .eq('id', appt.contact_id)
      .eq('organization_id', appt.organization_id)
      .maybeSingle()

    const { data: identity } = await supabase
      .from('contact_identities')
      .select('external_user_id, external_phone, channel')
      .eq('contact_id', appt.contact_id)
      .in('channel', ['whatsapp', 'sms'])
      .limit(1)
      .maybeSingle()

    const channelType = identity?.channel === 'sms' ? 'sms' : 'whatsapp'
    const recipient =
      identity?.external_user_id || identity?.external_phone || contact?.phone || ''

    if (!recipient) {
      failed++
      continue
    }

    const { data: channel } = await supabase
      .from('channels')
      .select('id, business_id')
      .eq('organization_id', appt.organization_id)
      .eq('channel_type', channelType)
      .eq('is_active', true)
      .limit(1)
      .maybeSingle()

    if (!channel) {
      failed++
      continue
    }

    const when = new Date(appt.starts_at).toISOString()
    const body =
      kind === '1h'
        ? `تذكير: موعدك خلال ساعة تقريباً (${when}). نراك قريباً.`
        : `تذكير: موعدك غداً في ${when}. للإلغاء أو التعديل رد على هذه الرسالة.`

    await enqueueOutbound({
      supabase,
      organizationId: appt.organization_id,
      businessId: channel.business_id,
      channelId: channel.id,
      eventType: 'appointment.reminder',
      idempotencyKey: `appt-reminder:${appt.id}:${kind}`,
      recipient,
      payload: { body, appointment_id: appt.id, kind },
    })

    const { error: markError } = await supabase
      .from('appointments')
      .update({ [column]: new Date().toISOString() })
      .eq('id', appt.id)
      .eq('organization_id', appt.organization_id)
      .is(column, null)

    if (markError) {
      failed++
      continue
    }

    if (kind === '1h') sent1++
    else sent24++

    await supabase.from('audit_events').insert({
      organization_id: appt.organization_id,
      actor_type: 'system',
      action: 'appointment.reminder_queued',
      entity_type: 'appointment',
      entity_id: appt.id,
      metadata: { kind, channel: channelType },
    })
  }

  return NextResponse.json({ scanned: appointments?.length ?? 0, sent24, sent1, blocked, failed })
}

export const GET = handle
export const POST = handle
