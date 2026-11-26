import { afterEach, describe, expect, test } from 'bun:test'
import type { DbClient } from '@/lib/db/client'
import {
  DEFAULT_MAX_OUTPUT_TOKENS,
  WHATSAPP_MAX_OUTPUT_TOKENS,
  enforceWhatsAppBrevity,
  maxOutputTokensForChannel,
} from '@/lib/ai/channel-format'
import { buildBusinessSystemPrompt } from '@/lib/ai/prompt'
import { splitWhatsAppMessage } from '@/lib/channels/whatsapp-format'
import { handleCentralInbound, type CentralDeps } from '@/lib/central-bot/router'
import { sendCentralText } from '@/lib/central-bot/meta-client'
import { getCentralBotConfig } from '@/lib/central-bot/config'
import { aiGuardPolicyFor } from '@/lib/billing/free-tier'
import { geminiProvider } from '@/lib/providers/gemini'
import { groqProvider } from '@/lib/providers/groq'
import { sendWhatsAppText } from '@/lib/providers/meta'
import {
  processInboundMessage,
  setAgentTurnRunner,
  setInboundGuardsFactory,
  setPersonalTurnRunner,
} from '@/lib/runtime/process-inbound'
import { runAgentTurn } from '@/lib/runtime/agent-runtime'
import { retrievePersonalMemories } from '@/lib/personal-assistant/memory-retrieval'
import { isOAuthProvider, OAUTH_PROVIDERS } from '@/lib/auth/oauth/state'
import { oauthErrorMessage } from '@/lib/auth/oauth/messages'
import { resolveOAuthAccount, type OAuthAccountDeps } from '@/lib/auth/oauth/account'
import { BUSINESS_TYPES, DEFAULT_BUSINESS_TYPE } from '@/lib/capabilities/business-types'
import { validateSignUpInput } from '@/lib/auth/signup-validation'
import { classifyUpsertMessage } from '../../whatsapp-gateway/src/message-direction.js'
import { createFakeDb } from './support/fake-db'

const ORG_PA = '0a000000-0000-4000-8000-000000000010'
const BIZ_PA = '0a000000-0000-4000-8000-000000000011'
const CHAN_PA = '0a000000-0000-4000-8000-000000000012'
const OWNER_USER = 'a0000000-0000-4000-8000-000000000010'
const OWNER_PHONE = '+967711111111'
const THIRD_PARTY_PHONE = '+967799999999'

const ORG_BIZ = '0b000000-0000-4000-8000-000000000020'
const BIZ_REGULAR = '0b000000-0000-4000-8000-000000000021'

function asDb(fake: ReturnType<typeof createFakeDb>): DbClient {
  return fake.client as unknown as DbClient
}

const originalFetch = globalThis.fetch

afterEach(() => {
  setAgentTurnRunner(null)
  setPersonalTurnRunner(null)
  setInboundGuardsFactory(null)
  globalThis.fetch = originalFetch
  delete process.env.GEMINI_API_KEY
  delete process.env.GROQ_API_KEY
  delete process.env.META_GRAPH_BASE_URL
})

describe('Fix 1: Owner Mode vs External Contact Mode in personal_assistant (plus group/ignored drops)', () => {
  function setupPersonalInboundDb() {
    return createFakeDb({
      organizations: {
        rows: [
          {
            id: ORG_PA,
            name: 'حساب طارق الشخصي',
            business_type: 'personal_assistant',
            ignored_phones: ['+967788888888'],
            vertical_config: {},
          },
          {
            id: ORG_BIZ,
            name: 'عيادة النور',
            business_type: 'clinic',
            ignored_phones: [],
            vertical_config: {},
          },
        ],
      },
      organization_members: {
        rows: [
          { id: 'om-1', organization_id: ORG_PA, user_id: OWNER_USER, role: 'owner' },
          { id: 'om-2', organization_id: ORG_BIZ, user_id: OWNER_USER, role: 'owner' },
        ],
      },
      business_profiles: {
        rows: [
          {
            id: 'bp-pa',
            organization_id: ORG_PA,
            business_id: BIZ_PA,
            business_type_id: 'personal_assistant',
            industry: 'personal_assistant',
            timezone: 'Asia/Aden',
          },
          {
            id: 'bp-biz',
            organization_id: ORG_BIZ,
            business_id: BIZ_REGULAR,
            business_type_id: 'clinic',
            industry: 'clinic',
            timezone: 'Asia/Aden',
          },
        ],
      },
      organization_capabilities: { rows: [] },
      business_types: { rows: [{ id: 'clinic', name: 'عيادة ومركز طبي' }] },
      personal_assistant_links: {
        rows: [
          {
            id: 'link-1',
            org_id: ORG_PA,
            user_id: OWNER_USER,
            whatsapp_phone: OWNER_PHONE,
            verified_at: '2026-11-26T10:00:00Z',
            kill_switch_active: false,
          },
        ],
      },
      user_memories: {
        rows: [
          {
            id: 'mem-secret',
            organization_id: ORG_PA,
            user_id: OWNER_USER,
            category: 'fact',
            content: 'الاسم السري للمالك طارق ورقم حسابه الخاص 998877',
            confidence: 1,
            updated_at: '2026-11-26T10:00:00Z',
          },
        ],
      },
      personal_tasks: {
        rows: [
          {
            id: 'pt-secret',
            org_id: ORG_PA,
            user_id: OWNER_USER,
            title: 'مراجعة العقد السري الساعة 4 عصراً',
            status: 'pending',
            created_at: '2026-11-26T10:00:00Z',
          },
        ],
      },
      channels: { rows: [{ id: CHAN_PA, organization_id: ORG_PA, business_id: BIZ_PA, channel_type: 'whatsapp', is_active: true }] },
      contacts: { rows: [] },
      contact_identities: { rows: [] },
      conversations: { rows: [] },
      messages: { rows: [] },
      ai_agents: {
        rows: [
          { id: 'ag-pa', organization_id: ORG_PA, business_id: BIZ_PA, slug: 'frontdesk', status: 'active' },
          { id: 'ag-biz', organization_id: ORG_BIZ, business_id: BIZ_REGULAR, slug: 'frontdesk', status: 'active' },
        ],
      },
      businesses: {
        rows: [
          { id: BIZ_PA, organization_id: ORG_PA, status: 'draft' },
          { id: BIZ_REGULAR, organization_id: ORG_BIZ, status: 'live' },
        ],
      },
      agent_prompt_versions: { rows: [] },
      agent_runs: { rows: [] },
      usage_ledger: { rows: [] },
      knowledge_base: { rows: [] },
      services: { rows: [] },
      business_hours: { rows: [] },
      pending_actions: { rows: [] },
      consent_status: { rows: [] },
      owner_presence: { rows: [] },
      sla_states: { rows: [] },
    })
  }

  function installNoopGuards() {
    setInboundGuardsFactory(() => ({
      policy: async () => ({
        planCode: 'growth',
        free: false,
        dailyLimit: null,
        monthlyLimit: 1000,
        mediaMonthly: null,
        mediaMaxBytes: 5 * 1024 * 1024,
        audioMaxSeconds: 60,
        documentsAllowed: true,
        maxInputChars: 2000,
        maxOutputTokens: null,
        floodPerMinute: 10,
        economy: false,
      }),
      fingerprints: async () => [],
      consumeQuota: async () => ({ allowed: true }),
      consumeFlood: async () => true,
      coalesceMs: 0,
    }))
  }

  test('owner message enters Owner Mode with user_memories', async () => {
    const fake = setupPersonalInboundDb()
    const db = asDb(fake)
    let ownerTurnCalled = false
    let externalTurnCalled = false
    let loadedMemories: string[] = []

    setPersonalTurnRunner(async (client, owner, text) => {
      ownerTurnCalled = true
      const mems = await retrievePersonalMemories(client, owner, text)
      loadedMemories = mems.map((m) => m.content)
      return { reply: 'أبشر يا أبو علي 👋 تم تسجيل طلبك.', inputTokens: 10, outputTokens: 12, model: 'test' }
    })
    setAgentTurnRunner(async () => {
      externalTurnCalled = true
      return 'external'
    })

    const ownerRes = await processInboundMessage(db, {
      organizationId: ORG_PA,
      businessId: BIZ_PA,
      channelId: CHAN_PA,
      channelType: 'whatsapp',
      provider: 'whatsapp_qr',
      externalEventId: 'qr:owner-1',
      externalUserId: '967711111111@s.whatsapp.net',
      senderPhone: OWNER_PHONE,
      displayName: 'المالك',
      text: 'ما رقم حسابي الخاص طارق؟',
    })

    expect(ownerTurnCalled).toBe(true)
    expect(externalTurnCalled).toBe(false)
    expect(ownerRes.reply).toContain('أبشر')
    expect(loadedMemories.some((m) => m.includes('998877'))).toBe(true)
  })

  test('friend / external contact gets a polite reply in External Contact Mode without leaking user_memories, tasks, or owner name', async () => {
    const fake = setupPersonalInboundDb()
    const db = asDb(fake)
    installNoopGuards()

    let ownerTurnCalled = false
    const capturedExternalArgs: Parameters<typeof runAgentTurn>[0][] = []

    setPersonalTurnRunner(async () => {
      ownerTurnCalled = true
      return { reply: 'leak', inputTokens: 0, outputTokens: 0, model: 'test' }
    })
    setAgentTurnRunner(async (args) => {
      capturedExternalArgs.push(args)
      return runAgentTurn(args)
    })

    process.env.GEMINI_API_KEY = 'test-gemini-key'
    let capturedSystemPrompt = ''
    let capturedToolsCount = -1
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const payload = JSON.parse(String(init?.body ?? '{}')) as {
        systemInstruction?: { parts?: Array<{ text?: string }> }
        tools?: unknown[]
      }
      capturedSystemPrompt = payload.systemInstruction?.parts?.[0]?.text ?? ''
      capturedToolsCount = Array.isArray(payload.tools) ? payload.tools.length : 0
      return new Response(
        JSON.stringify({
          candidates: [
            { content: { parts: [{ text: 'أهلاً بك يا سعيد 👋 أنا المساعد الشخصي، سأوصل رسالتك لصاحب الحساب فور توفره ✨' }] } },
          ],
          usageMetadata: { promptTokenCount: 25, candidatesTokenCount: 30 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    const friendRes = await processInboundMessage(db, {
      organizationId: ORG_PA,
      businessId: BIZ_PA,
      channelId: CHAN_PA,
      channelType: 'whatsapp',
      provider: 'whatsapp_qr',
      externalEventId: 'qr:friend-1',
      externalUserId: '967799999999@s.whatsapp.net',
      senderPhone: THIRD_PARTY_PHONE,
      displayName: 'سعيد',
      text: 'هلا كيف حالك؟',
    })

    expect(ownerTurnCalled).toBe(false)
    expect(friendRes.reply).toContain('أهلاً بك يا سعيد')
    expect(capturedExternalArgs[0]?.personalExternalContact?.senderName).toBe('سعيد')
    expect(capturedToolsCount).toBe(0)

    // System prompt must identify the external contact, separate identities, allow emojis, and leak ZERO owner secrets
    expect(capturedSystemPrompt).toContain('سعيد')
    expect(capturedSystemPrompt).toContain('صديق أو جهة اتصال خارجية')
    expect(capturedSystemPrompt).toContain('يُمنع منعاً باتاً مناداة المرسل باسم المالك')
    expect(capturedSystemPrompt).toContain('👋')
    expect(capturedSystemPrompt).not.toContain('998877')
    expect(capturedSystemPrompt).not.toContain('طارق')
    expect(capturedSystemPrompt).not.toContain('مراجعة العقد السري')
  })

  test('silently drops groups, broadcasts, channels, and ignored_phones without calling any AI runner', async () => {
    const fake = setupPersonalInboundDb()
    const db = asDb(fake)
    let anyAiCalled = false

    setPersonalTurnRunner(async () => {
      anyAiCalled = true
      return { reply: 'owner-reply', inputTokens: 0, outputTokens: 0, model: 'test' }
    })
    setAgentTurnRunner(async () => {
      anyAiCalled = true
      return 'external-reply'
    })

    const groupRes = await processInboundMessage(db, {
      organizationId: ORG_PA,
      businessId: BIZ_PA,
      channelId: CHAN_PA,
      channelType: 'whatsapp',
      provider: 'whatsapp_qr',
      externalEventId: 'qr:group-1',
      externalUserId: '1203630000112233@g.us',
      senderPhone: OWNER_PHONE,
      text: 'رسالة مجموعة',
    })
    expect(groupRes.reply).toBeNull()
    expect(groupRes.conversationId).toBe('')

    const broadcastRes = await processInboundMessage(db, {
      organizationId: ORG_PA,
      businessId: BIZ_PA,
      channelId: CHAN_PA,
      channelType: 'whatsapp',
      provider: 'whatsapp_qr',
      externalEventId: 'qr:broadcast-1',
      externalUserId: 'status@broadcast',
      senderPhone: null,
      text: 'تحديث حالة',
    })
    expect(broadcastRes.reply).toBeNull()

    const ignoredRes = await processInboundMessage(db, {
      organizationId: ORG_PA,
      businessId: BIZ_PA,
      channelId: CHAN_PA,
      channelType: 'whatsapp',
      provider: 'whatsapp_qr',
      externalEventId: 'qr:ignored-1',
      externalUserId: '967788888888@s.whatsapp.net',
      senderPhone: '+967788888888',
      text: 'رقم مستبعد',
    })
    expect(ignoredRes.reply).toBeNull()
    expect(ignoredRes.conversationId).toBe('')
    expect(anyAiCalled).toBe(false)
    expect((fake.store.contacts?.rows ?? []).length).toBe(0)
  })

  test('gateway classifyUpsertMessage ignores groups via remoteJidAlt and central router drops group JIDs', async () => {
    expect(
      classifyUpsertMessage(
        { key: { remoteJid: '967799999999@s.whatsapp.net', remoteJidAlt: '120363001@g.us', id: 'm1', fromMe: false } },
        'notify'
      )
    ).toEqual({ kind: 'ignore', reason: 'unsupported_chat' })

    const fake = setupPersonalInboundDb()
    const deps: CentralDeps = {
      hasAccess: async () => true,
      sendText: async () => {},
      sendButtons: async () => {},
      transcribe: async () => '',
      runTurn: async () => ({ reply: 'secret' }),
    }
    const status = await handleCentralInbound(
      asDb(fake),
      { from: '1203630001@g.us', messageId: 'g-msg-1', type: 'text', text: 'مرحبا' },
      deps
    )
    expect(status).toBe('invalid_sender')
  })

  test('business prompt never injects owner user_memories or owner personal identity', async () => {
    const fake = setupPersonalInboundDb()
    const prompt = await buildBusinessSystemPrompt(asDb(fake), ORG_BIZ, 'ag-biz', 'استفسار عن الأسعار')
    expect(prompt).not.toContain('998877')
    expect(prompt).not.toContain('طارق')
    expect(prompt).toContain('user_memories')
  })
})

describe('Fix 2: Eliminates response truncation & thinking token starvation across providers and WhatsApp delivery', () => {
  test('enforceWhatsAppBrevity keeps full multi-line responses, bullet lists, and tables intact', () => {
    expect(WHATSAPP_MAX_OUTPUT_TOKENS >= 2048).toBe(true)
    expect(DEFAULT_MAX_OUTPUT_TOKENS >= 4096).toBe(true)
    expect(maxOutputTokensForChannel('whatsapp') >= 2048).toBe(true)
    expect((aiGuardPolicyFor('trial', {}).maxOutputTokens ?? 0) >= 1500).toBe(true)

    const longStructured = [
      'إليك الخطة الأسبوعية المقترحة لمشروعك:',
      '1. مراجعة طلبات العملاء صباحاً وتحديث حالة الشحن.',
      '2. نشر عرض الباقة الجديدة عبر واتساب العملاء.',
      '3. متابعة الحجوزات المؤكدة قبل الموعد بـ 24 ساعة.',
      '4. إعداد ملخص المبيعات الأسبوعي وتصديره كملف.',
      '5. اختبار ردود الوكيل على الأسئلة الشائعة الجديدة.',
    ].join('\n')

    const formatted = enforceWhatsAppBrevity(longStructured, 'رتب لي خطة العمل')
    expect(formatted).toContain('5. اختبار ردود الوكيل')
    expect(formatted.split('\n').length).toBe(6)
  })

  test('geminiProvider and groqProvider allocate sufficient maxOutputTokens and avoid thinkingBudget starvation', async () => {
    process.env.GEMINI_API_KEY = 'test-gemini-key'
    let capturedGeminiBody: Record<string, unknown> = {}

    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      capturedGeminiBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          candidates: [{ content: { parts: [{ text: 'رد عربي كامل ومتكامل من دون أي انقطاع.' }] } }],
          usageMetadata: { promptTokenCount: 20, candidatesTokenCount: 25 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    await geminiProvider.call({
      system: 'مساعد',
      messages: [{ role: 'user', content: 'أعطني تفاصيل كاملة' }],
      tools: [],
      isWhatsApp: true,
    })

    const genCfg = capturedGeminiBody.generationConfig as { maxOutputTokens: number; thinkingConfig?: Record<string, unknown> }
    expect(Number(genCfg.maxOutputTokens) >= 2048).toBe(true)

    process.env.GROQ_API_KEY = 'test-groq-key'
    let capturedGroqBody: Record<string, unknown> = {}
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      capturedGroqBody = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
      return new Response(
        JSON.stringify({
          model: 'openai/gpt-oss-120b',
          choices: [{ message: { content: 'رد كامل عبر Groq' } }],
          usage: { prompt_tokens: 10, completion_tokens: 12 },
        }),
        { status: 200, headers: { 'content-type': 'application/json' } }
      )
    }) as unknown as typeof fetch

    await groqProvider.call({
      system: 'مساعد',
      messages: [{ role: 'user', content: 'مرحبا' }],
      tools: [],
      isWhatsApp: true,
    })
    expect(Number(capturedGroqBody.max_completion_tokens) >= 2048).toBe(true)
  })

  test('splitWhatsAppMessage and WhatsApp senders deliver long multi-line replies completely across chunks', async () => {
    const lines = Array.from({ length: 120 }, (_, i) => `البند رقم ${i + 1}: شرح كامل للخدمة المتاحة مع كل التفاصيل المطلوبة.`)
    const fullText = lines.join('\n')
    const chunks = splitWhatsAppMessage(fullText, 1200)
    expect(chunks.length).toBeGreaterThan(3)
    expect(chunks.join('\n')).toContain('البند رقم 120:')
    for (const chunk of chunks) {
      expect(chunk.length <= 1200).toBe(true)
    }

    process.env.META_GRAPH_BASE_URL = 'https://graph.example.test/v20.0'
    const sentMetaBodies: string[] = []
    globalThis.fetch = (async (_url: unknown, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { text?: { body?: string } }
      sentMetaBodies.push(String(body.text?.body ?? ''))
      return new Response(JSON.stringify({ messages: [{ id: 'wamid.test' }] }), { status: 200 })
    }) as unknown as typeof fetch

    const veryLongText = Array.from({ length: 140 }, (_, i) => `سطر ${i + 1}: نص عربي طويل نسبياً للاختبار الكامل.`).join('\n')
    await sendWhatsAppText({ access_token: 'tok', phone_number_id: 'pn-1' }, '967700000001', veryLongText)
    expect(sentMetaBodies.length).toBeGreaterThan(1)
    expect(sentMetaBodies.join('\n')).toContain('سطر 140:')

    const sentCentralBodies: string[] = []
    const cfg = getCentralBotConfig({
      NODE_ENV: 'test',
      KAYAN_CENTRAL_WA_ACCESS_TOKEN: 'dummy-test-value',
      KAYAN_CENTRAL_WA_PHONE_NUMBER_ID: 'pn-central',
      KAYAN_CENTRAL_WA_DISPLAY_NUMBER: '+967700000000',
    })
    expect(cfg).not.toBeNull()
    if (cfg) {
      await sendCentralText(
        cfg,
        '+967711111111',
        veryLongText,
        (async (_url: unknown, init?: RequestInit) => {
          const body = JSON.parse(String(init?.body ?? '{}')) as { text?: { body?: string } }
          sentCentralBodies.push(String(body.text?.body ?? ''))
          return new Response('{}', { status: 200 })
        }) as unknown as typeof fetch
      )
      expect(sentCentralBodies.length).toBeGreaterThan(1)
      expect(sentCentralBodies.join('\n')).toContain('سطر 140:')
    }
  })
})

describe('Fix 3: Signup without Apple, without technical labels, without default sector, and without upfront company name', () => {
  test('removes Apple OAuth support and keeps Google only', () => {
    expect(OAUTH_PROVIDERS).toEqual(['google'])
    expect(isOAuthProvider('google')).toBe(true)
    expect(isOAuthProvider('apple')).toBe(false)
    expect(oauthErrorMessage('cancelled', 'google')).toContain('Google')
  })

  test('removes default sector pre-selection and technical English keys from sector hints', () => {
    expect(DEFAULT_BUSINESS_TYPE).toBe('')
    for (const sector of BUSINESS_TYPES) {
      expect(sector.hint).not.toContain('appointments')
      expect(sector.hint).not.toContain('lead_capture')
      expect(sector.hint).not.toContain('knowledge_base')
      expect(sector.hint).not.toContain('patient_name')
      expect(sector.hint).not.toContain('service_id')
    }
  })

  test('rejects signup without businessTypeId and accepts email/phone signup without companyName in step 1', () => {
    const missingSector = validateSignUpInput({
      businessTypeId: '',
      email: 'owner@example.com',
      password: 'StrongPassword123',
      acceptedTerms: true,
    })
    expect(missingSector.ok).toBe(false)
    if (!missingSector.ok) {
      expect(missingSector.error).toContain('نوع النشاط')
    }

    const unknownSector = validateSignUpInput({
      businessTypeId: 'invalid_sector',
      email: 'owner@example.com',
      password: 'StrongPassword123',
      acceptedTerms: true,
    })
    expect(unknownSector.ok).toBe(false)

    const emailNoCompany = validateSignUpInput({
      businessTypeId: 'ecommerce_store',
      email: 'owner@example.com',
      password: 'StrongPassword123',
      acceptedTerms: true,
    })
    expect(emailNoCompany.ok).toBe(true)
    if (emailNoCompany.ok) {
      expect(emailNoCompany.data.companyName).toBeNull()
      expect(emailNoCompany.data.businessTypeId).toBe('ecommerce_store')
    }

    const phoneNoCompany = validateSignUpInput({
      businessTypeId: 'clinic',
      phone: '+967777123456',
      password: 'StrongPassword123',
      acceptedTerms: true,
    })
    expect(phoneNoCompany.ok).toBe(true)
    if (phoneNoCompany.ok) {
      expect(phoneNoCompany.data.companyName).toBeNull()
      expect(phoneNoCompany.data.phone).toBe('+967777123456')
    }
  })

  test('Google OAuth signup creates account without requiring company name up front', async () => {
    let createdPayload: { email: string; name: string | null; provider: 'google' } | null = null
    const deps: OAuthAccountDeps = {
      findIdentityUserId: async () => null,
      findUserById: async () => null,
      findUserByEmail: async () => null,
      linkIdentity: async () => {},
      markEmailVerified: async () => {},
      revokePasswordAndSessions: async () => {},
      createOAuthUser: async (input) => {
        createdPayload = input
        return {
          id: 'u-google-1',
          email: input.email,
          sessionVersion: 0,
          bannedUntil: null,
          emailVerifiedAt: '2026-11-27T00:00:00Z',
        }
      },
      logEvent: async () => {},
    }

    const res = await resolveOAuthAccount(
      { provider: 'google', subject: 'sub-1', email: 'newuser@example.com', emailVerified: true, name: 'Test User' },
      deps
    )
    expect(res.kind).toBe('created')
    expect(createdPayload).toEqual({ provider: 'google', email: 'newuser@example.com', name: 'Test User' })
  })
})
