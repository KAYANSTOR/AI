import type { DbClient } from '@/lib/db/client'

/**
 * EXT-001…EXT-004 — strict personal external-contact boundary.
 *
 * An external contact (friend / third party) on a personal_assistant workspace is a
 * receptionist: receive a message for the owner and coordinate contact with the owner.
 * Nothing else. This module is the *server-side* enforcement point: routing and scope
 * decisions are made here, before any pending action, tool, quota or model call. The
 * prompt only receives the resulting flags; wording alone never enforces the boundary.
 *
 * Everything in here is deterministic and synthetic-data friendly so the regression
 * tests can assert exact behaviour without a provider call.
 */

/** Fixed refusal, used verbatim so it cannot drift with model wording. */
export const EXTERNAL_CONTACT_REFUSAL =
  'عذرًا، أنا مخصص لاستقبال الرسائل وتنسيق التواصل مع صاحب الحساب فقط. لا أقدم خدمات عامة.'

/** Acknowledges receipt of a message for the owner — never claims delivery. */
export const EXTERNAL_CONTACT_RELAY_ACK =
  'تم استلام رسالتك وسأوصلها إلى صاحب الحساب.'

/** Mixed turn: only the communication portion is handled (EXT-001). */
export const EXTERNAL_CONTACT_MIXED_REPLY =
  'سأوصل الجزء المتعلق بالتواصل إلى صاحب الحساب. أما الطلبات الأخرى فهي خارج نطاق عملي.'

/** Short greeting used when a greeting is actually due (EXT-002). */
export const EXTERNAL_CONTACT_GREETING = 'أهلًا بك 👋'

/** Greet again only after this much silence; conversation start always greets. */
export const DEFAULT_GREETING_INACTIVITY_HOURS = 12

export type ExternalContactIntent =
  | 'greeting'
  | 'coordination'
  | 'mixed'
  | 'out_of_scope'
  | 'conversation'

export type ExternalContactDecision = {
  intent: ExternalContactIntent
  action: 'model' | 'refuse' | 'relay_ack'
  /** Deterministic reply; null means the model drafts a coordination reply. */
  reply: string | null
  shouldGreet: boolean
  reason: string
}

export type ExternalContactHistoryMessage = {
  id?: string | null
  direction: string
  content: string
  createdAt?: string | null
}

/** Lower-case, diacritic-free, Arabic-letter-unified text used for every match. */
export function normalizeExternalContactText(value: string): string {
  return String(value ?? '')
    .toLowerCase()
    .replace(/[\u064B-\u0652\u0670\u0640]/g, '')
    .replace(/[أإآٱ]/g, 'ا')
    .replace(/ى/g, 'ي')
    .replace(/ؤ/g, 'و')
    .replace(/ئ/g, 'ي')
    .replace(/ة/g, 'ه')
    .replace(/[^\p{L}\p{N}\s]+/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

type MarkerGroup = 'programming' | 'recipes' | 'homework' | 'general_advice' | 'writing'

const OUT_OF_SCOPE_MARKERS: Record<MarkerGroup, string[]> = {
  // Explicit coding tasks only. Product mentions ("التطبيق" / "الموقع" / "البرنامج")
  // are deliberately NOT here: a friend reporting "the app won't open" is sending
  // the owner a coordination message, not asking for programming help.
  programming: [
    'كود', 'برمجه', 'مبرمج', 'بايثون', 'جافا', 'جافاسكريبت', 'رياكت', 'تايبسكريبت',
    'سكربت', 'داله', 'خوارزميه', 'خطا برمجي', 'تطبيق ويب',
    'python', 'javascript', 'typescript', 'react', 'node js', 'html', 'css', 'sql',
    // 'bug' alone is usually a product complaint ("there is a bug in the app"), so it
    // lives in the product-support markers; coding requests still match code/script/etc.
    'api', 'function', 'debug', 'code', 'script', 'algorithm', 'compile',
  ],
  recipes: [
    'وصفه', 'وصفات', 'طبخ', 'اطبخ', 'مكونات', 'كيك', 'عجينه', 'حلوى', 'مقادير',
    'recipe', 'recipes', 'cook', 'cooking', 'bake', 'baking', 'cake', 'ingredients',
  ],
  homework: [
    'واجب', 'واجبات', 'homework', 'رياضيات', 'معادله', 'مساله رياضيه', 'math',
    'equation', 'essay', 'تلخيص كتاب', 'بحث مدرسي', 'امتحان', 'quiz',
  ],
  general_advice: [
    'نصيحه', 'نصائح', 'تشخيص', 'اعراض', 'دواء', 'علاج', 'طبيب', 'صحتي', 'حبوب',
    'ريجيم', 'diagnose', 'symptom', 'medicine', 'medical advice', 'therapy',
  ],
  writing: [
    'ترجم', 'ترجمه', 'صياغه', 'مقاله', 'خطاب', 'قصيده', 'سيره ذاتيه', 'اكتب لي',
    'اكتبي لي', 'translate', 'translation', 'poem', 'cover letter', 'resume',
  ],
}

/**
 * The owner's own product surface. Mentioning it never turns a message into a
 * general request on its own; only an explicit coding/writing marker does.
 */
const PRODUCT_MARKERS = [
  'تطبيق', 'برنامج', 'موقع', 'منصه', 'خدمه', 'اشتراك',
  'app', 'application', 'website', 'site', 'platform', 'service', 'subscription',
]

/**
 * Support/problem talk about the product. Combined with a product mention this is a
 * message for the owner ("الموقع ما يفتح"، "مشكلة في التطبيق"، "رابط التطبيق") and it
 * must be relayed, not refused as a general request.
 */
const PRODUCT_SUPPORT_MARKERS = [
  'مشكله', 'مشاكل', 'عطل', 'توقف', 'بطيء', 'بطيئه', 'ما يفتح', 'لا يفتح', 'ما يشتغل',
  'لا يشتغل', 'ما يعمل', 'لا يعمل', 'خطا', 'اخطا', 'يطلع لي', 'تحديث', 'نسخه',
  'تسجيل الدخول', 'تسجيل', 'حساب جديد', 'فاتوره', 'دفع', 'رابط', 'تحميل', 'تثبيت',
  'تفعيل', 'رمز التحقق', 'مقفل', 'مقفول', 'موقوف', 'otp', 'activate', 'activated',
  'problem', 'issue', 'error', 'not working', 'does not work', "doesn't work",
  'is down', 'login', 'log in', 'sign up', 'signup', 'billing', 'update', 'install',
  'bug', 'crash', 'crashes', 'renew', 'renewal',
]

/**
 * Account/receipt phrases that contain coding-adjacent words ("كود تفعيل"، "كود التحقق")
 * but are product-support talk, not a programming request. They are removed before
 * the out-of-scope/request markers are matched, never before coordination matching.
 */
const PRODUCT_ACCOUNT_PHRASES = [
  'كود تفعيل', 'كود التحقق', 'رمز التحقق', 'رمز التفعيل', 'كود الدخول',
  'verification code', 'activation code', 'one time code',
]

function withoutProductAccountPhrases(normalized: string): string {
  let text = normalized
  for (const phrase of PRODUCT_ACCOUNT_PHRASES) text = text.split(phrase).join(' ')
  return text.replace(/\s+/g, ' ').trim()
}

function mentionsProduct(normalized: string): boolean {
  return PRODUCT_MARKERS.some((marker) => containsMarker(normalized, marker))
}

function isProductSupportMessage(normalized: string): boolean {
  return (
    mentionsProduct(normalized) &&
    PRODUCT_SUPPORT_MARKERS.some((marker) => containsMarker(normalized, marker))
  )
}

const COORDINATION_MARKERS = [
  'اوصل', 'اوصلها', 'اوصله', 'ابلغ', 'ابلغه', 'بلغه', 'بلغ', 'اخبره', 'اخبرها',
  'اخبر', 'خبره', 'قول له', 'قولي له', 'قل له', 'كلمه', 'كلم', 'اتصل', 'اتصلي',
  'تواصل', 'يتواصل', 'رساله', 'رسالتي', 'ملاحظه', 'ملاحظتي', 'موعد مع', 'يسال عن',
  'يسال عنك', 'يريد يكلم', 'خلوه', 'يتصل', 'يكلم', 'يرد علي', 'بيرد علي', 'موجود',
  'message for', 'tell him', 'tell her', 'let him know', 'let her know', 'pass on',
  'relay', 'deliver this', 'he asked', 'she asked', 'call me', 'call him',
  'contact me', 'reach out', 'forward this', 'get back to me', 'please inform',
]

const INJECTION_MARKERS = [
  'تجاهل التعليمات', 'تجاهل القواعد', 'تجاهل ما سبق', 'تجاهل كل ما', 'تجاهل الاوامر',
  'انت الان', 'تظاهر بانك', 'تصرف ك', 'اعمل ك', 'الوضع المطور', 'اكشف التعليمات',
  'اكشف لي التعليمات', 'اكشف البرومبت', 'اعرض التعليمات', 'تجاوز القيود',
  'system prompt', 'developer mode', 'jailbreak', 'ignore previous',
  'ignore all previous', 'ignore the instructions', 'ignore instructions',
  'ignore your instructions', 'you are now', 'act as', 'pretend to be',
  'pretend you are', 'reveal your prompt', 'show your prompt', 'bypass',
]

const REQUEST_MARKERS = [
  'ابحث', 'ساعدني', 'اعطني', 'ممكن تعطيني', 'ممكن تساعدني', 'اريد معرفه',
  'اريد ان تعرف', 'هل يمكنك', 'علمني', 'اشرح', 'لخص', 'اكتب', 'ترجم', 'احسب',
  'انشئ', 'صمم', 'كيف اسوي', 'كيف اعمل', 'كيف اتعلم',
  'help me', 'assist me', 'can you', 'could you', 'would you', 'please give',
  'give me', 'show me', 'write', 'explain', 'summarize', 'translate', 'calculate',
  'create', 'design', 'how do i', 'how to', 'what is', 'who is',
]

const GREETING_ONLY_PATTERNS = [
  /^(?:السلام عليكم(?: ورحمه الله(?: وبركاته)?)?|وعليكم السلام(?: ورحمه الله(?: وبركاته)?)?)$/,
  /^(?:مرحبا|اهلا|هلا|هاي|حياك الله|حياه الله)(?: وسهلا)?$/,
  /^(?:صباح|مساء) (?:الخير|النور)$/,
  /^(?:hello|hi|hey|good morning|good evening|good afternoon)$/,
  /^(?:مرحبا|اهلا|هلا|السلام عليكم) (?:كيف حالك|كيف الحال|كيفك|اخبارك|عساك بخير)$/,
  /^(?:hello|hi|hey) (?:how are you|how is it going)$/,
]

const LEADING_GREETING_PATTERNS: RegExp[] = [
  /^السلام\s*عليكم(?:\s*ورحمة\s*الله(?:\s*وبركاته)?)?/i,
  /^وعليكم\s*السلام(?:\s*ورحمة\s*الله(?:\s*وبركاته)?)?/i,
  /^(?:أهلا|أهلًا|اهلا|مرحبا|مرحبًا|مرحباً|هلا|حيّاك\s*الله|حياك\s*الله)(?:\s*(?:وسهلا|وسهلًا))?/i,
  /^(?:صباح|مساء)\s*(?:الخير|النور)/i,
  /^good\s+(?:morning|evening|afternoon)/i,
  /^(?:hello|hi|hey|هاي)(?![a-z])/i,
]

const GREETING_FILLER_WORDS = new Set([
  'بك', 'بكم', 'جميعا', 'يا', 'كيف', 'حالك', 'الحال', 'كيفك', 'اخبارك',
  'عساك', 'بخير', 'طيب', 'الخير', 'النور', 'وسهلا',
])

const ALNUM_LATIN = /^[a-z0-9 ]+$/

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

/** Whole-token match for Latin markers, substring match for Arabic markers. */
function containsMarker(normalized: string, marker: string): boolean {
  if (ALNUM_LATIN.test(marker)) {
    return new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(marker)}(?:[^a-z0-9]|$)`, 'i').test(normalized)
  }
  return normalized.includes(marker)
}

function matchedGroups(normalized: string, groups: Record<string, string[]>): string[] {
  const hits: string[] = []
  for (const [group, markers] of Object.entries(groups)) {
    if (markers.some((marker) => containsMarker(normalized, marker))) hits.push(group)
  }
  return hits
}

function isGreetingOnly(normalized: string): boolean {
  return GREETING_ONLY_PATTERNS.some((pattern) => pattern.test(normalized))
}

/**
 * Deterministic intent classification.
 * Unknown *requests* fail closed; plain conversation that is not a request is left
 * to the model so genuine messages for the owner still get a natural reply.
 */
export function classifyExternalContactIntent(text: string): {
  intent: ExternalContactIntent
  reason: string
} {
  const normalized = normalizeExternalContactText(text)

  if (!normalized) return { intent: 'conversation', reason: 'empty_message' }

  if (INJECTION_MARKERS.some((marker) => containsMarker(normalized, marker))) {
    return { intent: 'out_of_scope', reason: 'prompt_injection' }
  }

  const scopeText = mentionsProduct(normalized)
    ? withoutProductAccountPhrases(normalized)
    : normalized
  const outOfScope = matchedGroups(scopeText, OUT_OF_SCOPE_MARKERS)
  const coordinated =
    COORDINATION_MARKERS.some((marker) => containsMarker(normalized, marker)) ||
    isProductSupportMessage(normalized)

  if (outOfScope.length > 0) {
    return coordinated
      ? { intent: 'mixed', reason: `mixed:${outOfScope.join('+')}+coordination` }
      : { intent: 'out_of_scope', reason: `out_of_scope:${outOfScope.join('+')}` }
  }

  if (coordinated) return { intent: 'coordination', reason: 'coordination' }

  if (isGreetingOnly(normalized)) return { intent: 'greeting', reason: 'greeting' }

  if (REQUEST_MARKERS.some((marker) => containsMarker(scopeText, marker))) {
    // Fail closed: an unrecognised request is never forwarded to the model.
    return { intent: 'out_of_scope', reason: 'unclassified_request' }
  }

  return { intent: 'conversation', reason: 'conversation' }
}

function toMs(value: Date | string | null | undefined): number {
  if (value instanceof Date) return value.getTime()
  if (!value) return Number.NaN
  return new Date(value).getTime()
}

/**
 * EXT-002 — greeting is due only at conversation start or after a defined silence
 * interval, using persisted history/timestamps (never model guesswork).
 */
export function externalGreetingDue(
  history: ExternalContactHistoryMessage[],
  now: Date | string = new Date(),
  inactivityHours: number = DEFAULT_GREETING_INACTIVITY_HOURS
): boolean {
  const messages = history.filter(
    (message) =>
      (message.direction === 'inbound' || message.direction === 'outbound') &&
      String(message.content ?? '').trim().length > 0
  )
  if (messages.length === 0) return true
  if (!messages.some((message) => message.direction === 'outbound')) return true

  const timestamps = messages
    .map((message) => toMs(message.createdAt))
    .filter((value) => Number.isFinite(value))
  // History exists but is undated: treat the conversation as ongoing, not new.
  if (timestamps.length === 0) return false

  const nowMs = toMs(now)
  if (!Number.isFinite(nowMs)) return false
  const gapHours = (nowMs - Math.max(...timestamps)) / 3_600_000
  return gapHours >= inactivityHours
}

/** Removes a leading greeting (and filler words) from a reply, for EXT-002. */
export function stripLeadingGreeting(reply: string): string {
  const trimmed = String(reply ?? '').trim()
  if (!trimmed) return trimmed

  let rest = trimmed
  let matched = false
  for (const pattern of LEADING_GREETING_PATTERNS) {
    const found = pattern.exec(rest)
    if (found) {
      rest = rest.slice(found[0].length)
      matched = true
      break
    }
  }
  if (!matched) return trimmed

  const words = rest.split(/\s+/).filter(Boolean)
  let index = 0
  while (index < words.length) {
    const cleaned = normalizeExternalContactText(words[index])
    if (!cleaned || GREETING_FILLER_WORDS.has(cleaned)) {
      index += 1
      continue
    }
    break
  }

  return words
    .slice(index)
    .join(' ')
    .replace(/^[\s،,.!?؟…:؛\-]+/, '')
    .trim()
}

export function hasLeadingGreeting(reply: string): boolean {
  const trimmed = String(reply ?? '').trim()
  return Boolean(trimmed) && stripLeadingGreeting(trimmed) !== trimmed
}

/** Enforces EXT-002 on the final text: greet once when due, never otherwise. */
export function applyExternalContactGreeting(reply: string, shouldGreet: boolean): string {
  const trimmed = String(reply ?? '').trim()
  if (!trimmed) return shouldGreet ? EXTERNAL_CONTACT_GREETING : EXTERNAL_CONTACT_RELAY_ACK
  if (shouldGreet) {
    return hasLeadingGreeting(trimmed) ? trimmed : `${EXTERNAL_CONTACT_GREETING} ${trimmed}`
  }
  const stripped = stripLeadingGreeting(trimmed)
  return stripped || EXTERNAL_CONTACT_RELAY_ACK
}

export type ExternalContactTurnInput = {
  text: string
  history?: ExternalContactHistoryMessage[]
  now?: Date | string
  inactivityHours?: number
  /** The inbound row persisted for this turn; it is not part of prior history. */
  currentMessageId?: string | null
}

function resolveInactivityHours(): number {
  const configured = Number(process.env.EXTERNAL_CONTACT_GREETING_INACTIVITY_HOURS)
  return Number.isFinite(configured) && configured > 0 ? configured : DEFAULT_GREETING_INACTIVITY_HOURS
}

/** The single decision point used by the inbound runtime. */
export function planExternalContactTurn(input: ExternalContactTurnInput): ExternalContactDecision {
  const classification = classifyExternalContactIntent(input.text)
  const history = (input.history ?? []).filter(
    (message) => !input.currentMessageId || String(message.id ?? '') !== String(input.currentMessageId)
  )
  const shouldGreet = externalGreetingDue(
    history,
    input.now ?? new Date(),
    input.inactivityHours ?? resolveInactivityHours()
  )

  if (classification.intent === 'out_of_scope') {
    return {
      intent: classification.intent,
      action: 'refuse',
      reply: applyExternalContactGreeting(EXTERNAL_CONTACT_REFUSAL, shouldGreet),
      shouldGreet,
      reason: classification.reason,
    }
  }

  if (classification.intent === 'mixed') {
    return {
      intent: classification.intent,
      action: 'relay_ack',
      reply: applyExternalContactGreeting(EXTERNAL_CONTACT_MIXED_REPLY, shouldGreet),
      shouldGreet,
      reason: classification.reason,
    }
  }

  return {
    intent: classification.intent,
    action: 'model',
    reply: null,
    shouldGreet,
    reason: classification.reason,
  }
}

/** Scoped persisted history for one conversation of this tenant only. */
export async function loadExternalContactHistory(
  db: DbClient,
  input: { organizationId: string; conversationId: string; limit?: number }
): Promise<ExternalContactHistoryMessage[]> {
  const { data, error } = await db
    .from('messages')
    .select('id,direction,content,created_at')
    .eq('organization_id', input.organizationId)
    .eq('conversation_id', input.conversationId)
    .order('created_at', { ascending: false })
    .limit(input.limit ?? 30)
  if (error) {
    // Greeting cadence is the only consumer: a failed lookup must not abort the
    // turn, but it is logged rather than swallowed.
    console.warn('external_contact_history_lookup_failed', {
      organizationId: input.organizationId,
      conversationId: input.conversationId,
      reason: error.message ?? 'lookup_failed',
    })
    return []
  }
  return ((data ?? []) as Array<Record<string, unknown>>).map((row) => ({
    id: row.id ? String(row.id) : null,
    direction: String(row.direction ?? ''),
    content: String(row.content ?? ''),
    createdAt: row.created_at ? String(row.created_at) : null,
  }))
}
