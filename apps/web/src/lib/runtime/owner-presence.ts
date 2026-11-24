import type { DbClient } from '@/lib/db/client'

/**
 * Owner presence ("the owner is replying himself").
 *
 * Every manual WhatsApp message from the owner (sender_type = human_whatsapp) renews a
 * sliding pause: human_paused_until = sent_at + human_takeover_pause_minutes. While the
 * pause is active the agent sends nothing; inbound messages are still stored as usual.
 * When the pause expires the periodic worker queues one idempotent inbound job per
 * conversation whose last customer message is still unanswered (last 24 hours only),
 * skipping every conversation the owner already answered, then clears the pause.
 */

export type TakeoverScope = 'channel' | 'conversation'

export type OwnerPresenceSettings = {
  enabled: boolean
  pauseMinutes: number
  scope: TakeoverScope
}

export const DEFAULT_PAUSE_MINUTES = 30
export const CATCH_UP_WINDOW_MS = 24 * 60 * 60 * 1000

type ChannelPresenceRow = {
  id: string
  organization_id: string
  business_id: string | null
  provider_account_id?: string | null
  external_identifier?: string | null
  human_takeover_enabled?: boolean | null
  human_takeover_pause_minutes?: number | null
  human_takeover_scope?: string | null
  human_paused_until?: string | null
  last_human_outbound_at?: string | null
}

export function normalizeSettings(row: Partial<ChannelPresenceRow> | null | undefined): OwnerPresenceSettings {
  const minutes = Number(row?.human_takeover_pause_minutes)
  return {
    enabled: row?.human_takeover_enabled !== false,
    pauseMinutes: Number.isInteger(minutes) && minutes >= 1 && minutes <= 1440 ? minutes : DEFAULT_PAUSE_MINUTES,
    scope: row?.human_takeover_scope === 'conversation' ? 'conversation' : 'channel',
  }
}

function later(a: string | null | undefined, b: string): string {
  if (!a) return b
  return Date.parse(a) > Date.parse(b) ? a : b
}

/** Renews the sliding pause after a manual owner message. */
export async function recordOwnerActivity(
  db: DbClient,
  input: { channelId: string; organizationId: string; conversationId: string; sentAt: string }
): Promise<{ paused: boolean; pausedUntil: string | null; scope: TakeoverScope }> {
  const { data: channel } = await db
    .from('channels')
    .select('id, human_takeover_enabled, human_takeover_pause_minutes, human_takeover_scope, human_paused_until')
    .eq('id', input.channelId)
    .eq('organization_id', input.organizationId)
    .maybeSingle()
  const settings = normalizeSettings(channel as unknown as ChannelPresenceRow | null)

  const sentAtMs = Number.isFinite(Date.parse(input.sentAt)) ? Date.parse(input.sentAt) : Date.now()
  const sentAt = new Date(sentAtMs).toISOString()
  const pausedUntil = new Date(sentAtMs + settings.pauseMinutes * 60_000).toISOString()

  // The timestamp is recorded even when the feature is off, for the inbox and analytics.
  const conversationPatch: Record<string, unknown> = { last_human_outbound_at: sentAt }
  if (settings.enabled) conversationPatch.human_paused_until = pausedUntil
  await db.from('conversations').update(conversationPatch)
    .eq('id', input.conversationId).eq('organization_id', input.organizationId)

  const channelPatch: Record<string, unknown> = { last_human_outbound_at: sentAt }
  if (settings.enabled && settings.scope === 'channel') {
    channelPatch.human_paused_until = later((channel as unknown as ChannelPresenceRow | null)?.human_paused_until, pausedUntil)
  }
  await db.from('channels').update(channelPatch)
    .eq('id', input.channelId).eq('organization_id', input.organizationId)

  console.info('owner_presence_pause_renewed', {
    channelId: input.channelId, conversationId: input.conversationId,
    enabled: settings.enabled, scope: settings.scope, pausedUntil: settings.enabled ? pausedUntil : null,
  })
  return { paused: settings.enabled, pausedUntil: settings.enabled ? pausedUntil : null, scope: settings.scope }
}

/** True while the owner's sliding pause blocks automatic replies on this conversation. */
export async function isOwnerPauseActive(
  db: DbClient,
  input: { channelId: string; conversationId: string; now?: Date }
): Promise<boolean> {
  const now = (input.now ?? new Date()).getTime()
  const [{ data: channel }, { data: conversation }] = await Promise.all([
    db.from('channels')
      .select('id, human_takeover_enabled, human_takeover_scope, human_paused_until')
      .eq('id', input.channelId).maybeSingle(),
    db.from('conversations')
      .select('id, human_paused_until')
      .eq('id', input.conversationId).maybeSingle(),
  ])
  const settings = normalizeSettings(channel as unknown as ChannelPresenceRow | null)
  if (!settings.enabled) return false
  const active = (value: unknown) => typeof value === 'string' && Date.parse(value) > now
  if (settings.scope === 'channel' && active((channel as unknown as ChannelPresenceRow | null)?.human_paused_until)) return true
  return active((conversation as { human_paused_until?: string | null } | null)?.human_paused_until)
}

type ConversationRow = {
  id: string
  organization_id: string
  business_id: string | null
  channel_id: string
  contact_id: string
  status: string | null
  state: string | null
  ai_enabled: boolean | null
  last_inbound_at: string | null
  last_outbound_at: string | null
  human_paused_until?: string | null
}

/** Unanswered = the customer spoke last, recently, and nobody (owner or agent) replied. */
export function isUnansweredForCatchUp(row: ConversationRow, now: Date): boolean {
  if (!row.last_inbound_at) return false
  if (row.ai_enabled === false) return false
  if (row.status === 'closed' || row.status === 'handed_off') return false
  if (row.state === 'human_handoff' || row.state === 'closed') return false
  const inbound = Date.parse(row.last_inbound_at)
  const outbound = row.last_outbound_at ? Date.parse(row.last_outbound_at) : 0
  if (!(inbound > outbound)) return false
  return now.getTime() - inbound <= CATCH_UP_WINDOW_MS
}

export type CatchUpPayload = {
  channelId: string
  organizationId: string
  businessId: string
  externalEventId: string
  senderJid: string
  senderPhone: string | null
  displayName: string | null
  text: string
  providerAccountId: string | null
  externalIdentifier: string | null
  catchUp: true
  conversationId: string
}

async function enqueueCatchUp(db: DbClient, channel: ChannelPresenceRow, conversation: ConversationRow): Promise<boolean> {
  const { data: message } = await db.from('messages')
    .select('id, content, external_message_id, created_at')
    .eq('conversation_id', conversation.id).eq('direction', 'inbound')
    .order('created_at', { ascending: false }).limit(1).maybeSingle()
  if (!message?.id || !message.content) return false

  const [{ data: identity }, { data: contact }] = await Promise.all([
    db.from('contact_identities').select('external_user_id')
      .eq('contact_id', conversation.contact_id).eq('channel', 'whatsapp').limit(1).maybeSingle(),
    db.from('contacts').select('phone, full_name').eq('id', conversation.contact_id).maybeSingle(),
  ])
  const senderJid = String(identity?.external_user_id ?? contact?.phone ?? '')
  if (!senderJid || !channel.business_id) return false

  const payload: CatchUpPayload = {
    channelId: channel.id,
    organizationId: channel.organization_id,
    businessId: channel.business_id,
    externalEventId: String(message.external_message_id ?? `catchup:${message.id}`),
    senderJid,
    senderPhone: contact?.phone ? String(contact.phone) : null,
    displayName: contact?.full_name ? String(contact.full_name) : null,
    text: String(message.content),
    providerAccountId: channel.provider_account_id ?? null,
    externalIdentifier: channel.external_identifier ?? null,
    catchUp: true,
    conversationId: conversation.id,
  }
  const { error } = await db.from('inbound_jobs').insert({
    organization_id: channel.organization_id,
    business_id: channel.business_id,
    channel_id: channel.id,
    // One catch-up per unanswered customer message, however many workers run.
    idempotency_key: `owner-catchup:${conversation.id}:${message.id}`,
    payload,
    status: 'queued',
  })
  if (error && error.code !== '23505') throw new Error('catch_up_enqueue_failed: ' + error.message)
  return !error
}

const CHANNEL_COLUMNS = 'id, organization_id, business_id, provider_account_id, external_identifier, human_takeover_enabled, human_takeover_pause_minutes, human_takeover_scope, human_paused_until, last_human_outbound_at'
const CONVERSATION_COLUMNS = 'id, organization_id, business_id, channel_id, contact_id, status, state, ai_enabled, last_inbound_at, last_outbound_at, human_paused_until'

/**
 * Periodic catch-up after the owner's pause expires. Each expired pause is claimed with a
 * compare-and-clear on human_paused_until, so only one worker acts on it and a fresh owner
 * message (which moves the timestamp forward) cancels the claim.
 */
export async function runOwnerPresenceCatchUp(db: DbClient, now = new Date()): Promise<{ channels: number; conversations: number; queued: number }> {
  const nowIso = now.toISOString()
  const since = new Date(now.getTime() - CATCH_UP_WINDOW_MS).toISOString()
  let queued = 0
  let channelCount = 0
  const handled = new Set<string>()

  const { data: channels, error } = await db.from('channels').select(CHANNEL_COLUMNS)
    .lte('human_paused_until', nowIso).limit(50)
  if (error) throw new Error('owner_presence_channels_failed: ' + error.message)

  for (const channel of (channels ?? []) as ChannelPresenceRow[]) {
    const { data: claimed } = await db.from('channels').update({ human_paused_until: null })
      .eq('id', channel.id).eq('human_paused_until', channel.human_paused_until as string).select('id')
    if (!Array.isArray(claimed) || claimed.length === 0) continue
    channelCount += 1
    if (!normalizeSettings(channel).enabled) continue

    const { data: conversations } = await db.from('conversations').select(CONVERSATION_COLUMNS)
      .eq('channel_id', channel.id).gte('last_inbound_at', since)
      .order('last_inbound_at', { ascending: false }).limit(200)
    for (const conversation of (conversations ?? []) as ConversationRow[]) {
      // A conversation-level pause still running (owner just wrote there) is left alone.
      if (conversation.human_paused_until && Date.parse(conversation.human_paused_until) > now.getTime()) continue
      handled.add(conversation.id)
      if (!isUnansweredForCatchUp(conversation, now)) continue
      if (await enqueueCatchUp(db, channel, conversation)) queued += 1
    }
    await db.from('conversations').update({ human_paused_until: null })
      .eq('channel_id', channel.id).lte('human_paused_until', nowIso)
  }

  // Conversation-scoped pauses.
  const { data: paused } = await db.from('conversations').select(CONVERSATION_COLUMNS)
    .lte('human_paused_until', nowIso).limit(200)
  let conversationCount = 0
  for (const conversation of (paused ?? []) as ConversationRow[]) {
    const { data: claimed } = await db.from('conversations').update({ human_paused_until: null })
      .eq('id', conversation.id).eq('human_paused_until', conversation.human_paused_until as string).select('id')
    if (!Array.isArray(claimed) || claimed.length === 0 || handled.has(conversation.id)) continue
    conversationCount += 1
    const { data: channel } = await db.from('channels').select(CHANNEL_COLUMNS).eq('id', conversation.channel_id).maybeSingle()
    if (!channel || !normalizeSettings(channel as unknown as ChannelPresenceRow).enabled) continue
    // A channel-wide pause still running keeps the whole number quiet.
    const channelPausedUntil = (channel as unknown as ChannelPresenceRow).human_paused_until
    if (channelPausedUntil && Date.parse(channelPausedUntil) > now.getTime()) continue
    if (!isUnansweredForCatchUp(conversation, now)) continue
    if (await enqueueCatchUp(db, channel as unknown as ChannelPresenceRow, conversation)) queued += 1
  }

  if (queued > 0 || channelCount > 0 || conversationCount > 0) {
    console.info('owner_presence_catch_up', { channels: channelCount, conversations: conversationCount, queued })
  }
  return { channels: channelCount, conversations: conversationCount, queued }
}

/** Re-checked when the catch-up job runs: the owner may have answered in the meantime. */
export async function catchUpStillNeeded(db: DbClient, conversationId: string, now = new Date()): Promise<boolean> {
  const { data } = await db.from('conversations').select(CONVERSATION_COLUMNS).eq('id', conversationId).maybeSingle()
  if (!data) return false
  return isUnansweredForCatchUp(data as unknown as ConversationRow, now)
}
