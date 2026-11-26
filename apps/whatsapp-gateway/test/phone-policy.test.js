import assert from 'node:assert/strict'
import test from 'node:test'
import { ignoredPhoneNumbers, isIgnoredPhone } from '../src/phone-policy.js'

test('the gateway can import the ignored-phone policy and compare normalized numbers', () => {
  const ignored = ignoredPhoneNumbers(['+1 (202) 555-0100', '12025550100', ''])

  assert.equal(ignored.size, 1)
  assert.equal(isIgnoredPhone(ignored, '12025550100'), true)
  assert.equal(isIgnoredPhone(ignored, '12025550101'), false)
  assert.equal(isIgnoredPhone(ignored, null), false)
})
