import type { DbClient } from '@/lib/db/client'
import { createNotification } from '@/lib/notifications'
import { enqueueOutbound } from '@/lib/channels/outbox'
import { staffHandoffNotice } from '@/lib/ai/governance'
import { getCentralBotConfig } from '@/lib/central-bot/config'
import { sendCentralOwnerCommunication } from '@/lib/central-bot/operations'

/**
 * Human handoff ("needs human") alerts.
 *
 * When a customer asks for a person, or the agent/governance decides to escalate, the
 * conversation is paused (status `handed_off`, state `human_handoff`, `ai_enabled=false`)
 * so the agent stops answering, an in-app notification is created, and a WhatsApp alert is
 * queued to the owner/supervisor phone. The outbox drain delivers it within seconds.
 */

function normalizeArabic(text: string): string {
  return text
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0640]/g, '')
    .replace(/[أإآ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/ؤ/g, 'و')
}

/** Who the customer wants: a person, not the bot. Plural "موظفين" (asking about staff) is excluded. */
const HUMAN_TARGET = /(موظف(?!ين|ون)|انسان|بشري|شخص حقيقي|المدير|مدير|المسوول|مسوول|الاداره|خدمه العملاء|الدعم الفني|\b(human|person|agent|representative|manager|someone real)\b)/
/** The request itself: talk / transfer / connect / want. */
const HANDOFF_INTENT = /(اكلم|اتكلم|احكي|اتواصل|التحدث|التواصل|تكلم|كلمني|كلموني|حولني|حولوني|حولني|وصلني|ابي|ابغي|ابغا|اريد|ابا|عايز|عاوز|ودي|بدي|ممكن|اطلب|\b(talk|speak|chat|connect|transfer|want|need)\b)/
const DIRECT_HUMAN_REQUEST = /(موظف حقيقي|شخص حقيقي|موظف بشري|مو بوت|مش بوت|ما ابي بوت|لا اريد بوت|\b(real|live) (person|human|agent)\b)/

export function detectHumanHandoffRequest(text: string | null | undefined): boolean {
  const value = normalizeArabic(String(text ?? '').trim())
  if (!value || value.length > 300) return false
  if (DIRECT_HUMAN_REQUEST.test(value)) return true
  return HUMAN_TARGET.test(value) && HANDOFF_INTENT.test(value)
}

export type HandoffSource = 'customer_request' | 'agent_tool' | 'governance'

export type HandoffAlertInput = {
  organizationId: string
  businessId: string | null
  conversationId: string
  contactId?: string | null
  channelId?: string | null
  reason: string
  lastMessage?: string | null
  source: HandoffSource
}

export type HandoffAlertDeps = {
  siteOrigin?: () => string
  resolveOwnerPhone?: (db: DbClient, organizationId: string) => Promise<string | null>
  notifyCentralBot?: (
    db: DbClient,
    input: { organizationId: string; title: string; body: string; dedupeKey: string; entityId: string }
  ) => Promise<void>
  now?: () => Date
}

export type HandoffAlertResult = {
  paused: boolean
  notificationCreated: boolean
  whatsappQueued: boolean
  alertPhone: string | null
  link: string
  customerReply: string
}

function defaultOrigin(): string {
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.APP_URL?.trim() ||
    (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` : '') ||
    'https://kayan-ai.up.railway.app'
  return raw.replace(/\/$/, '')
}

function digitsOnly(phone: string | null | undefined): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '')
  return digits.length >= 8 ? digits : null
}

/** business_profiles.handoff_alert_phone first, then the organization owner's login phone. */
async function defaultResolveOwnerPhone(db: DbClient, organizationId: string): Promise<string | null> {
  const profile = await db
    .from('business_profiles')
    .select('handoff_alert_phone')
    .eq('organization_id', organizationId)
    .maybeSingle()
  const configured = digitsOnly((profile.data as { handoff_alert_phone?: string | null } | null)?.handoff_alert_phone)
  if (configured) return configured

  const { data: owner } = await db
    .from('organization_members')
    .select('user_id')
    .eq('organization_id', organizationId)
    .eq('role', 'owner')
    .order('created_at', { ascending: true })
    .limit(1)
    .maybeSingle()
  if (!owner?.user_id) return null
  const { findUserById } = await import('@/lib/auth/users')
  const user = await findUserById(String(owner.user_id))
  return digitsOnly(user?.phone)
}

function reasonLabel(reason: string, source: HandoffSource): string {
  if (source === 'customer_request' || reason === 'customer_requested') return 'العميل طلب التحدث مع موظف'
  if (source === 'governance') return `تصعيد تلقائي من حوكمة الوكيل (${reason})`
  return `الوكيل طلب تدخلاً بشرياً: ${reason}`
}

export function buildHandoffAlertText(args: {
  customerName: string
  customerPhone: string
  reason: string
  lastMessage: string
  link: string
}): string {
  return [
    'تنبيه: طلب تدخل بشري - KAYAN AI',
    `العميل: ${args.customerName}`,
    `الرقم: ${args.customerPhone}`,
    `السبب: ${args.reason}`,
    args.lastMessage ? `آخر رسالة: ${args.lastMessage}` : null,
    `افتح المحادثة: ${args.link}`,
  ]
    .filter(Boolean)
    .join('\n')
}

export async function triggerHumanHandoff(
  db: DbClient,
  input: HandoffAlertInput,
  deps: HandoffAlertDeps = {}
): Promise<HandoffAlertResult> {
  const now = (deps.now ?? (() => new Date()))()
  const origin = (deps.siteOrigin ?? defaultOrigin)()
  const link = `${origin}/dashboard/conversations/${input.conversationId}`
  const reason = reasonLabel(input.reason, input.source)
  const lastMessage = String(input.lastMessage ?? '').replace(/\s+/g, ' ').trim().slice(0, 200)

  const { error: pauseError } = await db
    .from('conversations')
    .update({
      status: 'handed_off',
      state: 'human_handoff',
      ai_enabled: false,
      ai_paused_at: now.toISOString(),
      handoff_reason: input.reason.slice(0, 200),
      updated_at: now.toISOString(),
    })
    .eq('id', input.conversationId)
    .eq('organization_id', input.organizationId)
  if (pauseError) throw new Error('handoff_pause_failed: ' + pauseError.message)

  let customerName = 'عميل'
  let customerPhone = 'غير معروف'
  if (input.contactId) {
    const { data: contact } = await db
      .from('contacts')
      .select('full_name, phone')
      .eq('id', input.contactId)
      .eq('organization_id', input.organizationId)
      .maybeSingle()
    if (contact?.full_name) customerName = String(contact.full_name)
    if (contact?.phone) customerPhone = String(contact.phone)
  }

  // One alert per conversation per 10 minutes: retries and repeated requests do not spam.
  const bucket = Math.floor(now.getTime() / 600_000)
  const idempotencyKey = `handoff-alert:${input.conversationId}:${bucket}`

  const notification = await createNotification(db, {
    organizationId: input.organizationId,
    entityType: 'conversation',
    entityId: input.conversationId,
    notificationType: 'high_priority',
    title: `طلب تدخل بشري: ${customerName}`,
    body: `${customerPhone} — ${reason}${lastMessage ? ` — «${lastMessage}»` : ''}`,
    idempotencyKey,
  }).catch((error) => {
    console.error('handoff_notification_failed', error instanceof Error ? error.message : error)
    return null
  })

  let whatsappQueued = false
  let alertPhone: string | null = null
  try {
    alertPhone = await (deps.resolveOwnerPhone ?? defaultResolveOwnerPhone)(db, input.organizationId)
    if (alertPhone) {
      const channel = await resolveAlertChannel(db, input.organizationId, input.channelId ?? null)
      if (channel) {
        const id = await enqueueOutbound({
          db,
          organizationId: input.organizationId,
          businessId: input.businessId,
          channelId: channel,
          eventType: 'handoff_alert',
          idempotencyKey,
          recipient: alertPhone,
          payload: {
            kind: 'staff_alert',
            body: buildHandoffAlertText({ customerName, customerPhone, reason, lastMessage, link }),
            handoff_conversation_id: input.conversationId,
          },
        })
        // '' means the same alert was already queued in this window.
        whatsappQueued = typeof id === 'string'
      }
    }
  } catch (error) {
    console.error('handoff_whatsapp_alert_failed', error instanceof Error ? error.message : error)
  }

  if (deps.notifyCentralBot || getCentralBotConfig()) {
    const alertText = buildHandoffAlertText({ customerName, customerPhone, reason, lastMessage, link })
    try {
      if (deps.notifyCentralBot) {
        await deps.notifyCentralBot(db, {
          organizationId: input.organizationId,
          title: `طلب تدخل بشري: ${customerName}`,
          body: alertText,
          dedupeKey: `central-${idempotencyKey}`,
          entityId: input.conversationId,
        })
      } else {
        await sendCentralOwnerCommunication(db, {
          organizationId: input.organizationId,
          kind: 'alert',
          title: `طلب تدخل بشري: ${customerName}`,
          body: alertText,
          dedupeKey: `central-${idempotencyKey}`,
          createInAppNotification: false,
          entityType: 'conversation',
          entityId: input.conversationId,
        })
      }
    } catch (error) {
      console.error('handoff_central_alert_failed', error instanceof Error ? error.message : error)
    }
  }

  await db.from('audit_events').insert({
    organization_id: input.organizationId,
    business_id: input.businessId,
    actor_type: input.source === 'customer_request' ? 'system' : 'agent',
    action: 'conversation.handoff_alerted',
    entity_type: 'conversation',
    entity_id: input.conversationId,
    metadata: { reason: input.reason, source: input.source, whatsapp_queued: whatsappQueued },
  })

  console.info('handoff_alert', {
    organizationId: input.organizationId,
    conversationId: input.conversationId,
    source: input.source,
    whatsappQueued,
  })

  return {
    paused: true,
    notificationCreated: Boolean(notification),
    whatsappQueued,
    alertPhone,
    link,
    customerReply: staffHandoffNotice('ar'),
  }
}

async function resolveAlertChannel(db: DbClient, organizationId: string, preferred: string | null): Promise<string | null> {
  const { data } = await db
    .from('channels')
    .select('id, connection_mode, is_active')
    .eq('organization_id', organizationId)
    .eq('channel_type', 'whatsapp')
    .eq('is_active', true)
  const rows = (data ?? []) as Array<{ id: string; connection_mode: string | null }>
  if (!rows.length) return null
  const preferredRow = preferred ? rows.find((row) => row.id === preferred) : undefined
  // QR (personal number) channels can message the owner freely; Cloud API needs an open window.
  return (preferredRow ?? rows.find((row) => row.connection_mode === 'qr_unofficial') ?? rows[0]).id
}
