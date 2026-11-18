import { describe, expect, test } from 'bun:test'
import {
  isWhatsAppHistoryOutbound,
  parseWhatsAppHistoryTimestamp,
} from '@/lib/channels/whatsapp-coexistence-history'

describe('WhatsApp Coexistence history mapping', () => {
  test('accepts Meta Unix timestamps in seconds and milliseconds', () => {
    expect(parseWhatsAppHistoryTimestamp('1792800000')).toBe('2026-10-23T00:00:00.000Z')
    expect(parseWhatsAppHistoryTimestamp(1792800000000)).toBe('2026-10-23T00:00:00.000Z')
    expect(parseWhatsAppHistoryTimestamp('invalid')).toBeNull()
  })

  test('recognizes app echoes by the Coexistence recipient field', () => {
    expect(isWhatsAppHistoryOutbound({ from: '15550001111', to: '967777000000' }, '+15550001111')).toBe(true)
  })

  test('recognizes business-originated messages by the connected business number', () => {
    expect(isWhatsAppHistoryOutbound({ from: '15550001111' }, '+1 555 000 1111')).toBe(true)
  })

  test('does not treat customer messages as app echoes', () => {
    expect(isWhatsAppHistoryOutbound({ from: '967777000000' }, '+15550001111')).toBe(false)
  })
})
