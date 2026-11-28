import { describe, expect, test } from 'bun:test'
import { restoreSessionDecision, sessionIsConnected } from '../../whatsapp-gateway/src/restore-policy.js'
import { evaluateQrChannelReadiness } from '@/lib/channels/qr-readiness'

const CHANNEL = { id: '0c000000-0000-4000-8000-000000000050', organization_id: '0c000000-0000-4000-8000-000000000051', business_id: '0c000000-0000-4000-8000-000000000052', channel_type: 'whatsapp', connection_mode: 'qr_unofficial' }

describe('OPS-001 QR inbound readiness gate', () => {
  test('verified and active is the only accepted state', () => {
    expect(evaluateQrChannelReadiness({ ...CHANNEL, verification_status: 'verified', is_active: true })).toEqual({ ready: true })
  })

  test('a pairing channel or a deactivated channel is not ready', () => {
    expect(evaluateQrChannelReadiness({ ...CHANNEL, verification_status: 'pending', is_active: true }))
      .toEqual({ ready: false, reason: 'channel_not_ready' })
    expect(evaluateQrChannelReadiness({ ...CHANNEL, verification_status: 'verified', is_active: false }))
      .toEqual({ ready: false, reason: 'channel_not_ready' })
    expect(evaluateQrChannelReadiness({ ...CHANNEL, verification_status: 'failed', is_active: false }))
      .toEqual({ ready: false, reason: 'channel_not_ready' })
  })

  test('an unbound or wrong-mode row is rejected as not bound', () => {
    expect(evaluateQrChannelReadiness(null)).toEqual({ ready: false, reason: 'channel_not_bound' })
    expect(evaluateQrChannelReadiness({ ...CHANNEL, business_id: null, verification_status: 'verified', is_active: true }))
      .toEqual({ ready: false, reason: 'channel_not_bound' })
    expect(evaluateQrChannelReadiness({ ...CHANNEL, connection_mode: 'cloud_api', verification_status: 'verified', is_active: true }))
      .toEqual({ ready: false, reason: 'channel_not_bound' })
  })
})

/**
 * OPS-001 / OPS-002 — the gateway must agree with the database about whether a QR
 * channel is actually usable, and an unregistered stored session must never keep
 * reporting `connected`.
 */
describe('OPS-002 session restore reconciliation', () => {
  const registered = { hasCredentials: true, credentialsValid: true, registered: true, hasLiveSocket: false, status: 'connected' }

  test('registered credentials restore the session', () => {
    expect(restoreSessionDecision(registered)).toEqual({ action: 'restore', reason: 'registered_credentials' })
  })

  test('an unregistered blob is reconciled instead of restored', () => {
    expect(restoreSessionDecision({ ...registered, registered: false }))
      .toEqual({ action: 'reconcile_unregistered', reason: 'unregistered_credentials' })
  })

  test('missing or undecryptable credentials are reconciled', () => {
    expect(restoreSessionDecision({ ...registered, hasCredentials: false, credentialsValid: false, registered: false }))
      .toEqual({ action: 'reconcile_unregistered', reason: 'missing_credentials' })
    expect(restoreSessionDecision({ ...registered, credentialsValid: false, registered: false }))
      .toEqual({ action: 'reconcile_unregistered', reason: 'invalid_credentials' })
  })

  test('a live socket is never overwritten by startup reconciliation', () => {
    expect(restoreSessionDecision({ ...registered, hasLiveSocket: true }))
      .toEqual({ action: 'skip_live', reason: 'socket_already_active' })
    expect(restoreSessionDecision({ ...registered, registered: false, hasLiveSocket: true }))
      .toEqual({ action: 'skip_live', reason: 'socket_already_active' })
  })

  test('connected is reported only with a live socket', () => {
    expect(sessionIsConnected('connected', true)).toBe(true)
    expect(sessionIsConnected('connected', false)).toBe(false)
    expect(sessionIsConnected('reconnecting', true)).toBe(false)
    expect(sessionIsConnected('failed', false)).toBe(false)
  })
})
