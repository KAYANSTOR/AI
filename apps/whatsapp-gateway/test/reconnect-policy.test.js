import assert from 'node:assert/strict'
import { describe, test } from 'node:test'
import { shouldReconnectAfterDisconnect } from '../src/reconnect-policy.js'

describe('WhatsApp reconnect policy', () => {
  test('does not reconnect after loggedOut/401', () => {
    assert.equal(shouldReconnectAfterDisconnect({ code: 401, retries: 0 }), false)
    assert.equal(shouldReconnectAfterDisconnect({ code: 401, retries: 4 }), false)
  })

  test('reconnects transient failures only within the bounded retry window', () => {
    assert.equal(shouldReconnectAfterDisconnect({ code: 408, retries: 0 }), true)
    assert.equal(shouldReconnectAfterDisconnect({ code: 500, retries: 4 }), true)
    assert.equal(shouldReconnectAfterDisconnect({ code: 500, retries: 5 }), false)
  })
})
