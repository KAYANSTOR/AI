export type ChannelType = 'phone' | 'whatsapp' | 'instagram' | 'sms' | 'website'

export type NormalizedEventType =
  | 'message.received'
  | 'message.sent'
  | 'call.started'
  | 'call.ended'
  | 'tool.requested'

export type NormalizedEvent = {
  type: NormalizedEventType
  channel: ChannelType
  provider: string
  externalEventId: string
  organizationId?: string
  contactExternalId?: string
  contactPhone?: string
  timestamp: string
  payload: Record<string, unknown>
  text?: string
}

export function makeEventId(provider: string, externalEventId: string): string {
  return `${provider}:${externalEventId}`
}
