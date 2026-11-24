import type { DbClient } from '@/lib/db/client'
import { resolveLastInboundAt } from '@/lib/channels/last-inbound'
import { buildTemplateParameters, findApprovedTemplate, type WhatsAppTemplateRow } from '@/lib/channels/whatsapp-templates'
import { planWhatsAppDelivery } from '@/lib/channels/whatsapp-window'

export type WhatsAppTemplatePayload = { name: string; languageCode: string; bodyParameters?: string[] }

export type SmartWhatsAppPlan =
  | { kind: 'text' }
  | { kind: 'template'; template: WhatsAppTemplatePayload; resolvedRow: WhatsAppTemplateRow | null }
  | { kind: 'blocked'; reason: 'template_required' | 'inbound_unknown_but_required'; lastInboundAt: string | null }

/**
 * Shared decision for business-initiated WhatsApp messages (reminders, follow-ups,
 * campaigns, assistant notifications, owner-initiated customer messages).
 *
 * Outside Meta's 24-hour window an approved template is mandatory. This returns the
 * concrete template payload (never sends anything), so both the outbox worker and the
 * inline delivery path behave identically.
 */
export async function planBusinessWhatsApp(
  db: DbClient,
  input: {
    organizationId: string
    channelId: string
    connectionMode?: string | null
    recipient: string
    conversationId?: string | null
    explicitTemplate?: WhatsAppTemplatePayload | null
    templateVariables?: unknown
    now?: Date
  }
): Promise<SmartWhatsAppPlan> {
  if (input.connectionMode === 'qr_unofficial') return { kind: 'text' }

  const lastInboundAt = await resolveLastInboundAt(db, {
    organizationId: input.organizationId,
    channelId: input.channelId,
    recipient: input.recipient,
    conversationId: input.conversationId ?? null,
  })

  const explicit = input.explicitTemplate ?? null
  let approvedRow: WhatsAppTemplateRow | null = null
  if (!explicit) {
    approvedRow = await findApprovedTemplate(db, {
      organizationId: input.organizationId,
      channelId: input.channelId,
    })
  }

  const plan = planWhatsAppDelivery({
    channelType: 'whatsapp',
    connectionMode: input.connectionMode ?? null,
    initiatedBy: 'business',
    lastInboundAt,
    now: input.now,
    approvedTemplate: explicit
      ? { name: explicit.name, languageCode: explicit.languageCode }
      : approvedRow
        ? { name: approvedRow.template_name, languageCode: approvedRow.language_code }
        : null,
  })

  if (plan.kind === 'text') return { kind: 'text' }
  if (plan.kind === 'blocked') return { kind: 'blocked', reason: plan.reason, lastInboundAt }

  if (explicit) return { kind: 'template', template: explicit, resolvedRow: null }
  if (!approvedRow) return { kind: 'blocked', reason: 'template_required', lastInboundAt }

  const rawValues = Array.isArray(input.templateVariables) ? input.templateVariables : []
  const values = rawValues.map((value) => String(value ?? '').slice(0, 200))
  return {
    kind: 'template',
    resolvedRow: approvedRow,
    template: {
      name: approvedRow.template_name,
      languageCode: approvedRow.language_code,
      bodyParameters: buildTemplateParameters(approvedRow.body_text, values),
    },
  }
}
