import { describe, expect, test } from 'bun:test'
import {
  isTrustedMetaEmbeddedSignupOrigin,
  parseMetaEmbeddedSignupEvent,
} from '@/lib/channels/embedded-signup-session'

describe('Meta Embedded Signup v5 session events', () => {
  test('accepts official HTTPS Facebook origins and rejects lookalike origins', () => {
    expect(isTrustedMetaEmbeddedSignupOrigin('https://www.facebook.com')).toBe(true)
    expect(isTrustedMetaEmbeddedSignupOrigin('https://business.facebook.com')).toBe(true)
    expect(isTrustedMetaEmbeddedSignupOrigin('http://www.facebook.com')).toBe(false)
    expect(isTrustedMetaEmbeddedSignupOrigin('https://facebook.com.attacker.example')).toBe(false)
    expect(isTrustedMetaEmbeddedSignupOrigin('https://notfacebook.com')).toBe(false)
  })

  test('reads v5 messaging_account_ids and recognizes Business App coexistence completion', () => {
    const result = parseMetaEmbeddedSignupEvent('https://www.facebook.com', JSON.stringify({
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'FINISH_WHATSAPP_BUSINESS_APP_ONBOARDING',
      data: {
        messaging_account_ids: ['122116429676001490'],
        phone_number_id: '122096621066000083',
        business_id: '123456789012345',
        is_on_biz_app: true,
        primary_waac_ids: ['123456789098765'],
      },
    }))

    expect(result).toEqual({
      kind: 'finish',
      session: {
        phoneNumberId: '122096621066000083',
        wabaId: '122116429676001490',
        businessPortfolioId: '123456789012345',
        isOnBusinessApp: true,
        primaryWaacIds: ['123456789098765'],
      },
    })
  })

  test('keeps backwards compatibility with older waba_id finish events', () => {
    const result = parseMetaEmbeddedSignupEvent('https://web.facebook.com', {
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'FINISH',
      data: { waba_id: '122116429676001490', phone_number_id: '122096621066000083' },
    })

    expect(result).toEqual({
      kind: 'finish',
      session: {
        phoneNumberId: '122096621066000083',
        wabaId: '122116429676001490',
        businessPortfolioId: null,
        isOnBusinessApp: false,
        primaryWaacIds: [],
      },
    })
  })

  test('handles cancellation and errors without passing them to the token exchange', () => {
    expect(parseMetaEmbeddedSignupEvent('https://www.facebook.com', {
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'CANCEL',
      data: { current_step: 'PHONE_NUMBER' },
    })).toEqual({ kind: 'cancel', currentStep: 'PHONE_NUMBER' })

    expect(parseMetaEmbeddedSignupEvent('https://www.facebook.com', {
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'ERROR',
      data: { error_code: 1001, error_message: 'Could not finish setup' },
    })).toEqual({ kind: 'error', message: 'Could not finish setup', code: '1001' })
  })

  test('ignores unrelated messages and events from non-Meta origins', () => {
    expect(parseMetaEmbeddedSignupEvent('https://evil.example', {
      type: 'WA_EMBEDDED_SIGNUP',
      event: 'FINISH',
      data: { waba_id: '122116429676001490' },
    })).toEqual({ kind: 'ignore' })

    expect(parseMetaEmbeddedSignupEvent('https://www.facebook.com', {
      type: 'OTHER',
      event: 'FINISH',
      data: {},
    })).toEqual({ kind: 'ignore' })
  })
})
