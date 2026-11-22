import { describe, expect, test } from 'bun:test'
import {
  CHANNEL_CREDENTIAL_FIELDS,
  PROVIDER_FOR_CHANNEL,
  isCredentialField,
} from '../src/lib/credentials/catalog'
import {
  CHANNEL_CREDENTIAL_CONTRACTS,
  WHATSAPP_CONNECTION_MODES,
  WHATSAPP_QR_SESSION_CREDENTIAL,
  isChannelConnectionMode,
  isProviderChannelType,
  isWhatsAppConnectionMode,
  type ProviderChannelType,
} from '../src/lib/channels/contracts'

describe('provider channel contracts', () => {
  test('declares Telegram and Messenger as persisted provider channel types', () => {
    const types: ProviderChannelType[] = ['telegram', 'messenger']
    expect(types).toEqual(['telegram', 'messenger'])
    expect(CHANNEL_CREDENTIAL_CONTRACTS.telegram?.provider).toBe('telegram')
    expect(CHANNEL_CREDENTIAL_CONTRACTS.messenger?.provider).toBe('meta')
    expect(isProviderChannelType('telegram')).toBe(true)
    expect(isProviderChannelType('messenger')).toBe(true)
    expect(isProviderChannelType('unknown')).toBe(false)
  })

  test('catalogues provider secrets without exposing values', () => {
    expect(PROVIDER_FOR_CHANNEL.telegram).toBe('telegram')
    expect(PROVIDER_FOR_CHANNEL.messenger).toBe('meta')
    expect(PROVIDER_FOR_CHANNEL.website).toBe('website')
    expect(isCredentialField('telegram', 'bot_token')).toBe(true)
    expect(isCredentialField('telegram', 'webhook_secret')).toBe(true)
    expect(isCredentialField('messenger', 'page_access_token')).toBe(true)
    expect(isCredentialField('website', 'widget_signing_secret')).toBe(true)
    expect(isCredentialField('website', 'public_key')).toBe(false)
    expect(isCredentialField('email', 'password')).toBe(false)
    expect(CHANNEL_CREDENTIAL_FIELDS.telegram?.every((field) => field.secret)).toBe(true)
  })

  test('keeps QR session material separate from Meta Cloud API credentials', () => {
    expect(WHATSAPP_QR_SESSION_CREDENTIAL.provider).toBe('whatsapp_web')
    expect(WHATSAPP_QR_SESSION_CREDENTIAL.credentialTypes).toEqual(['session_data'])
    expect(WHATSAPP_QR_SESSION_CREDENTIAL.secretsMustBeEncrypted).toBe(true)
    expect(WHATSAPP_CONNECTION_MODES.map((mode) => mode.value)).toEqual([
      'cloud_api',
      'coexistence',
      'qr_unofficial',
    ])
    expect(WHATSAPP_CONNECTION_MODES.find((mode) => mode.value === 'qr_unofficial')?.official).toBe(false)
    expect(isWhatsAppConnectionMode('cloud_api')).toBe(true)
    expect(isWhatsAppConnectionMode('native')).toBe(false)
    expect(isChannelConnectionMode('native')).toBe(true)
    expect(isChannelConnectionMode('invalid')).toBe(false)
  })
})
