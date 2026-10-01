import { afterEach, describe, expect, test } from 'bun:test'
import {
  buildPromptAddition,
  draftFromDescription,
  generateAgentSetupDraft,
  looksLikePrice,
  looksLikeTime,
  parseAgentSetupDraft,
} from '@/lib/ai/setup-draft'
import type { AIProvider } from '@/lib/providers/types'

const ORIGINAL_KEY = process.env.GEMINI_API_KEY

afterEach(() => {
  if (ORIGINAL_KEY === undefined) delete process.env.GEMINI_API_KEY
  else process.env.GEMINI_API_KEY = ORIGINAL_KEY
})

describe('AI setup draft', () => {
  test('price and clock detectors catch what must never become configuration', () => {
    expect(looksLikePrice('تصوير الأعراس 5000 ريال')).toBe(true)
    expect(looksLikePrice('باقة العرس $1200')).toBe(true)
    expect(looksLikePrice('تصوير الأعراس')).toBe(false)
    expect(looksLikeTime('التنسيق 10:00 صباحاً')).toBe(true)
    expect(looksLikeTime('الرد على الرسائل')).toBe(false)
  })

  test('services carrying a price or a time are dropped instead of stored', () => {
    const { draft, droppedServices } = parseAgentSetupDraft(
      {
        agentName: 'مساعد روائع الأعراس',
        replyStyle: 'formal',
        handoff: 'always',
        summary: 'شركة تنظيم أعراس وتنسيق حفلات.',
        services: ['تصوير الأعراس', 'ديكور القاعة 3000 ريال', 'تنسيق الحفل 10:00 صباحاً', 'استقبال الحجوزات'],
      },
      'روائع الأعراس AI'
    )

    expect(draft.services).toEqual(['تصوير الأعراس', 'استقبال الحجوزات'])
    expect(droppedServices).toEqual(['ديكور القاعة 3000 ريال', 'تنسيق الحفل 10:00 صباحاً'])
    expect(draft.replyStyle).toBe('formal')
    expect(draft.handoff).toBe('always')
  })

  test('unknown values fall back to safe defaults instead of failing setup', () => {
    const { draft } = parseAgentSetupDraft(
      { agentName: '', replyStyle: 'sarcastic', handoff: 'invent-one', summary: '   ', services: 'not-an-array' },
      'روائع الأعراس AI'
    )
    expect(draft.agentName).toBe('روائع الأعراس AI')
    expect(draft.replyStyle).toBe('warm')
    expect(draft.handoff).toBe('when_asked')
    expect(draft.summary).toBe('')
    expect(draft.services).toEqual([])
  })

  test('the published prompt is system text plus the owner description, with the safety rule', () => {
    const addition = buildPromptAddition(
      {
        agentName: 'مساعد الأعراس',
        replyStyle: 'warm',
        handoff: 'when_asked',
        summary: 'نظم حفلات الأعراس والتصوير والديكور.',
        services: ['تصوير'],
      },
      'روائع الأعراس AI'
    )

    expect(addition).toContain('مساعد الأعراس')
    expect(addition).toContain('نظم حفلات الأعراس والتصوير والديكور.')
    expect(addition).toContain('لا تذكر أي سعر أو مدة أو موعد أو سياسة')
    // No price or clock may ever be published as configuration.
    expect(looksLikePrice(addition)).toBe(false)
    expect(looksLikeTime(addition)).toBe(false)
  })

  test('without a model credential the draft is the owner’s own words and says so', async () => {
    delete process.env.GEMINI_API_KEY

    const result = await generateAgentSetupDraft({
      description: 'نحن شركة تنظيم أعراس ونستقبل الحجوزات عبر واتساب.',
      businessName: 'روائع الأعراس',
    })

    expect(result.source).toBe('template')
    expect(result.draft.summary).toBe('نحن شركة تنظيم أعراس ونستقبل الحجوزات عبر واتساب.')
    expect(result.draft.services).toEqual([])
    expect(result.notice).toBeTruthy()
  })

  test('model output is validated before it can be shown as configuration', async () => {
    process.env.GEMINI_API_KEY = 'test-key'

    const provider: AIProvider = {
      async call() {
        return {
          content: [
            {
              type: 'text',
              text: JSON.stringify({
                agentName: 'مساعد الحجوزات',
                replyStyle: 'brief',
                handoff: 'after_hours',
                summary: 'نشاط لتنظيم الأعراس. أسعار الباقة تبدأ من 5000 ريال.',
                services: ['تصوير الأعراس', 'ديكور 4000 ريال'],
              }),
            },
          ],
          inputTokens: 1,
          outputTokens: 1,
        }
      },
    }

    const result = await generateAgentSetupDraft({
      description: 'ننظم أعراساً ونصور وننسق.',
      businessName: 'روائع الأعراس',
      provider,
    })

    expect(result.source).toBe('ai')
    expect(result.draft.agentName).toBe('مساعد الحجوزات')
    // The priced sentence is stripped from the summary and the priced service is dropped.
    expect(result.draft.summary).not.toContain('5000')
    expect(result.draft.services).toEqual(['تصوير الأعراس'])
    expect(result.droppedServices).toEqual(['ديكور 4000 ريال'])
  })

  test('a model failure falls back to the description rather than breaking setup', async () => {
    process.env.GEMINI_API_KEY = 'test-key'

    const provider: AIProvider = {
      async call() {
        throw new Error('provider down')
      },
    }

    const result = await generateAgentSetupDraft({
      description: 'نقدم خدمات التصوير والديكور.',
      businessName: 'روائع الأعراس',
      provider,
    })

    expect(result.source).toBe('template')
    expect(result.draft.summary).toBe('نقدم خدمات التصوير والديكور.')
  })

  test('draftFromDescription never invents services or prices', () => {
    const result = draftFromDescription({
      description: 'ورشة خياطة، نستقبل الطلبات ونخيط الملابس.',
      businessName: 'الخياط',
    })
    expect(result.draft.services).toEqual([])
    expect(looksLikePrice(result.draft.summary)).toBe(false)
    expect(result.source).toBe('template')
  })
})
