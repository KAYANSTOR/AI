/**
 * AI-assisted setup (docs/PLAN.md §8.3.6).
 *
 * The customer describes the business in their own words; the model turns that into a
 * controlled draft. The schema deliberately has no field for prices, hours, availability
 * or policy answers: those live behind backend checks (services, business hours, knowledge
 * base) and must never be produced from a description. Anything that still looks like a
 * price or a clock time is dropped instead of being shown as configuration.
 *
 * When the model is unavailable the draft falls back to the customer's own words. That is
 * not invented data: it is exactly the text the person typed, plus system defaults.
 */
import { geminiProvider } from '@/lib/providers/gemini'
import type { AIProvider, ModelBlock } from '@/lib/providers/types'

export type ReplyStyleId = 'warm' | 'formal' | 'brief'
export type HandoffId = 'when_asked' | 'always' | 'after_hours'

export type AgentSetupDraft = {
  agentName: string
  replyStyle: ReplyStyleId
  handoff: HandoffId
  summary: string
  /** Service names as mentioned by the customer. Never a price or a duration. */
  services: string[]
}

export type SetupDraftSource = 'ai' | 'template'

export type SetupDraftResult = {
  draft: AgentSetupDraft
  source: SetupDraftSource
  /** Human notice when the draft was not produced by the model. */
  notice?: string
  /** Service items that were discarded because they carried a price or a time. */
  droppedServices: string[]
}

export const REPLY_STYLE_LABELS: Record<ReplyStyleId, string> = {
  warm: 'ودّي وقريب من العميل',
  formal: 'رسمي ومهني',
  brief: 'مختصر ومباشر',
}

export const HANDOFF_LABELS: Record<HandoffId, string> = {
  when_asked: 'حوّل للموظف عندما يطلب العميل ذلك',
  always: 'حوّل كل المحادثات للموظف',
  after_hours: 'حوّل خارج أوقات العمل فقط',
}

const MAX_SUMMARY = 700
const MAX_SERVICES = 8
const MAX_SERVICE_LENGTH = 60
const MAX_AGENT_NAME = 60

/**
 * A price is anything that pairs a number with a currency word, code or symbol. Dropping
 * these is what keeps "never invent prices" true even if the model disobeys its prompt.
 */
export function looksLikePrice(value: string): boolean {
  return /(\d[\d.,]*\s*(ريال|دولار|درهم|دينار|جنيه|ليرة|ريال سعودي|ر\.س|SAR|USD|AED|EGP|YER))|([$€£]\s*\d)/i.test(
    value
  )
}

/** Clock times and ranges ("10:00", "الساعة 5", "من 9 إلى 11") are not service names. */
export function looksLikeTime(value: string): boolean {
  return /(\d{1,2}:\d{2})|(الساعة\s*\d)|(من\s*\d{1,2}\s*(صباح|مساء|ص|م)?\s*(إلى|الى|حتى)\s*\d{1,2})|(\d{1,2}\s*(ص|م)\b)/.test(
    value
  )
}

function cleanLine(value: unknown, max: number): string {
  if (typeof value !== 'string') return ''
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}

function asReplyStyle(value: unknown): ReplyStyleId {
  return value === 'formal' || value === 'brief' || value === 'warm' ? value : 'warm'
}

function asHandoff(value: unknown): HandoffId {
  return value === 'always' || value === 'after_hours' || value === 'when_asked' ? value : 'when_asked'
}

/** Sentences carrying a price or a time are removed from an AI summary. */
export function stripUnsafeSentences(value: string): string {
  return value
    .split(/(?<=[.!؟\n])\s+/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence && !looksLikePrice(sentence) && !looksLikeTime(sentence))
    .join(' ')
    .trim()
}

/**
 * Coerces whatever came back — model output, template output, or a replayed request — into
 * a valid draft. Invalid fields fall back to safe defaults instead of failing the customer.
 */
export function parseAgentSetupDraft(raw: unknown, fallbackName: string): {
  draft: AgentSetupDraft
  droppedServices: string[]
} {
  const source = (raw ?? {}) as Record<string, unknown>

  const agentName = cleanLine(source.agentName ?? source.agent_name, MAX_AGENT_NAME) || fallbackName

  const summary = stripUnsafeSentences(
    cleanLine(source.summary ?? source.business_summary, MAX_SUMMARY)
  )

  const rawServices = Array.isArray(source.services) ? source.services : []
  const services: string[] = []
  const droppedServices: string[] = []
  for (const entry of rawServices) {
    const name = cleanLine(entry, MAX_SERVICE_LENGTH)
    if (!name) continue
    if (looksLikePrice(name) || looksLikeTime(name)) {
      droppedServices.push(name)
      continue
    }
    if (services.length < MAX_SERVICES) services.push(name)
  }

  return {
    draft: {
      agentName,
      replyStyle: asReplyStyle(source.replyStyle ?? source.reply_style),
      handoff: asHandoff(source.handoff),
      summary,
      services,
    },
    droppedServices,
  }
}

/**
 * The published instruction block. Every sentence here is system-authored; the only
 * customer-supplied text is the description, and it is labelled as the owner's own words so
 * the model treats it as context rather than as verified operational data.
 */
export function buildPromptAddition(draft: AgentSetupDraft, fallbackName: string): string {
  const lines = [
    'تعريف الوكيل: ' + (draft.agentName || fallbackName),
    'أسلوب الرد: ' + REPLY_STYLE_LABELS[draft.replyStyle],
    'التعامل مع العملاء: ' + HANDOFF_LABELS[draft.handoff],
    '',
    'وصف النشاط كما كتبه صاحبه (سياق فقط):',
    draft.summary || 'لم يُقدَّم وصف تفصيلي بعد.',
    '',
  ]

  if (draft.services.length) {
    lines.push('خدمات ذكرها صاحب النشاط:')
    for (const service of draft.services) lines.push('- ' + service)
    lines.push('')
  }

  lines.push(
    'قواعد ثابتة: لا تذكر أي سعر أو مدة أو موعد أو سياسة غير موجودة في بيانات النظام. إن سُئلت عن شيء غير مسجّل، اعتذر بلطف واقترح تحويل المحادثة لموظف.'
  )

  return lines.join('\n')
}

export function draftFromDescription(input: {
  description: string
  businessName: string
}): SetupDraftResult {
  const summary = stripUnsafeSentences(cleanLine(input.description, MAX_SUMMARY))
  return {
    draft: {
      agentName: (input.businessName || 'الوكيل') + ' AI',
      replyStyle: 'warm',
      handoff: 'when_asked',
      summary,
      services: [],
    },
    source: 'template',
    notice:
      'صياغة الذكاء الاصطناعي غير متاحة الآن، لذلك استخدمنا وصفك كما كتبته مع الإعدادات الافتراضية. يمكنك تعديل كل حقل قبل الاعتماد.',
    droppedServices: [],
  }
}

function firstJsonObject(text: string): unknown {
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start === -1 || end <= start) return null
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    return null
  }
}

const SETUP_SYSTEM_PROMPT = [
  'أنت مهندس إعداد وكيل خدمة عملاء لمنصة عربية.',
  'تتلقى وصفاً كتبه صاحب النشاط، وتعيد JSON فقط بهذا الشكل:',
  '{"agentName":"اسم مختصر للوكيل","replyStyle":"warm|formal|brief","handoff":"when_asked|always|after_hours","summary":"فقرة قصيرة جداً تلخّص وصف صاحبه","services":["اسم خدمة كما ذُكر"]}',
  'قواعد صارمة: لا تخترع أسعاراً ولا أوقات عمل ولا مواعيد ولا سياسات ولا أسئلة متكررة.',
  'اذكر في services فقط الخدمات التي ذكرها صاحب النشاط نصاً، وبدون أسعار أو أرقام أو مدد.',
  'اكتب بالعربية الفصحى وبنبرة تخدم صاحب النشاط.',
  'أعد JSON فقط بدون أي نص خارجه.',
].join('\n')

export async function generateAgentSetupDraft(input: {
  description: string
  businessName: string
  provider?: AIProvider
}): Promise<SetupDraftResult> {
  const description = cleanLine(input.description, MAX_SUMMARY * 2)

  const fallback = draftFromDescription({
    description,
    businessName: input.businessName,
  })

  if (!description || !process.env.GEMINI_API_KEY) {
    return fallback
  }

  let text = ''
  try {
    const provider = input.provider ?? geminiProvider
    const result = await provider.call({
      system: SETUP_SYSTEM_PROMPT,
      messages: [
        {
          role: 'user',
          content: 'اسم النشاط: ' + input.businessName + '\nوصف النشاط:\n' + description,
        },
      ],
      tools: [],
    })
    text = result.content
      .filter((block: ModelBlock): block is { type: 'text'; text: string } => block.type === 'text')
      .map((block) => block.text)
      .join('\n')
  } catch (error) {
    console.error('AI setup draft failed; falling back to the customer description', error)
    return fallback
  }

  const parsed = firstJsonObject(text)
  if (!parsed) return fallback

  const { draft, droppedServices } = parseAgentSetupDraft(parsed, input.businessName + ' AI')
  if (!draft.summary) return fallback

  return { draft, source: 'ai', droppedServices }
}
