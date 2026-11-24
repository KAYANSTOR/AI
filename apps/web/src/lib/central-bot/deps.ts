import type { DbClient } from '@/lib/db/client'
import { deliverOutbound } from '@/lib/runtime/outbound'
import { normalizeE164 } from '@/lib/channels/contacts'
import { loadPersonalAssistantAccess } from '@/lib/personal-assistant/access'
import { appendThreadMessage } from '@/lib/personal-assistant/thread'
import { runPersonalAssistantTurn } from '@/lib/personal-assistant/runtime'
import { payloadHash } from '@/lib/personal-assistant/executive/hash'
import type { EngineDeps, Owner } from '@/lib/personal-assistant/executive/engine'
import { appBaseUrl, getCentralBotConfig } from './config'
import { downloadCentralMedia, sendCentralButtons, sendCentralText } from './meta-client'
import { transcribeAudioWithGemini } from './transcribe'
import type { CentralDeps } from './router'
import { buildTrainerDeps } from '@/lib/trainer/deps'

/** Production wiring. Tests inject their own deps instead. */
async function linkedPhone(db: DbClient, owner: Owner) {
  const { data } = await db.from('personal_assistant_links').select('whatsapp_phone, verified_at')
    .eq('org_id', owner.organizationId).eq('user_id', owner.userId).maybeSingle()
  return data?.verified_at && data.whatsapp_phone ? String(data.whatsapp_phone) : null
}

/** Sends a customer message through the org's own WhatsApp business channel (outbox, never inline). */
async function sendCustomerMessage(db: DbClient, owner: Owner, input: Record<string, unknown>) {
  const phone = normalizeE164(String(input.phone ?? ''))
  const body = String(input.body ?? '').trim().slice(0, 2000)
  if (!/^\+[1-9][0-9]{7,14}$/.test(phone) || !body) throw new Error('invalid_customer_message')
  const { data: channel } = await db.from('channels')
    .select('id, organization_id, business_id, channel_type, provider_account_id, external_identifier, connection_mode')
    .eq('organization_id', owner.organizationId).eq('channel_type', 'whatsapp').eq('is_active', true)
    .order('created_at', { ascending: true }).limit(1).maybeSingle()
  if (!channel) throw new Error('customer_channel_not_configured')
  const status = await deliverOutbound(db, {
    channel: {
      id: String(channel.id),
      organizationId: String(channel.organization_id),
      businessId: (channel.business_id as string | null) ?? null,
      channelType: String(channel.channel_type),
      providerAccountId: (channel.provider_account_id as string | null) ?? null,
      externalIdentifier: (channel.external_identifier as string | null) ?? null,
      connectionMode: (channel.connection_mode as string | null) ?? null,
    },
    recipient: phone.replace(/^\+/, ''),
    body,
    idempotencyKey: `agent-msg:${payloadHash({ org: owner.organizationId, phone, body })}`,
    senderType: 'ai',
    // The owner is starting this conversation, so the 24-hour window applies.
    initiatedBy: 'business',
  })
  if (status === 'blocked') throw new Error('customer_message_blocked')
  return { to: phone, status }
}

export function buildEngineDeps(db: DbClient): EngineDeps {
  const config = getCentralBotConfig()
  return {
    executors: { send_customer_message: sendCustomerMessage },
    notify: async (owner, notice) => {
      await appendThreadMessage(db, owner, {
        direction: 'outbound',
        source: 'system',
        type: notice.kind === 'approval' ? 'approval' : notice.kind === 'receipt' ? 'receipt' : 'text',
        content: notice.text,
        taskId: notice.taskId,
      })
      if (!config) return
      const phone = await linkedPhone(db, owner)
      if (!phone) return
      if (notice.approval) {
        await sendCentralButtons(config, phone, notice.text, [
          { id: `approve:${notice.approval.id}:${notice.approval.hash}`, title: 'تأكيد التنفيذ' },
          { id: `reject:${notice.approval.id}`, title: 'رفض' },
        ])
      } else {
        await sendCentralText(config, phone, notice.text)
      }
    },
  }
}

export function buildCentralDeps(db: DbClient): CentralDeps | null {
  const config = getCentralBotConfig()
  if (!config) return null
  const engine = buildEngineDeps(db)
  return {
    hasAccess: (client, organizationId) => loadPersonalAssistantAccess(client, organizationId),
    sendText: (to, text) => sendCentralText(config, to, text),
    sendButtons: (to, text, buttons) => sendCentralButtons(config, to, text, buttons),
    transcribe: async (mediaId) => transcribeAudioWithGemini(await downloadCentralMedia(config, mediaId)),
    runTurn: (client, owner, text) => runPersonalAssistantTurn(client, owner, text, { engine }),
    signupUrl: `${appBaseUrl()}/signup`,
    engine,
    trainer: buildTrainerDeps(db, config),
  }
}

/** Mirror a web-chat reply to the linked WhatsApp number (best effort). */
export async function mirrorToWhatsApp(db: DbClient, owner: Owner, text: string) {
  const config = getCentralBotConfig()
  if (!config) return false
  const phone = await linkedPhone(db, owner)
  if (!phone) return false
  try { await sendCentralText(config, phone, text); return true } catch (error) {
    console.error('central_mirror_failed', { reason: error instanceof Error ? error.message : 'unknown' })
    return false
  }
}
