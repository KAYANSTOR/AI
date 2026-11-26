import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { hasBusinessNavigationCapability } from '@/lib/dashboard/navigation-policy'

const modules = [
  [
    "orders/actions.ts",
    "orders"
  ],
  [
    "orders/[orderId]/page.tsx",
    "orders"
  ],
  [
    "orders/new/page.tsx",
    "orders"
  ],
  [
    "orders/page.tsx",
    "orders"
  ],
  [
    "quotes/actions.ts",
    "quotes"
  ],
  [
    "quotes/[quoteId]/page.tsx",
    "quotes"
  ],
  [
    "quotes/new/page.tsx",
    "quotes"
  ],
  [
    "quotes/page.tsx",
    "quotes"
  ],
  [
    "conversations/[conversationId]/page.tsx",
    "inbox"
  ],
  [
    "conversations/actions.ts",
    "inbox"
  ],
  [
    "conversations/page.tsx",
    "inbox"
  ],
  [
    "conversations/schedule-actions.ts",
    "inbox"
  ],
  [
    "conversations/views-actions.ts",
    "inbox"
  ]
] as const
const capabilities = ['orders', 'quotes', 'inbox', 'appointments']
const source = (path: string) => readFileSync(new URL('../src/app/dashboard/' + path, import.meta.url), 'utf8')

describe('commercial dashboard boundaries', () => {
  test('personal workspace cannot use inherited commercial grants', () => {
    for (const capability of capabilities) {
      expect(hasBusinessNavigationCapability({ businessTypeId: 'personal_assistant', enabledCapabilities: capabilities }, capability)).toBe(false)
    }
  })

  test('commercial workspace requires an explicitly enabled capability', () => {
    for (const capability of capabilities) {
      expect(hasBusinessNavigationCapability({ businessTypeId: 'ecommerce_store', enabledCapabilities: [capability] }, capability)).toBe(true)
      expect(hasBusinessNavigationCapability({ businessTypeId: 'ecommerce_store', enabledCapabilities: [] }, capability)).toBe(false)
    }
  })

  for (const [path, capability] of modules) {
    test(path + ' uses the sector-aware server guard', () => {
      const code = source(path)
      expect(code).toContain("await requireBusinessDashboardCapability('" + capability + "')")
      expect(code).not.toMatch(/\brequireCapability\(/)
      const exportedEntries = code.match(/export (?:default )?async function /g) ?? []
      const guardedEntries = code.match(new RegExp("await requireBusinessDashboardCapability\\('" + capability + "'\\)", 'g')) ?? []
      expect(guardedEntries.length).toBe(exportedEntries.length)
    })
  }
})
