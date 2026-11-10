import { NextRequest, NextResponse } from 'next/server'
import { isAuthorizedCronRequest } from '@/lib/cron/auth'
import { createAdminClient } from '@/lib/db/admin'
import { assertMarketingAllowed, ConsentBlockedError } from '@/lib/channels/consent'
import { enqueueOutbound } from '@/lib/channels/outbox'
import { publicWebhookError } from '@/lib/runtime/security'
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

  const db = createAdminClient()
  const now = Date.now()

  const { data: appointments, error } = await db
    .from('appointments')
    .select('id, organization_id, contact_id, starts_at, status, reminder_24h_sent_at, reminder_1h_sent_at')
    .in('status', ['pending', 'confirmed'])
    .gte('starts_at', new Date(now).toISOString())
    .lte('starts_at', new Date(now + WINDOW_24H_MS + SKEW_MS).toISOString())
    // Deterministic page: soonest appointments first, id as tie-breaker.
    .order('starts_at', { ascending: true })
    .order('id', { ascending: true })
    .limit(80)

  if (error) return NextResponse.json({ error: publicWebhookError() }, { status: 500 })

  let sent24 = 0
  let sent1 = 0
  let blocked = 0
  let failed = 0

  // Decide which appointments actually need a reminder first, so the lookups below can be
  // batched (3 queries total) instead of repeated per appointment.
  const due = (appointments ?? []).filter((appt) => {
    const delta = new Date(appt.starts_at).getTime() - now
    const needs24 =
      !appt.reminder_24h_sent_at && delta <= WINDOW_24H_MS + SKEW_MS && delta > WINDOW_1H_MS
    const needs1 = !appt.reminder_1h_sent_at && delta <= WINDOW_1H_MS + SKEW_MS && delta > 0
    return needs24 || needs1
  })

  const contactIds = [...new Set(due.map((appt) => appt.contact_id as string))]
  const organizationIds = [...new Set(due.map((appt) => appt.organization_id as string))]

  const [contactsResult, identitiesResult, channelsResult] = due.length
    ? await Promise.all([
        db.from('contacts').select('id, organization_id, phone, full_name').in('id', contactIds),
        db
          .from('contact_identities')
          .select('contact_id, external_user_id, external_phone, channel')
          .in('contact_id', contactIds)
          .in('channel', ['whatsapp', 'sms']),
        db
          .from('channels')
          .select('id, organization_id, business_id, channel_type')
          .in('organization_id', organizationIds)
          .in('channel_type', ['whatsapp', 'sms'])
          .eq('is_active', true),
      ])
    : [null, null, null]

  // A failed lookup must not turn into "no recipient" for every appointment (the old
  // per-row code treated a failed lookup the same way, but only for that one row).
  if (contactsResult?.error || identitiesResult?.error || channelsResult?.error) {
    return NextResponse.json({ error: publicWebhookError() }, { status: 500 })
  }

  const contactById = new Map<string, { organization_id: string; phone: string | null }>()
  for (const row of contactsResult?.data ?? []) {
    contactById.set(row.id as string, { organization_id: row.organization_id as string, phone: row.phone as string | null })
  }
  const identityByContact = new Map<string, { channel: string; external_user_id: string | null; external_phone: string | null }>()
  for (const row of identitiesResult?.data ?? []) {
    if (!identityByContact.has(row.contact_id as string)) {
      identityByContact.set(row.contact_id as string, {
        channel: row.channel as string,
        external_user_id: row.external_user_id as string | null,
        external_phone: row.external_phone as string | null,
      })
    }
  }
  const channelByOrgAndType = new Map<string, { id: string; business_id: string | null }>()
  for (const row of channelsResult?.data ?? []) {
    const key = `${row.organization_id}:${row.channel_type}`
    if (!channelByOrgAndType.has(key)) {
      channelByOrgAndType.set(key, { id: row.id as string, business_id: row.business_id as string | null })
    }
  }

  for (const appt of due) {
    const starts = new Date(appt.starts_at).getTime()
    const delta = starts - now

    const needs1 = !appt.reminder_1h_sent_at && delta <= WINDOW_1H_MS + SKEW_MS && delta > 0

    const kind = needs1 ? '1h' : '24h'
    const column = kind === '1h' ? 'reminder_1h_sent_at' : 'reminder_24h_sent_at'

    try {
      await assertMarketingAllowed(db, {
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

    // Same tenant guard as the former per-row query (id AND organization_id).
    const stored = contactById.get(appt.contact_id as string)
    const contact = stored && stored.organization_id === appt.organization_id ? stored : null
    const identity = identityByContact.get(appt.contact_id as string) ?? null

    const channelType = identity?.channel === 'sms' ? 'sms' : 'whatsapp'
    const recipient =
      identity?.external_user_id || identity?.external_phone || contact?.phone || ''

    if (!recipient) {
      failed++
      continue
    }

    const channel = channelByOrgAndType.get(`${appt.organization_id}:${channelType}`)

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
      db,
      organizationId: appt.organization_id,
      businessId: channel.business_id,
      channelId: channel.id,
      eventType: 'appointment.reminder',
      idempotencyKey: `appt-reminder:${appt.id}:${kind}`,
      recipient,
      payload: { body, appointment_id: appt.id, kind },
    })

    const { error: markError } = await db
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

    await db.from('audit_events').insert({
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
