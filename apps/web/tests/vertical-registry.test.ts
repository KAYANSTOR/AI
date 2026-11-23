import { describe, expect, test } from 'bun:test'
import { TOOL_POLICIES } from '@/lib/ai/registry'
import { getVertical, VERTICAL_GROUPS, VERTICALS } from '@/lib/verticals/registry'

describe('config-driven vertical registry', () => {
  test('contains 23 unique sectors distributed across the four engines', () => {
    expect(VERTICALS).toHaveLength(23)
    expect(new Set(VERTICALS.map((vertical) => vertical.id)).size).toBe(23)
    expect(VERTICAL_GROUPS).toHaveLength(4)
    expect(VERTICAL_GROUPS.reduce((count, group) => count + group.verticals.length, 0)).toBe(23)
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
