import { sendWhatsAppText } from '@/lib/providers/meta'
import { callWhatsAppGateway } from '@/lib/providers/whatsapp-gateway'

export type WhatsAppConnectionMode = 'cloud_api' | 'coexistence' | 'qr_unofficial'
export type WhatsAppProvider = 'meta' | 'baileys'

export type NormalizedInboundMessage = {
  provider: WhatsAppProvider
  connectionMode: WhatsAppConnectionMode
  externalMessageId: string | null
  from: string
  to: string | null
  text: string | null
  mediaType: 'audio' | 'image' | 'document' | 'video' | null
  mimeType: string | null
  fileName: string | null
  caption: string | null
  mediaUrl: string | null
  mediaBuffer: Uint8Array | null
  raw: Record<string, unknown>
}

export type WhatsAppAdapterCredentials = Record<string, string>

export interface WhatsAppProviderAdapter {
  readonly provider: WhatsAppProvider
  readonly connectionMode: WhatsAppConnectionMode
  sendText(input: {
    credentials: WhatsAppAdapterCredentials
    from: string
    to: string
    body: string
    channelId?: string
  }): Promise<{ messageId: string | null }>
}

export class MetaWhatsAppAdapter implements WhatsAppProviderAdapter {
  readonly provider = 'meta' as const
  constructor(public readonly connectionMode: 'cloud_api' | 'coexistence') {
    if (connectionMode === ('qr_unofficial' as string)) {
      throw new Error('meta_adapter_cannot_send_qr_unofficial')
    }
  }

  async sendText(input: { credentials: WhatsAppAdapterCredentials; from: string; to: string; body: string }) {
    await sendWhatsAppText(
      {
        access_token: input.credentials.access_token,
        phone_number_id: input.from,
      },
      input.to,
      input.body
    )
    return { messageId: null }
  }
}

/**
 * Baileys is deliberately isolated behind this adapter. The runtime registers the
 * session transport at startup; no Baileys session or socket is ever used by Meta.
 */
export type BaileysSendText = (input: {
  credentials: WhatsAppAdapterCredentials
  from: string
  to: string
  body: string
  channelId?: string
}) => Promise<{ messageId: string | null }>

let baileysSendText: BaileysSendText | null = null

export function registerBaileysSendText(sender: BaileysSendText) {
  baileysSendText = sender
}

export class BaileysWhatsAppAdapter implements WhatsAppProviderAdapter {
  readonly provider = 'baileys' as const
  readonly connectionMode = 'qr_unofficial' as const
  async sendText(input: { credentials: WhatsAppAdapterCredentials; from: string; to: string; body: string; channelId?: string }) {
    if (baileysSendText) return baileysSendText(input)
    if (!input.channelId) throw new Error('baileys_transport_not_configured')
    return callWhatsAppGateway('POST', '/sessions/' + input.channelId + '/send', {
      recipient: input.to,
      text: input.body,
    }).then(() => ({ messageId: null }))
  }
}

export function adapterForWhatsAppMode(mode: string | null | undefined): WhatsAppProviderAdapter {
  switch (mode ?? 'cloud_api') {
    case 'cloud_api': return new MetaWhatsAppAdapter('cloud_api')
    case 'coexistence': return new MetaWhatsAppAdapter('coexistence')
    case 'qr_unofficial': return new BaileysWhatsAppAdapter()
    default: throw new Error('unsupported_whatsapp_connection_mode:' + mode)
  }
}

function stringValue(value: unknown): string | null {
  return typeof value === 'string' && value.trim() ? value.trim() : null
}

/** Normalize provider-specific inbound envelopes before they reach the runtime. */
export function normalizeWhatsAppInbound(
  raw: Record<string, unknown>,
  input: { provider: WhatsAppProvider; connectionMode: WhatsAppConnectionMode; from: string; to?: string | null }
): NormalizedInboundMessage {
  const type = stringValue(raw.type)
  const payload = (type && raw[type] && typeof raw[type] === 'object' ? raw[type] : {}) as Record<string, unknown>
  const textPayload = raw.text && typeof raw.text === 'object' ? raw.text as Record<string, unknown> : {}
  const caption = stringValue(payload.caption)
  const text = stringValue(textPayload.body) ?? (type === 'text' ? stringValue(raw.body) : null)
  const mediaType = type === 'audio' || type === 'image' || type === 'document' || type === 'video' ? type : null
  return {
    provider: input.provider,
    connectionMode: input.connectionMode,
    externalMessageId: stringValue(raw.id),
    from: input.from,
    to: input.to ?? stringValue(raw.to),
    text,
    mediaType,
    mimeType: stringValue(payload.mime_type) ?? stringValue(payload.mimetype),
    fileName: stringValue(payload.filename) ?? stringValue(payload.fileName),
    caption,
    mediaUrl: stringValue(payload.url),
    mediaBuffer: payload.buffer instanceof Uint8Array ? payload.buffer : null,
    raw,
  }
}
