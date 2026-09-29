import { describe, expect, test } from 'bun:test'
import { createHmac } from 'node:crypto'
import { verifyMetaSignature, verifyTwilioSignature, verifyVapiRequest } from '@/lib/runtime/security'

process.env.META_APP_SECRET = 'unit-test-meta-secret'
delete process.env.WHATSAPP_APP_SECRET

function metaSignature(body: string, secret = 'unit-test-meta-secret') {
  return 'sha256=' + createHmac('sha256', secret).update(body, 'utf8').digest('hex')
}

function twilioSignature(rawUrl: string, params: Record<string, string>, token: string) {
  const data = rawUrl + Object.keys(params).sort().map((key) => key + params[key]).join('')
  return createHmac('sha1', token).update(data, 'utf8').digest('base64')
}

describe('Meta webhook signature', () => {
  const body = JSON.stringify({ entry: [{ id: '1' }] })

  test('accepts a signature produced with the app secret', () => {
    const headers = new Headers({ 'x-hub-signature-256': metaSignature(body) })
    expect(verifyMetaSignature(body, headers)).toBe(true)
  })

  test('rejects a tampered body that keeps the original signature', () => {
    const headers = new Headers({ 'x-hub-signature-256': metaSignature(body) })
    expect(verifyMetaSignature(body + ' ', headers)).toBe(false)
  })

  test('rejects a signature produced with the wrong secret', () => {
    const headers = new Headers({ 'x-hub-signature-256': metaSignature(body, 'attacker-secret') })
    expect(verifyMetaSignature(body, headers)).toBe(false)
  })

  test('rejects a missing or malformed header', () => {
    expect(verifyMetaSignature(body, new Headers())).toBe(false)
    expect(verifyMetaSignature(body, new Headers({ 'x-hub-signature-256': metaSignature(body).slice(7) }))).toBe(false)
  })

  test('rejects everything when the app secret is not configured', () => {
    const saved = process.env.META_APP_SECRET
    delete process.env.META_APP_SECRET
    expect(verifyMetaSignature(body, new Headers({ 'x-hub-signature-256': metaSignature(body) }))).toBe(false)
    process.env.META_APP_SECRET = saved
  })
})

describe('Twilio webhook signature', () => {
  const url = 'https://app.example.com/api/sms/webhook'
  const params = { From: '+15550001', To: '+15550002', Body: 'hi' }
  const token = 'unit-test-twilio-token'

  test('accepts the exact request the provider signed', () => {
    expect(verifyTwilioSignature(url, params, twilioSignature(url, params, token), token)).toBe(true)
  })

  test('rejects a signature over different parameters', () => {
    const other = { ...params, Body: 'tampered' }
    expect(verifyTwilioSignature(url, params, twilioSignature(url, other, token), token)).toBe(false)
  })

  test('rejects a missing signature or token', () => {
    expect(verifyTwilioSignature(url, params, null, token)).toBe(false)
    expect(verifyTwilioSignature(url, params, twilioSignature(url, params, token), undefined)).toBe(false)
  })
})

describe('Vapi webhook authentication', () => {
  const secret = 'unit-test-vapi-secret'

  test('accepts the x-vapi-secret header', () => {
    expect(verifyVapiRequest(new Headers({ 'x-vapi-secret': secret }), secret)).toBe(true)
  })

  test('accepts a bearer token', () => {
    expect(verifyVapiRequest(new Headers({ authorization: 'Bearer ' + secret }), secret)).toBe(true)
  })

  test('rejects a wrong or absent secret', () => {
    expect(verifyVapiRequest(new Headers({ 'x-vapi-secret': 'nope' }), secret)).toBe(false)
    expect(verifyVapiRequest(new Headers(), secret)).toBe(false)
  })

  test('rejects everything when no secret is configured', () => {
    expect(verifyVapiRequest(new Headers({ 'x-vapi-secret': secret }), undefined)).toBe(false)
  })
})
