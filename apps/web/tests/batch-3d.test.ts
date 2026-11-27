import { describe, expect, test } from 'bun:test'
import { readFileSync } from 'node:fs'
import { execSync } from 'node:child_process'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const HERE = dirname(fileURLToPath(import.meta.url))
import type { DbClient } from '@/lib/db/client'
import { createFakeDb, type FakeDb } from './support/fake-db'
import { expectedYerAmount, parseYerRate, hasTransferableAccount } from '@/lib/billing/yer-pricing'
import { appendOptimistic, confirmOptimistic, failOptimistic, reconcileWithServer, type InboxMessage } from '@/lib/inbox/optimistic'
import { syncConversationContact } from '@/lib/contacts/conversation-contact'
import { resolveArabicDateTime, localNowContext } from '@/lib/calendar/relative-time'
import { ARAB_COUNTRIES, DEFAULT_COUNTRY, toE164 } from '@/lib/phone/arab-countries'
import { parseInlineBold } from '@/lib/text/inline-bold'
import { buildCustomerContextBlock } from '@/lib/ai/customer-context'
import { maxOutputTokensForChannel, outputTokenBudget, WHATSAPP_MAX_OUTPUT_TOKENS, enforceWhatsAppBrevity } from '@/lib/ai/channel-format'
import { PLAN_CATALOG } from '@/lib/billing/plan-catalog'
import { FEATURED_SECTOR_IDS, featuredSectors, searchSectors } from '@/lib/verticals/featured'
import { VERTICALS } from '@/lib/verticals/registry'

const ROOT = join(HERE, '..', '..', '..')
const ORG = '0a000000-0000-4000-8000-000000000001'

function setup(tables: FakeDb) {
  const fake = createFakeDb(tables)
  return { store: fake.store, db: fake.client as unknown as DbClient }
}

describe('3D · Yemeni wallets and YER amount', () => {
  test('a stored YER plan price wins over the exchange rate', () => {
    expect(expectedYerAmount({ usdMonthly: 10, cycle: 'monthly', yerPrice: { amount: 6000, rate: 600 }, platformRate: 535, envRate: null }))
      .toEqual({ amountYer: 6000, rate: 600 })
  })

  test('without a YER price the amount is USD × the owner-console rate (yearly = 10 months)', () => {
    expect(expectedYerAmount({ usdMonthly: 10, cycle: 'monthly', yerPrice: null, platformRate: 535, envRate: null }))
      .toEqual({ amountYer: 5350, rate: 535 })
    expect(expectedYerAmount({ usdMonthly: 10, cycle: 'yearly', yerPrice: null, platformRate: 535, envRate: null }))
      .toEqual({ amountYer: 53500, rate: 535 })
  })

  test('rate precedence: price row rate → owner-console setting → env; never 0', () => {
    expect(expectedYerAmount({ usdMonthly: 2, cycle: 'monthly', yerPrice: { amount: null, rate: 540 }, platformRate: 535, envRate: 530 })?.rate).toBe(540)
    expect(expectedYerAmount({ usdMonthly: 2, cycle: 'monthly', yerPrice: null, platformRate: null, envRate: 530 })?.amountYer).toBe(1060)
    expect(expectedYerAmount({ usdMonthly: 2, cycle: 'monthly', yerPrice: null, platformRate: 0, envRate: 0 })).toBeNull()
  })

  test('owner-console setting values are parsed safely', () => {
    expect(parseYerRate(535)).toBe(535)
    expect(parseYerRate('600')).toBe(600)
    expect(parseYerRate({ value: 610 })).toBe(610)
    expect(parseYerRate('abc')).toBeNull()
    expect(parseYerRate(-5)).toBeNull()
  })

  test('placeholder seed wallets are visible but not transferable until the owner sets a number', () => {
    expect(hasTransferableAccount('777123456')).toBe(true)
    expect(hasTransferableAccount('PENDING-jeeb')).toBe(false)
  })

  test('migration 0083 seeds the five wallets, a YER rate and an active-wallet SELECT policy without blanket revokes', () => {
    const sql = readFileSync(join(ROOT, 'packages/db/migrations/0083_fix_wallets_and_contact_appointment_flows.sql'), 'utf8')
    for (const code of ['jeeb', 'onecash', 'cacbank', 'jawali', 'kuraimi']) expect(sql.includes(`'${code}'`)).toBe(true)
    expect(sql.includes('FOR SELECT TO authenticated USING (is_active = true)')).toBe(true)
    expect(sql.includes('billing.yer_per_usd')).toBe(true)
    expect(sql.includes('ON ALL TABLES')).toBe(false)
    expect(/sqlite/i.test(sql)).toBe(false)
  })

  test('the manual transfer sheet no longer shows the English admin label', () => {
    const source = readFileSync(join(HERE, '..', 'src/app/dashboard/billing/payment-plans.tsx'), 'utf8')
    expect(source.includes('Kayan AI Admin')).toBe(false)
    expect(source.includes('سيتم مراجعة التحويل وتفعيل اشتراكك فور مطابقة المرجع والإيصال')).toBe(true)
    expect(source.includes('<select')).toBe(false)
  })
})

describe('3D · optimistic inbox', () => {
  const base: InboxMessage = { id: 'm1', direction: 'inbound', content: 'مرحبا', messageType: 'text', senderType: null, createdAt: '2026-11-24T10:00:00.000Z', media: null }

  test('a staff reply appears immediately as sending, then is replaced by the confirmed row', () => {
    const optimistic = appendOptimistic([base], { clientId: 'c1', content: 'أهلاً بك', createdAt: '2026-11-24T10:01:00.000Z' })
    expect(optimistic.length).toBe(2)
    expect(optimistic[1].deliveryStatus).toBe('sending')
    expect(optimistic[1].senderType).toBe('human_dashboard')
    const confirmed = confirmOptimistic(optimistic, 'c1', { id: 'srv-1', direction: 'outbound', content: 'أهلاً بك', messageType: 'text', senderType: 'human_dashboard', createdAt: '2026-11-24T10:01:01.000Z', media: null }, 'sent')
    expect(confirmed.length).toBe(2)
    expect(confirmed[1].id).toBe('srv-1')
    expect(confirmed[1].deliveryStatus).toBe('sent')
    expect(confirmed[1].clientId).toBe(undefined)
  })

  test('a queued reply stays visible (still sending) and a failure is marked', () => {
    const optimistic = appendOptimistic([], { clientId: 'c2', content: 'test', createdAt: '2026-11-24T10:01:00.000Z' })
    expect(confirmOptimistic(optimistic, 'c2', null, 'queued')[0].deliveryStatus).toBe('sending')
    expect(failOptimistic(optimistic, 'c2')[0].deliveryStatus).toBe('failed')
  })

  test('a server refresh does not duplicate the optimistic bubble', () => {
    const optimistic = appendOptimistic([base], { clientId: 'c3', content: 'رد', createdAt: '2026-11-24T10:01:00.000Z' })
    const server: InboxMessage[] = [base, { id: 'srv-3', direction: 'outbound', content: 'رد', messageType: 'text', senderType: 'human_dashboard', createdAt: '2026-11-24T10:01:02.000Z', media: null }]
    const merged = reconcileWithServer(optimistic, server)
    expect(merged.length).toBe(2)
    expect(merged[1].id).toBe('srv-3')
  })

  test('staff replies drain the outbox immediately and the old queue message is gone', () => {
    const source = readFileSync(join(HERE, '..', 'src/app/dashboard/conversations/actions.ts'), 'utf8')
    expect(source.includes('أُضيف الرد لطابور الإرسال وسيُرسل قريباً')).toBe(false)
    expect(source.includes('drainOutbox(')).toBe(true)
  })

  test('**bold** is rendered as bold segments, unmatched stars stay literal', () => {
    expect(parseInlineBold('السعر **5000 ريال** فقط')).toEqual([
      { text: 'السعر ', bold: false }, { text: '5000 ريال', bold: true }, { text: ' فقط', bold: false },
    ])
    expect(parseInlineBold('a ** b')).toEqual([{ text: 'a ** b', bold: false }])
  })
})

describe('3D · single contact record', () => {
  const CONV = 'c0000000-0000-4000-8000-000000000001'
  const CURRENT = 'd0000000-0000-4000-8000-000000000001'
  const EXISTING = 'd0000000-0000-4000-8000-000000000002'

  test('name and phone saved in chat update the conversation contact, not a new one', async () => {
    const { db, store } = setup({
      contacts: { rows: [{ id: CURRENT, organization_id: ORG, full_name: null, phone: null }] },
      conversations: { rows: [{ id: CONV, organization_id: ORG, contact_id: CURRENT }] },
      contact_identities: { rows: [] }, appointments: { rows: [] }, leads: { rows: [] },
    })
    const result = await syncConversationContact(db, { organizationId: ORG, conversationId: CONV, contactId: CURRENT, name: 'أحمد', phone: '0777123456' })
    expect(result.contactId).toBe(CURRENT)
    expect(result.merged).toBe(false)
    expect(store.contacts.rows!.length).toBe(1)
    expect(store.contacts.rows![0].full_name).toBe('أحمد')
    expect(store.contacts.rows![0].phone).toBe('+967777123456')
  })

  test('a phone that already belongs to another contact merges into it', async () => {
    const { db, store } = setup({
      contacts: { rows: [
        { id: CURRENT, organization_id: ORG, full_name: null, phone: null },
        { id: EXISTING, organization_id: ORG, full_name: null, phone: '+967777123456' },
      ] },
      conversations: { rows: [{ id: CONV, organization_id: ORG, contact_id: CURRENT }] },
      contact_identities: { rows: [{ id: 'i1', contact_id: CURRENT, channel: 'whatsapp', external_user_id: 'wa-1' }] },
      appointments: { rows: [] }, leads: { rows: [{ id: 'l1', organization_id: ORG, contact_id: CURRENT }] },
    })
    const result = await syncConversationContact(db, { organizationId: ORG, conversationId: CONV, contactId: CURRENT, name: 'سارة', phone: '+967 777 123 456' })
    expect(result.contactId).toBe(EXISTING)
    expect(result.merged).toBe(true)
    expect(store.conversations.rows![0].contact_id).toBe(EXISTING)
    expect(store.contact_identities.rows![0].contact_id).toBe(EXISTING)
    expect(store.leads.rows![0].contact_id).toBe(EXISTING)
    expect(store.contacts.rows!.find((row) => row.id === EXISTING)?.full_name).toBe('سارة')
  })

  test('a known WhatsApp number is never replaced; only the name is filled', async () => {
    const { db, store } = setup({
      contacts: { rows: [{ id: CURRENT, organization_id: ORG, full_name: null, phone: '+967777000111' }] },
      conversations: { rows: [{ id: CONV, organization_id: ORG, contact_id: CURRENT }] },
      contact_identities: { rows: [] }, appointments: { rows: [] }, leads: { rows: [] },
    })
    const result = await syncConversationContact(db, { organizationId: ORG, conversationId: CONV, contactId: CURRENT, name: 'علي' })
    expect(result.contactId).toBe(CURRENT)
    expect(result.phone).toBe('+967777000111')
    expect(store.contacts.rows![0].full_name).toBe('علي')
  })

  test('the agent is told the customer phone and not to ask for it', () => {
    const block = buildCustomerContextBlock({ contact: { id: CURRENT, name: 'علي', phone: '+967777000111' }, timezone: 'Asia/Aden', now: new Date('2026-11-24T09:00:00Z') })
    expect(block.includes(CURRENT)).toBe(true)
    expect(block.includes('+967777000111')).toBe(true)
    expect(block.includes('لا تطلب رقم')).toBe(true)
    expect(block.includes('Asia/Aden')).toBe(true)
    expect(block.includes('2026-11-24')).toBe(true)
  })
})

describe('3D · appointments with relative Arabic time', () => {
  // 2026-11-24 09:00 UTC = 12:00 in Aden (UTC+3)
  const now = new Date('2026-11-24T09:00:00Z')

  test('«غداً 3 عصراً» resolves to tomorrow 15:00 in the org timezone', () => {
    expect(resolveArabicDateTime('غداً الساعة 3 عصراً', { timezone: 'Asia/Aden', now })).toBe('2026-11-25T15:00:00+03:00')
  })

  test('«اليوم 8 مساءً», «بعد غد 10 صباحاً», and naive ISO are interpreted in the org timezone', () => {
    expect(resolveArabicDateTime('اليوم 8 مساءً', { timezone: 'Asia/Riyadh', now })).toBe('2026-11-24T20:00:00+03:00')
    expect(resolveArabicDateTime('بعد غد 10 صباحا', { timezone: 'Asia/Aden', now })).toBe('2026-11-26T10:00:00+03:00')
    expect(resolveArabicDateTime('2026-11-27T16:30', { timezone: 'Asia/Aden', now })).toBe('2026-11-27T16:30:00+03:00')
    expect(resolveArabicDateTime('2026-11-27T13:30:00Z', { timezone: 'Asia/Aden', now })).toBe('2026-11-27T13:30:00.000Z')
    expect(resolveArabicDateTime('غدا ٣:٣٠ العصر', { timezone: 'Asia/Aden', now })).toBe('2026-11-25T15:30:00+03:00')
  })

  test('a date without a time is not guessed', () => {
    expect(resolveArabicDateTime('غداً', { timezone: 'Asia/Aden', now })).toBeNull()
    expect(resolveArabicDateTime('', { timezone: 'Asia/Aden', now })).toBeNull()
  })

  test('the local date context gives today/tomorrow in the org timezone', () => {
    const ctx = localNowContext('Asia/Aden', new Date('2026-11-24T22:30:00Z'))
    expect(ctx.today).toBe('2026-11-25')
    expect(ctx.tomorrow).toBe('2026-11-26')
  })

  test('booking with «غداً 3 عصراً» creates the appointment on the conversation contact', async () => {
    const { executeTool } = await import('@/lib/ai/tools')
    const CONTACT = 'd0000000-0000-4000-8000-0000000000aa'
    const SERVICE = 'e0000000-0000-4000-8000-0000000000aa'
    const { db, store } = setup({
      organization_capabilities: { rows: [{ organization_id: ORG, capability_id: 'appointments', is_enabled: true }] },
      capabilities: { rows: [{ id: 'appointments' }] },
      business_profiles: { rows: [{ organization_id: ORG, timezone: 'Asia/Aden', business_type_id: 'clinic' }] },
      contacts: { rows: [{ id: CONTACT, organization_id: ORG, full_name: 'علي', phone: '+967777000111' }] },
      conversations: { rows: [{ id: 'c1', organization_id: ORG, contact_id: CONTACT }] },
      contact_identities: { rows: [] },
      services: { rows: [{ id: SERVICE, organization_id: ORG, name: 'كشف عام', duration_minutes: 30, is_active: true }] },
      appointments: { rows: [] }, leads: { rows: [] }, tool_executions: { rows: [] }, audit_events: { rows: [] },
      agent_tool_policies: { rows: [] },
    })
    const realNow = Date.now
    Date.now = () => now.getTime()
    try {
      const result = await executeTool('book_appointment', { service_name: 'كشف', starts_at: 'غداً الساعة 3 عصراً' }, { organizationId: ORG, businessId: 'b1', conversationId: 'c1', contactId: CONTACT, db, actor: 'agent' }, { confirmed: true })
      expect(result.ok).toBe(true)
    } finally { Date.now = realNow }
    expect(store.appointments.rows!.length).toBe(1)
    expect(store.appointments.rows![0].contact_id).toBe(CONTACT)
    expect(new Date(String(store.appointments.rows![0].starts_at)).toISOString()).toBe('2026-11-25T12:00:00.000Z')
    expect(store.contacts.rows!.length).toBe(1)
  })

  test('a missing time returns a clear Arabic error to the model', async () => {
    const { executeTool } = await import('@/lib/ai/tools')
    const { db } = setup({
      organization_capabilities: { rows: [{ organization_id: ORG, capability_id: 'appointments', is_enabled: true }] },
      business_profiles: { rows: [{ organization_id: ORG, timezone: 'Asia/Aden' }] },
      contacts: { rows: [{ id: 'x', organization_id: ORG, full_name: 'علي', phone: '+967777000111' }] },
      services: { rows: [] }, tool_executions: { rows: [] }, agent_tool_policies: { rows: [] },
    })
    const result = await executeTool('book_appointment', { starts_at: 'غداً' }, { organizationId: ORG, businessId: 'b1', conversationId: 'c1', contactId: 'x', db, actor: 'agent' }, { confirmed: true })
    expect(result.ok).toBe(false)
    expect(String((result as { error: string }).error).includes('missing_field')).toBe(true)
  })
})

describe('3D · WhatsApp output budget', () => {
  test('WhatsApp supports complete replies while enforcing the free plan 350 token cap', () => {
    expect(maxOutputTokensForChannel('whatsapp')).toBe(WHATSAPP_MAX_OUTPUT_TOKENS)
    const trial = PLAN_CATALOG.find((plan) => plan.code === 'trial')
    const freeLimit = Number(trial?.limits.max_output_tokens)
    expect(freeLimit).toBe(350)
    expect(outputTokenBudget('whatsapp', freeLimit)).toBe(350)
    expect(outputTokenBudget('whatsapp_qr', freeLimit)).toBe(350)
    expect(outputTokenBudget('whatsapp', 9000)).toBe(WHATSAPP_MAX_OUTPUT_TOKENS)
    expect(outputTokenBudget('whatsapp', null)).toBe(WHATSAPP_MAX_OUTPUT_TOKENS)
  })

  test('WhatsApp replies never keep **', () => {
    expect(enforceWhatsAppBrevity('موعدك **غداً** الساعة 3').includes('**')).toBe(false)
  })
})

describe('3D · Arab country codes', () => {
  test('all 22 Arab countries are listed with Yemen as the default', () => {
    expect(ARAB_COUNTRIES.length).toBe(22)
    expect(DEFAULT_COUNTRY.iso).toBe('YE')
    expect(DEFAULT_COUNTRY.dial).toBe('967')
    expect(new Set(ARAB_COUNTRIES.map((country) => country.dial)).size).toBe(22)
  })

  test('every country normalises a local number (leading zero stripped) to E.164', () => {
    const expected: Record<string, string> = {
      YE: '967', SA: '966', AE: '971', EG: '20', KW: '965', QA: '974', BH: '973', OM: '968', JO: '962', LB: '961', IQ: '964',
      SY: '963', PS: '970', SD: '249', LY: '218', TN: '216', DZ: '213', MA: '212', MR: '222', SO: '252', DJ: '253', KM: '269',
    }
    for (const country of ARAB_COUNTRIES) {
      expect(country.dial).toBe(expected[country.iso])
      expect(country.flag.length > 0 && country.nameAr.length > 1).toBe(true)
      expect(toE164(country.dial, '0 1234-5678')).toBe(`+${country.dial}12345678`)
      expect(toE164(country.dial, '12345678')).toBe(`+${country.dial}12345678`)
      expect(toE164(country.dial, `+${country.dial}12345678`)).toBe(`+${country.dial}12345678`)
      expect(toE164(country.dial, `00${country.dial}12345678`)).toBe(`+${country.dial}12345678`)
    }
  })

  test('invalid numbers are rejected', () => {
    expect(toE164('967', '12')).toBeNull()
    expect(toE164('967', 'abc')).toBeNull()
  })
})

describe('3D · KayanSelect and sector picker', () => {
  test('5 featured sectors first, then search across all 24', () => {
    expect(VERTICALS.length).toBe(24)
    expect(FEATURED_SECTOR_IDS).toEqual(['personal_assistant', 'clinic', 'ecommerce_store', 'restaurant_cafe', 'salon_barber'])
    expect(featuredSectors().length).toBe(5)
    expect(searchSectors('مطعم').some((sector) => sector.id === 'restaurant_cafe')).toBe(true)
    expect(searchSectors('').length).toBe(24)
  })

  test('no native <select> remains in apps/web', () => {
    const out = execSync(`grep -rln "<select" ${join(HERE, '..', 'src')} || true`).toString().trim()
    expect(out).toBe('')
  })
})

describe('3D · KayanSelect behaviour', () => {
  test('native <option>/<optgroup> children become sheet options (values, labels, groups, disabled)', async () => {
    const React = await import('react')
    const { optionsFromChildren, filterOptions } = await import('@/components/ui/kayan-select')
    const h = React.createElement
    const options = optionsFromChildren([
      h('option', { key: 'a', value: '' }, 'اختر'),
      h('optgroup', { key: 'g', label: 'المواعيد' }, h('option', { value: 'clinic' }, 'عيادة'), h('option', { value: 'salon', disabled: true }, 'صالون')),
      h(React.Fragment, { key: 'f' }, h('option', { value: 7 }, 'سبعة ', 'أيام')),
    ])
    expect(options).toEqual([
      { value: '', label: 'اختر', group: undefined, disabled: false },
      { value: 'clinic', label: 'عيادة', group: 'المواعيد', disabled: false },
      { value: 'salon', label: 'صالون', group: 'المواعيد', disabled: true },
      { value: '7', label: 'سبعة أيام', group: undefined, disabled: false },
    ])
    expect(filterOptions(options, 'عياده').map((option) => option.value)).toEqual(['clinic'])
    expect(filterOptions(options, '').length).toBe(4)
  })

  test('every former native select call site now uses KayanSelect with brand z-50 sheet + Back dismiss', () => {
    const sheet = readFileSync(join(HERE, '..', 'src/components/ui/bottom-sheet.tsx'), 'utf8')
    expect(sheet.includes('z-50')).toBe(true)
    expect(sheet.includes('useHistoryDismiss')).toBe(true)
    expect(sheet.includes('sticky bottom-0') && sheet.includes('pb-safe')).toBe(true)
    for (const banned of ['#D9C7A3', '#B08D57', '#1F2A1F']) {
        const hits = execSync(`grep -rli "${banned}" ${join(HERE, '..', 'src')} || true`).toString().trim()
      expect(hits).toBe('')
    }
  })
})

describe('3D · inbox delivery ticks', () => {
  test('sending → ✓ (sent) → ✓✓ once the customer writes after it', async () => {
    const { outboundTickFor, appendOptimistic } = await import('@/lib/inbox/optimistic')
    const base: InboxMessage[] = [
      { id: '1', direction: 'outbound', content: 'مرحبا', messageType: 'text', senderType: 'human_dashboard', createdAt: '2026-01-01T10:00:00Z', media: null },
    ]
    expect(outboundTickFor(base, 0)).toBe('sent')
    const answered: InboxMessage[] = [...base, { ...base[0], id: '2', direction: 'inbound', senderType: null }]
    expect(outboundTickFor(answered, 0)).toBe('delivered')
    expect(outboundTickFor(answered, 1)).toBeNull()
    const pending = appendOptimistic(base, { clientId: 'c1', content: 'تجربة', createdAt: '2026-01-01T10:01:00Z' })
    expect(outboundTickFor(pending, 1)).toBe('sending')
  })

  test('header inbox icon uses the brand pair, not white/beige', () => {
    const css = readFileSync(join(HERE, '..', 'src/app/globals.css'), 'utf8')
    expect(css.includes('.kayan-header-page-icon{background:var(--brand-secondary);color:var(--brand-primary)}')).toBe(true)
  })
})
