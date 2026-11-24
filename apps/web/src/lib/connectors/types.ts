export type ConnectorProvider = 'gmail' | 'google_calendar'

export type ConnectorDefinition = {
  provider: ConnectorProvider
  labelAr: string
  descriptionAr: string
  scopes: string[]
}

const GMAIL_SCOPES = [
  'https://www.googleapis.com/auth/gmail.readonly',
  'https://www.googleapis.com/auth/gmail.compose',
  'https://www.googleapis.com/auth/gmail.send',
]
const CALENDAR_SCOPES = ['https://www.googleapis.com/auth/calendar.events']

export const CONNECTORS: Record<ConnectorProvider, ConnectorDefinition> = {
  gmail: {
    provider: 'gmail',
    labelAr: 'Gmail',
    descriptionAr: 'قراءة وتلخيص الرسائل الحديثة، وإنشاء مسودة أو إرسال بريد بموافقتك.',
    scopes: [...GMAIL_SCOPES, 'openid', 'email'],
  },
  google_calendar: {
    provider: 'google_calendar',
    labelAr: 'Google Calendar',
    descriptionAr: 'قراءة جدول المواعيد وإضافة حدث أو تعديله بموافقتك.',
    scopes: [...CALENDAR_SCOPES, 'openid', 'email'],
  },
}

export const CONNECTOR_PROVIDERS = Object.keys(CONNECTORS) as ConnectorProvider[]

export function isConnectorProvider(value: unknown): value is ConnectorProvider {
  return value === 'gmail' || value === 'google_calendar'
}

export type ConnectorConnectionRow = {
  id: string
  org_id: string
  user_id: string
  provider: ConnectorProvider
  account_email: string | null
  scopes: string[] | null
  encrypted_tokens?: string | null
  token_expires_at: string | null
  status: 'active' | 'revoked' | 'error'
  last_error: string | null
  connected_at: string
  updated_at: string | null
}

export type ConnectorPublicView = {
  provider: ConnectorProvider
  labelAr: string
  connected: boolean
  status: 'active' | 'revoked' | 'error' | 'disconnected'
  accountEmail: string | null
  scopes: string[]
  tokenExpiresAt: string | null
  lastError: string | null
  connectedAt: string | null
}

export type GoogleTokens = {
  access_token: string
  refresh_token?: string | null
  token_type?: string | null
  scope?: string | null
  expires_at?: string | null
}
