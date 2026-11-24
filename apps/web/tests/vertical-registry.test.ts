import { describe, expect, test } from 'bun:test'
import { TOOL_POLICIES } from '@/lib/ai/registry'
import { getVertical, VERTICAL_GROUPS, VERTICALS } from '@/lib/verticals/registry'

describe('config-driven vertical registry', () => {
  test('contains 24 unique sectors distributed across the four engines', () => {
    expect(VERTICALS).toHaveLength(24)
    expect(new Set(VERTICALS.map((vertical) => vertical.id)).size).toBe(24)
    expect(VERTICAL_GROUPS).toHaveLength(4)
    expect(VERTICAL_GROUPS.reduce((count, group) => count + group.verticals.length, 0)).toBe(24)
    const distribution = Object.fromEntries(VERTICAL_GROUPS.map((group) => [group.id, group.verticals.length]))
    expect(distribution).toEqual({ booking_engine: 6, commerce_engine: 6, event_engine: 5, lead_engine: 7 })
    expect(getVertical('personal_assistant').baseEngine).toBe('lead_engine')
  })

  test('every vertical tool is declared in the authorization registry', () => {
    for (const vertical of VERTICALS) {
      expect(vertical.defaultSystemPrompt.length).toBeGreaterThan(20)
      expect(vertical.kbTemplates.length).toBeGreaterThan(0)
      for (const name of vertical.enabledTools) expect(TOOL_POLICIES[name]).toBeDefined()
    }
  })

  test('resolves legacy IDs and safely falls back for unknown values', () => {
    expect(getVertical('appointments').id).toBe('clinic')
    expect(getVertical('sales').id).toBe('ecommerce_store')
    expect(getVertical('unknown-sector').id).toBe('custom')
  })
})
