import { describe, expect, test } from 'bun:test'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import type { DbClient } from '@/lib/db/client'
import { aiGuardPolicyFor, quotaFingerprint } from '@/lib/billing/free-tier'
import { parseYerRate } from '@/lib/billing/yer-pricing'
import { loadPersonalAssistantAccess } from '@/lib/personal-assistant/access'
import {
  freeQuotaFingerprint,
  readYerRate,
  validatePlatformSettingValue,
  walletSortOrder,
  YER_RATE_SETTING_KEY,
} from '../../owner-console/src/server/services/billingContracts'
import { createFakeDb } from './support/fake-db'

const HERE = dirname(fileURLToPath(import.meta.url))
const OWNER = join(HERE, '..', '..', 'owner-console', 'src')
const ORG = 'a0000000-0000-4000-8000-00000000000a'

function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = join(dir, name)
    return statSync(full).isDirectory() ? walk(full) : /\.tsx?$/.test(name) ? [full] : []
  })
}

describe('owner console ↔ web: free-tier exemptions', () => {
  const samples = ['+967 777-123-456', '967777123456', '(967) 777 123 456', 'telegram:12345', 'Web-Visitor-ABC', '  +1 (415) 555-0100 ']

  test('owner-console fingerprints are byte-identical to the web quota fingerprint', () => {
    for (const value of samples) {
      expect(freeQuotaFingerprint(value)).toBe(quotaFingerprint(value))
      expect(freeQuotaFingerprint(value)).toMatch(/^[0-9a-f]{64}$/)
    }
  })

  test('phone formatting variants collapse to one exemption', () => {
    expect(freeQuotaFingerprint('+967 777-123-456')).toBe(freeQuotaFingerprint('967777123456'))
  })

  test('empty or oversized identifiers are rejected', () => {
    expect(freeQuotaFingerprint('   ')).toBeNull()
    expect(freeQuotaFingerprint('x'.repeat(201))).toBeNull()
  })
})

describe('owner console ↔ web: free plan limits', () => {
  test('limits edited in the owner console drive the web AI guard', () => {
    // BillingPlansPages saves aiMessagesDaily → ai_messages_daily and mediaMonthly → media_monthly.
    const policy = aiGuardPolicyFor('free', { ai_messages: 40, ai_messages_daily: 10, media_monthly: 5 })
    expect(policy).toMatchObject({ free: true, monthlyLimit: 40, dailyLimit: 10, mediaMonthly: 5 })
    const tightened = aiGuardPolicyFor('free', { ai_messages: 20, ai_messages_daily: 3, media_monthly: 1 })
    expect(tightened).toMatchObject({ monthlyLimit: 20, dailyLimit: 3, mediaMonthly: 1 })
  })

  test('the free plan keeps 40/month, 10/day and 5 media when the owner left fields empty', () => {
    expect(aiGuardPolicyFor('free', {})).toMatchObject({ monthlyLimit: 40, dailyLimit: 10, mediaMonthly: 5 })
  })

  test('the owner-console plan service reads and writes the same limit keys', () => {
    const service = readFileSync(join(OWNER, 'server', 'services', 'platformDataService.ts'), 'utf8')
    for (const key of ['ai_messages_daily', 'media_monthly', 'ai_messages']) expect(service).toContain(`'${key}'`)
  })
})

describe('owner console ↔ web: wallets and YER rate', () => {
  test('the exact payload the owner UI sends is accepted and parsed by the web billing page', () => {
    const uiPayload = { value: 600, category: 'billing', description: 'سعر صرف الدولار بالريال اليمني لحساب مبلغ التحويل اليدوي' }
    const stored = validatePlatformSettingValue(YER_RATE_SETTING_KEY, uiPayload)
    expect(parseYerRate(stored)).toBe(600)
    expect(stored).toMatchObject({ value: 600, category: 'billing' })
  })

  test('a bare number or numeric string is normalized into the canonical object', () => {
    expect(parseYerRate(validatePlatformSettingValue(YER_RATE_SETTING_KEY, 535))).toBe(535)
    expect(parseYerRate(validatePlatformSettingValue(YER_RATE_SETTING_KEY, '540.5'))).toBe(540.5)
  })

  test('invalid rates are refused before they can break the web billing page', () => {
    for (const bad of [0, -5, 'abc', null, 1_000_000, { value: 'x' }]) {
      expect(() => validatePlatformSettingValue(YER_RATE_SETTING_KEY, bad)).toThrow()
    }
  })

  test('owner and web rate parsers agree', () => {
    for (const v of [600, '600', { value: 610 }, 0, 'abc', null, [600]]) expect(readYerRate(v)).toBe(parseYerRate(v))
  })

  test('other settings pass through unchanged', () => {
    const value = { enabled: true }
    expect(validatePlatformSettingValue('feature.something', value)).toBe(value)
  })

  test('wallet display order keeps the current value when omitted and rejects garbage', () => {
    expect(walletSortOrder(undefined)).toBeNull()
    expect(walletSortOrder('')).toBeNull()
    expect(walletSortOrder('5')).toBe(5)
    expect(() => walletSortOrder(-1)).toThrow()
    expect(() => walletSortOrder('1.5')).toThrow()
  })

  test('the web billing page lists active wallets in the owner-defined order without caching', () => {
    const page = readFileSync(join(HERE, '..', 'src', 'app', 'dashboard', 'billing', 'page.tsx'), 'utf8')
    expect(page).toContain("export const dynamic = 'force-dynamic'")
    expect(page).toMatch(/manual_yemen_wallets[\s\S]{0,200}\.eq\('is_active', true\)\.order\('sort_order'\)/)
  })
})

describe('owner console ↔ web: personal assistant add-on', () => {
  function db(addon: boolean, businessType = 'sales') {
    return createFakeDb({
      organizations: { rows: [{ id: ORG, business_type: businessType, personal_assistant_addon_enabled: addon }] },
      business_profiles: { rows: [{ organization_id: ORG, business_type_id: businessType }] },
    })
  }

  test('enabling the add-on in the owner console opens the assistant and central bot immediately', async () => {
    const fake = db(false)
    const client = fake.client as unknown as DbClient
    expect(await loadPersonalAssistantAccess(client, ORG)).toBe(false)
    // Same column the owner console updates (updatePlatformWorkspaceAddon); no cache in between.
    fake.store.organizations.rows![0].personal_assistant_addon_enabled = true
    expect(await loadPersonalAssistantAccess(client, ORG)).toBe(true)
    fake.store.organizations.rows![0].personal_assistant_addon_enabled = false
    expect(await loadPersonalAssistantAccess(client, ORG)).toBe(false)
  })

  test('the personal-assistant sector stays enabled regardless of the add-on', async () => {
    expect(await loadPersonalAssistantAccess(db(false, 'personal_assistant').client as unknown as DbClient, ORG)).toBe(true)
  })

  test('access fails closed when the lookup errors', async () => {
    const broken = { from() { throw new Error('db down') } } as unknown as DbClient
    expect(await loadPersonalAssistantAccess(broken, ORG)).toBe(false)
  })

  test('the owner console writes the column the web reads', () => {
    const service = readFileSync(join(OWNER, 'server', 'services', 'platformDataService.ts'), 'utf8')
    expect(service).toMatch(/UPDATE organizations SET personal_assistant_addon_enabled=\$2/)
  })
})

describe('owner console: monitoring and route parity', () => {
  test('monitoring reads live agent and trainer stats', () => {
    const service = readFileSync(join(OWNER, 'server', 'services', 'platformDataService.ts'), 'utf8')
    const fn = service.slice(service.indexOf('export async function platformPersonalAgentStats'))
    for (const table of ['agent_tasks', 'agent_approvals', 'whatsapp_training_submissions']) expect(fn).toContain(`FROM ${table}`)
    expect(service).toMatch(/migrations,agentStats\}/)
  })

  test('JSONB parameters are cast through text so postgres.js cannot double-encode them', () => {
    // `$n::jsonb` / `${JSON.stringify(x)}::jsonb` made postgres.js store a JSON *string*,
    // which silently broke plan limits, the YER rate and owner MFA (repaired by 0085).
    const offenders: string[] = []
    for (const file of walk(join(OWNER, 'server'))) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/(\$\d+|\$\{[^}]*\}|\})::jsonb/g)) offenders.push(`${file.split('/src/')[1]}: ${m[0]}`)
    }
    expect(offenders).toEqual([])
  })

  test('every client fetch targets a route declared in ownerRoutes.ts', () => {
    const routesSrc = readFileSync(join(OWNER, 'server', 'routes', 'ownerRoutes.ts'), 'utf8')
    const routes = [...routesSrc.matchAll(/\.(get|post|patch|put|delete)\(\s*'([^']+)'/g)].map((m) => ({
      method: m[1].toUpperCase(),
      rx: new RegExp('^' + m[2].replace(/:[A-Za-z]+/g, '[^/]+') + '$'),
    }))
    const mismatches: string[] = []
    let checked = 0
    for (const file of walk(OWNER).filter((f) => !f.includes(`${'/'}server${'/'}`))) {
      const src = readFileSync(file, 'utf8')
      for (const m of src.matchAll(/[`'"]\/api\/owner(\/[^`'"]*)/g)) {
        // Drop query strings (literal or interpolated) and normalise interpolated segments.
        const path = m[1].replace(/\$\{[^}]*\?[\s\S]*$/, '').split('?')[0].replace(/\$\{[^}]*\}/g, 'X')
        const after = src.slice(m.index! + m[0].length, m.index! + m[0].length + 300).split(/apiFetch(?:<[^>]*>)?\(\s*[`'"]|downloadOwnerCsv/)[0]
        const methodExpr = after.match(/method:\s*([^,}\n]+)/)?.[1] ?? ''
        const methods = [...methodExpr.matchAll(/'([A-Z]+)'/g)].map((x) => x[1])
        const candidates = methods.length ? methods : ['GET']
        checked += 1
        // A conditional `method: a ? 'PUT' : 'POST'` pairs with a conditional endpoint, so one match suffices.
        if (!candidates.some((method) => routes.some((r) => r.method === method && r.rx.test(path)))) {
          mismatches.push(`${candidates.join('|')} ${path} (${file.split('/src/')[1]})`)
        }
      }
    }
    expect(checked).toBeGreaterThan(50)
    expect(mismatches).toEqual([])
  })
})
