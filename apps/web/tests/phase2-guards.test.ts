import { readFileSync } from 'node:fs'
import { afterEach, beforeEach, describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import { createFakeDb } from './support/fake-db'
import { handleCopilotRequest } from '@/lib/ai/copilot-handler'
import {
  AI_GUARD_MESSAGES,
  checkAiGuard,
  setAiGuardDepsFactory,
  type AiGuardDeps,
  type RateLimitVerdict,
} from '@/lib/ai/usage-guard'
import { EntitlementExceededError } from '@/lib/billing/entitlements'
import { SECURITY_HEADERS, securityHeaders } from '../security-headers'
import nextConfig from '../next.config'
import {
  applyChannelFormatRules,
  enforceWhatsAppBrevity,
  maxOutputTokensForChannel,
  WHATSAPP_BREVITY_MARKER,
  WHATSAPP_MAX_OUTPUT_TOKENS,
} from '@/lib/ai/channel-format'
import { detectHumanHandoffRequest, triggerHumanHandoff } from '@/lib/ai/handoff-alert'
import { processInboundMessage } from '@/lib/runtime/process-inbound'
import { buildPublicPricing, resolvePlanPrice, formatPlanPrice } from '@/lib/billing/public-pricing'

const ORG = 'aaaaaaaa-0000-4000-8000-000000000001'
const BIZ = 'aaaaaaaa-0000-4000-8000-0000000000b1'
const USER = 'bbbbbbbb-0000-4000-8000-000000000001'
const CONTACT = 'cccccccc-0000-4000-8000-000000000001'
const CHANNEL = 'dddddddd-0000-4000-8000-000000000001'
const WA_CHANNEL = 'dddddddd-0000-4000-8000-0000000000aa'

// ---------------------------------------------------------------------------
// F3 — DB-backed AI guard on /api/copilot
// ---------------------------------------------------------------------------

function guardDeps(overrides: Partial<AiGuardDeps> = {}): AiGuardDeps & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    assertQuota: async () => { calls.push('quota') },
    consumeRateLimit: async (scope): Promise<RateLimitVerdict> => {
      calls.push('rate:' + scope)
      return { allowed: true, hits: 1, resetAt: new Date(Date.now() + 60_000) }
    },
    recordUsage: async () => { calls.push('record') },
    now: () => new Date(),
    ...overrides,
  }
}

function copilotDb() {
  const fake = createFakeDb({
    organization_members: { rows: [{ user_id: USER, organization_id: ORG, created_at: '2026-01-01T00:00:00Z' }] },
  })
  return Object.assign(fake.client, { auth: { getUser: async () => ({ data: { user: { id: USER } } }) } })
}

function copilotRequest() {
  return new Request('http://localhost/api/copilot', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ messages: [{ id: 'm1', role: 'user', parts: [{ type: 'text', text: 'كم عدد المحادثات؟' }] }] }),
  })
}

describe('AI usage guard (F3) on /api/copilot', () => {
  const originalKey = process.env.GEMINI_API_KEY
  let modelCalls = 0
  const createGoogle = (() => { modelCalls += 1; throw new Error('model must not be called') }) as never

  beforeEach(() => {
    process.env.GEMINI_API_KEY = 'test-key'
    modelCalls = 0
  })
  afterEach(() => {
    setAiGuardDepsFactory(null)
    if (originalKey === undefined) delete process.env.GEMINI_API_KEY
    else process.env.GEMINI_API_KEY = originalKey
  })

  test('returns 429 with an Arabic message when the plan AI quota is exhausted, without calling the model', async () => {
    setAiGuardDepsFactory(() => guardDeps({ assertQuota: async () => { throw new EntitlementExceededError('ai_messages', 100, 100) } }))
    const response = await handleCopilotRequest(copilotRequest(), {
      isAuthConfigured: () => true,
      createClient: async () => copilotDb() as never,
      createGoogle,
    })
    expect(response.status).toBe(429)
    const body = (await response.json()) as { error: string; message: string }
    expect(body.error).toBe('ai_quota_exceeded')
    expect(body.message).toBe(AI_GUARD_MESSAGES.quota)
    expect(modelCalls).toBe(0)
  })

  test('returns 429 with Retry-After when the per-user hourly rate limit is exceeded', async () => {
    const deps = guardDeps({
      consumeRateLimit: async (scope) => ({ allowed: scope !== 'user', hits: 60, resetAt: new Date(Date.now() + 120_000) }),
    })
    setAiGuardDepsFactory(() => deps)
    const response = await handleCopilotRequest(copilotRequest(), {
      isAuthConfigured: () => true,
      createClient: async () => copilotDb() as never,
      createGoogle,
    })
    expect(response.status).toBe(429)
    expect(Number(response.headers.get('Retry-After'))).toBeGreaterThan(0)
    const body = (await response.json()) as { error: string; message: string }
    expect(body.error).toBe('ai_rate_limited')
    expect(body.message).toBe(AI_GUARD_MESSAGES.userRate)
    expect(modelCalls).toBe(0)
  })

  test('the organization-wide hourly limit is enforced too', async () => {
    const result = await checkAiGuard(
      { organizationId: ORG, userId: USER, route: 'copilot' },
      guardDeps({ consumeRateLimit: async (scope) => ({ allowed: scope !== 'organization', hits: 300, resetAt: new Date(Date.now() + 1000) }) })
    )
    expect(result).toEqual({ ok: false, status: 429, code: 'ai_rate_limited', message: AI_GUARD_MESSAGES.orgRate, retryAfterSeconds: 1 })
  })

  test('fails closed (503) when the guard cannot read the database', async () => {
    const result = await checkAiGuard(
      { organizationId: ORG, userId: USER, route: 'agent_test' },
      guardDeps({ consumeRateLimit: async () => { throw new Error('db down') } })
    )
    expect(result).toEqual({ ok: false, status: 503, code: 'ai_guard_unavailable', message: AI_GUARD_MESSAGES.unavailable })
  })

  test('an allowed call checks quota then user and organization buckets', async () => {
    const deps = guardDeps()
    const result = await checkAiGuard({ organizationId: ORG, userId: USER, route: 'agent_train' }, deps)
    expect(result.ok).toBe(true)
    expect(deps.calls).toEqual(['quota', 'rate:user', 'rate:organization'])
  })

  test('copilot, agent test and agent train routes all call the guard before the model', async () => {
    const read = (path: string) => readFileSync(new URL(path, import.meta.url), 'utf8')
    const copilot = read('../src/lib/ai/copilot-handler.ts')
    const agentTest = read('../src/app/api/agent/test/route.ts')
    const agentTrain = read('../src/app/api/agent/train/route.ts')
    expect(copilot.indexOf('enforceAiGuard(')).toBeLessThan(copilot.indexOf('streamText('))
    expect(agentTest.indexOf('enforceAiGuard(')).toBeLessThan(agentTest.indexOf('runAgentPreviewTurn({'))
    expect(agentTrain.indexOf('enforceAiGuard(')).toBeGreaterThan(0)
    expect(agentTrain.indexOf('enforceAiGuard(')).toBeLessThan(agentTrain.indexOf('generativelanguage.googleapis.com'))
  })

  test('rate-limit counters live in PostgreSQL, not process memory', async () => {
    const sql = readFileSync(new URL('../../../packages/db/migrations/0078_ai_guard_rate_limits_and_handoff_alerts.sql', import.meta.url), 'utf8')
    expect(sql).toContain('CREATE TABLE IF NOT EXISTS public.ai_rate_limit_buckets')
    expect(sql).toContain('FUNCTION public.consume_ai_rate_limit')
    expect(sql).toContain('ON CONFLICT (scope, subject_id, window_start)')
  })
})

// ---------------------------------------------------------------------------
// F4 — security headers in next.config.ts
// ---------------------------------------------------------------------------

describe('security headers (F4)', () => {
  test('next.config exposes headers() applying the security set to every route', async () => {
    expect(typeof nextConfig.headers).toBe('function')
    const rules = await nextConfig.headers!()
    expect(rules).toEqual(await securityHeaders())
    expect(rules[0].source).toBe('/:path*')
    const keys = rules[0].headers.map((header) => header.key)
    for (const key of ['Strict-Transport-Security', 'X-Frame-Options', 'X-Content-Type-Options', 'Referrer-Policy', 'Permissions-Policy', 'Content-Security-Policy-Report-Only']) {
      expect(keys).toContain(key)
    }
  })

  test('header values match the hardening policy without breaking Meta Embedded Signup', () => {
    const value = (key: string) => SECURITY_HEADERS.find((header) => header.key === key)?.value ?? ''
    expect(/max-age=\d{8}/.test(value('Strict-Transport-Security'))).toBe(true)
    expect(value('X-Frame-Options')).toBe('SAMEORIGIN')
    expect(value('X-Content-Type-Options')).toBe('nosniff')
    expect(value('Referrer-Policy')).toBe('strict-origin-when-cross-origin')
    expect(value('Permissions-Policy')).toContain('geolocation=()')
    const csp = value('Content-Security-Policy-Report-Only')
    expect(csp).toContain('https://connect.facebook.net')
    expect(csp).toContain('https://*.facebook.com')
    expect(csp).toContain("frame-ancestors 'self'")
    // Report-only: it must not be the enforcing header yet.
    expect(SECURITY_HEADERS.some((header) => header.key === 'Content-Security-Policy')).toBe(false)
  })
})

// ---------------------------------------------------------------------------
// WhatsApp Brevity Guard
// ---------------------------------------------------------------------------

describe('WhatsApp brevity guard', () => {
  test('the rule is appended at the end of any stored prompt for whatsapp and whatsapp_qr only', () => {
    const legacy = 'أنت موظف استقبال. اكتب مقالات مفصلة وشاملة.'
    for (const channel of ['whatsapp', 'whatsapp_qr']) {
      const prompt = applyChannelFormatRules(legacy, channel)
      expect(prompt.startsWith(legacy)).toBe(true)
      expect(prompt.trimEnd().endsWith('اسأل سؤالاً واحداً قصيراً فقط.')).toBe(true)
      expect(prompt).toContain('سطر إلى 3 أسطر')
      expect(applyChannelFormatRules(prompt, channel)).toBe(prompt)
      expect(prompt.split(WHATSAPP_BREVITY_MARKER).length).toBe(2)
    }
    expect(applyChannelFormatRules(legacy, 'preview')).toBe(legacy)
  })

  test('maxOutputTokens is capped for WhatsApp channels', () => {
    expect(maxOutputTokensForChannel('whatsapp')).toBe(WHATSAPP_MAX_OUTPUT_TOKENS)
    expect(maxOutputTokensForChannel('whatsapp_qr')).toBe(WHATSAPP_MAX_OUTPUT_TOKENS)
    expect(WHATSAPP_MAX_OUTPUT_TOKENS).toBeLessThan(301)
    expect(maxOutputTokensForChannel('preview')).toBe(1024)
  })

  test('the runtime injects the rule and the cap into every provider call', async () => {
    const runtime = readFileSync(new URL('../src/lib/runtime/agent-runtime.ts', import.meta.url), 'utf8')
    expect(runtime).toContain('system: applyChannelFormatRules(args.systemPrompt, args.channel)')
    // Channel cap always applies; the free-plan cap (3C) can only lower it.
    expect(runtime).toContain('Math.min(args.maxOutputTokens, maxOutputTokensForChannel(args.channel))')
    expect(runtime).toContain(': maxOutputTokensForChannel(args.channel)')
  })

  test('an article-style reply is trimmed to a few short lines unless details were requested', () => {
    const essay = ['## مرحباً بك', '**أهلاً وسهلاً** بك في متجرنا الرائع.', 'نقدم مجموعة واسعة من الخدمات.', 'لدينا فريق محترف.', 'نسعد بخدمتك دائماً.', 'تواصل معنا في أي وقت.'].join('\n')
    const brief = enforceWhatsAppBrevity(essay, 'كم سعر التوصيل؟')
    expect(brief.split('\n').length).toBeLessThan(4)
    expect(brief).not.toContain('**')
    expect(brief).not.toContain('##')
    const list = enforceWhatsAppBrevity(essay, 'أرسل لي قائمة المنتجات')
    expect(list.split('\n').length).toBe(6)
  })
})

// ---------------------------------------------------------------------------
// Handoff Alert
// ---------------------------------------------------------------------------

function handoffTables(conversation: Record<string, unknown>) {
  return {
    contacts: { rows: [{ id: CONTACT, organization_id: ORG, phone: '+967712000111', full_name: 'أحمد علي' }] },
    contact_identities: {
      unique: [['contact_id', 'channel', 'external_user_id']],
      rows: [{ contact_id: CONTACT, channel: 'sms', external_user_id: '+967712000111', contacts: { id: CONTACT, full_name: 'أحمد علي', phone: '+967712000111', organization_id: ORG } }],
    },
    conversations: { unique: [{ columns: ['organization_id', 'contact_id', 'channel_id'], where: (row: Record<string, unknown>) => row.status !== 'closed' }], rows: [conversation] },
    messages: { unique: [['conversation_id', 'external_message_id']] },
    consents: { rows: [] },
    audit_events: { rows: [] },
    ai_agents: { rows: [] },
    notifications: { rows: [] },
    outbox_events: { unique: [['idempotency_key']], rows: [] },
    business_profiles: { rows: [{ organization_id: ORG, handoff_alert_phone: '+967 770 000 999' }] },
    channels: { rows: [{ id: WA_CHANNEL, organization_id: ORG, channel_type: 'whatsapp', connection_mode: 'qr_unofficial', is_active: true }] },
  }
}

const openConversation = {
  id: 'conv-1', organization_id: ORG, contact_id: CONTACT, channel_id: CHANNEL,
  status: 'open', state: 'new', ai_enabled: true, last_message_at: '2026-03-01T00:00:00.000Z',
}

describe('human handoff alert', () => {
  test('detects explicit requests for a human in Arabic and English', () => {
    for (const text of ['أبي أكلم موظف', 'اريد التحدث مع موظف', 'حولني على خدمة العملاء', 'ابغى اتواصل مع المدير', 'I want to talk to a human', 'موظف حقيقي لو سمحت']) {
      expect(detectHumanHandoffRequest(text)).toBe(true)
    }
    for (const text of ['كم سعر التوصيل؟', 'هل عندكم موظفين توصيل في صنعاء؟', 'شكراً']) {
      expect(detectHumanHandoffRequest(text)).toBe(false)
    }
  })

  test('pauses the agent, notifies the dashboard and queues a WhatsApp alert to the owner', async () => {
    const fake = createFakeDb(handoffTables({ ...openConversation }))
    const result = await triggerHumanHandoff(fake.client as unknown as DbClient, {
      organizationId: ORG, businessId: BIZ, conversationId: 'conv-1', contactId: CONTACT,
      reason: 'customer_requested', lastMessage: 'أبي أكلم موظف بخصوص طلبي', source: 'customer_request',
    }, { siteOrigin: () => 'https://kayan-ai.up.railway.app' })

    const conversation = fake.store.conversations.rows?.[0]
    expect(conversation?.ai_enabled).toBe(false)
    expect(conversation?.state).toBe('human_handoff')
    expect(conversation?.status).toBe('handed_off')

    const notification = fake.store.notifications.rows?.[0]
    expect(notification?.entity_type).toBe('conversation')
    expect(notification?.entity_id).toBe('conv-1')
    expect(String(notification?.title)).toContain('أحمد علي')
    expect(String(notification?.body)).toContain('+967712000111')

    const alert = fake.store.outbox_events.rows?.[0]
    expect(alert?.recipient).toBe('967770000999')
    expect(alert?.channel_id).toBe(WA_CHANNEL)
    const body = String((alert?.payload as Record<string, unknown>).body)
    expect(body).toContain('أحمد علي')
    expect(body).toContain('+967712000111')
    expect(body).toContain('أبي أكلم موظف')
    expect(body).toContain('https://kayan-ai.up.railway.app/dashboard/conversations/conv-1')
    // Not tied to the customer thread: the drain will not record it as a customer message.
    expect((alert?.payload as Record<string, unknown>).conversation_id).toBeUndefined()
    expect(result.whatsappQueued).toBe(true)
    expect(result.notificationCreated).toBe(true)
  })

  test('an inbound "talk to a human" message triggers handoff before any model call', async () => {
    const fake = createFakeDb(handoffTables({ ...openConversation }))
    const result = await processInboundMessage(fake.client as unknown as DbClient, {
      organizationId: ORG, businessId: BIZ, channelId: CHANNEL, channelType: 'sms', provider: 'twilio',
      externalEventId: 'SM_handoff', externalUserId: '+967712000111', senderPhone: '+967712000111',
      text: 'أبي أكلم موظف',
    })
    expect(result.reply).toContain('أحد أعضاء الفريق')
    expect(fake.store.conversations.rows?.[0]?.ai_enabled).toBe(false)
    expect(fake.store.outbox_events.rows?.length).toBe(1)
    expect(fake.store.notifications.rows?.length).toBe(1)
  })
})

// ---------------------------------------------------------------------------
// Public pricing from PostgreSQL
// ---------------------------------------------------------------------------

describe('public pricing catalog', () => {
  test('uses DB plans and plan_prices, exposing every enabled currency', () => {
    const pricing = buildPublicPricing(
      [
        { id: 'p1', code: 'starter', name: 'الأساسية', description: null, monthly_price: 12, currency: 'USD', limits: { ai_messages: 1500 }, is_active: true },
        { id: 'p0', code: 'trial', name: 'المجانية', description: null, monthly_price: 0, currency: 'USD', limits: null, is_active: true },
      ],
      [
        { plan_id: 'p1', billing_cycle: 'monthly', currency: 'YER', amount: 6500, is_active: true },
        { plan_id: 'p1', billing_cycle: 'yearly', currency: 'YER', amount: 60000, is_active: true },
        { plan_id: 'p1', billing_cycle: 'yearly', currency: 'USD', amount: 115, is_active: true },
      ]
    )
    expect(pricing.source).toBe('database')
    expect(pricing.currencies).toEqual(['USD', 'YER'])
    expect(pricing.plans.map((plan) => plan.code)).toEqual(['trial', 'starter'])
    const starter = pricing.plans[1]
    expect(resolvePlanPrice(starter, 'USD', 'monthly')).toBe(12)
    expect(resolvePlanPrice(starter, 'USD', 'yearly')).toBe(115)
    expect(resolvePlanPrice(starter, 'YER', 'monthly')).toBe(6500)
    expect(starter.limits.ai_messages).toBe(1500)
    expect(formatPlanPrice(6500, 'YER')).toBe('6,500 ر.ي')
  })

  test('falls back to the static catalog only when there are no DB plans', () => {
    const pricing = buildPublicPricing([], [])
    expect(pricing.source).toBe('static')
    expect(pricing.plans.length).toBe(4)
  })
})
