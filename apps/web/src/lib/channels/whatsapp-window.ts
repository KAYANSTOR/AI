/**
 * Customer service window (WhatsApp Cloud API).
 *
 * Meta only allows free-form text within 24 hours of the customer's last inbound
 * message. Outside that window a business-initiated message MUST be an approved
 * template. This module is the single decision point used by the outbox worker so a
 * reminder/follow-up/campaign never fails silently after the window closed.
 */
export const CUSTOMER_SERVICE_WINDOW_MS = 24 * 60 * 60 * 1000

export type WhatsAppDeliveryPlan =
  | { kind: 'text'; reason: 'customer_initiated' | 'inside_window' | 'not_cloud_api' }
  | { kind: 'template'; reason: 'outside_window'; templateKey?: { name: string; languageCode: string } }
  | { kind: 'blocked'; reason: 'template_required' | 'inbound_unknown_but_required' }

export type WhatsAppWindowState = {
  open: boolean
  lastInboundAt: string | null
  expiresAt: string | null
  remainingMs: number
}

export function whatsappWindowState(lastInboundAt: string | Date | null | undefined, now: Date = new Date()): WhatsAppWindowState {
  const parsed = lastInboundAt ? new Date(lastInboundAt) : null
  const time = parsed && Number.isFinite(parsed.getTime()) ? parsed.getTime() : null
  if (time === null) return { open: false, lastInboundAt: null, expiresAt: null, remainingMs: 0 }
  const expires = time + CUSTOMER_SERVICE_WINDOW_MS
  const remainingMs = expires - now.getTime()
  return {
    open: remainingMs > 0,
    lastInboundAt: new Date(time).toISOString(),
    expiresAt: new Date(expires).toISOString(),
    remainingMs: Math.max(0, remainingMs),
  }
}

/**
 * Decides how a queued WhatsApp message is delivered.
 *
 * - Replies to a customer (customer-initiated) are always free-form text: by
 *   definition they follow an inbound message.
 * - Business-initiated messages (reminders, follow-ups, campaigns, assistant
 *   notifications) use text inside the window, an approved template outside it, and
 *   are explicitly blocked (dead-letter + audit) when no approved template exists.
 * - QR/unofficial connections have no template support, so text is kept.
 */
export function planWhatsAppDelivery(input: {
  channelType: string
  connectionMode?: string | null
  initiatedBy: 'business' | 'customer'
  lastInboundAt?: string | Date | null
  now?: Date
  approvedTemplate?: { name: string; languageCode: string } | null
}): WhatsAppDeliveryPlan {
  if (input.channelType !== 'whatsapp') return { kind: 'text', reason: 'not_cloud_api' }
  if (input.connectionMode === 'qr_unofficial') return { kind: 'text', reason: 'not_cloud_api' }
  if (input.initiatedBy === 'customer') return { kind: 'text', reason: 'customer_initiated' }

  const window = whatsappWindowState(input.lastInboundAt, input.now ?? new Date())
  if (window.open) return { kind: 'text', reason: 'inside_window' }
  if (input.approvedTemplate) {
    return { kind: 'template', reason: 'outside_window', templateKey: input.approvedTemplate }
  }
  return {
    kind: 'blocked',
    reason: window.lastInboundAt ? 'template_required' : 'inbound_unknown_but_required',
  }
}

/** Event types that are initiated by the business, not by a customer reply. */
const BUSINESS_INITIATED_EVENTS = new Set([
  'appointment.reminder',
  'campaign.send',
  'followup.step',
  'personal_assistant',
  'personal_assistant.send',
  'agent.outreach',
])

export function isBusinessInitiatedEvent(eventType: string | null | undefined): boolean {
  return eventType ? BUSINESS_INITIATED_EVENTS.has(eventType) : false
}
