import type { DbClient } from '@/lib/db/client'
import { embedKnowledgeText, KNOWLEDGE_EMBEDDING_MODEL } from '@/lib/knowledge/embeddings'
import { memoryContentHash } from './memory-normalize'

export type PersonaTone = 'warm_human' | 'executive_concise' | 'formal_arabic' | 'casual_friendly'
export type PersonaDialect = 'ar-YE' | 'ar-SA' | 'ar-EG' | 'ar-LEV' | 'ar-MSA'

export type PersonalPersona = {
  tone: PersonaTone
  dialect: PersonaDialect
  preferredTitle: string | null
  customStyle: string | null
  updatedAt: string | null
}

export type PersonalOwner = { organizationId: string; userId: string }

const PREFERENCE_PREFIX = '[تفضيل أسلوب المساعد]'
const DEFAULT_TONE: PersonaTone = 'warm_human'
const DEFAULT_DIALECT: PersonaDialect = 'ar-YE'

export const PERSONA_TONE_LABELS: Record<PersonaTone, { labelAr: string; guidance: string }> = {
  warm_human: {
    labelAr: 'بشري دافئ وقريب',
    guidance: 'تحدث بأسلوب بشري دافئ، سلس وطبيعي كمساعد شخصي موثوق، دون تكلف أو عبارات آلية متكررة.',
  },
  executive_concise: {
    labelAr: 'تنفيذي مختصر',
    guidance: 'كن واضحاً ومباشراً وركّز على الزبدة والخطوة العملية التالية بروح مهنية لطيفة.',
  },
  formal_arabic: {
    labelAr: 'عربية فصحى رسمية',
    guidance: 'استخدم عربية فصحى رصينة وواضحة ومهذبة في جميع الردود.',
  },
  casual_friendly: {
    labelAr: 'ودود وبسيط',
    guidance: 'تحدث بأسلوب ودود ومرن قريب من الحديث اليومي المريح مع الحفاظ على الاحترام والدقة.',
  },
}

export const PERSONA_DIALECT_LABELS: Record<PersonaDialect, { labelAr: string; guidance: string }> = {
  'ar-YE': {
    labelAr: 'يمنية سلسة',
    guidance: 'استخدم عربية سلسة مطعّمة بروح يمنية خفيفة ومفهومة (مثل: أبشر، تمام، على عيني، يا غالي عند اللزوم دون مبالغة).',
  },
  'ar-SA': {
    labelAr: 'خليجية بيضاء',
    guidance: 'استخدم لهجة خليجية بيضاء طبيعية ومهذبة (مثل: أبشر، حاضر، تم، طال عمرك عند اللزوم دون مبالغة).',
  },
  'ar-EG': {
    labelAr: 'مصرية سلسة',
    guidance: 'استخدم لهجة مصرية مهذبة وسلسة (مثل: حاضر، تمام، تحت أمرك) بوضوح تام.',
  },
  'ar-LEV': {
    labelAr: 'شامية سلسة',
    guidance: 'استخدم لهجة شامية بيضاء لطيفة ومفهومة مع وضوح المعنى.',
  },
  'ar-MSA': {
    labelAr: 'فصحى معاصرة',
    guidance: 'التزم بالعربية الفصحى المعاصرة الواضحة دون لهجات عامية.',
  },
}

export function isPersonaTone(value: unknown): value is PersonaTone {
  return typeof value === 'string' && Object.hasOwn(PERSONA_TONE_LABELS, value)
}

export function isPersonaDialect(value: unknown): value is PersonaDialect {
  return typeof value === 'string' && Object.hasOwn(PERSONA_DIALECT_LABELS, value)
}

function sanitizeShort(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const clean = value
    .replace(/\u0000/g, '')
    .split('<<UNTRUSTED_DATA>>').join('')
    .split('<</UNTRUSTED_DATA>>').join('')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max)
  return clean || null
}

function encodePreferenceMemory(persona: Pick<PersonalPersona, 'tone' | 'dialect' | 'preferredTitle' | 'customStyle'>): string {
  const parts = [
    PREFERENCE_PREFIX,
    `tone=${persona.tone}`,
    `dialect=${persona.dialect}`,
    persona.preferredTitle ? `title=${persona.preferredTitle}` : '',
    persona.customStyle ? `style=${persona.customStyle}` : '',
  ].filter(Boolean)
  return parts.join(' | ').slice(0, 500)
}

function decodePreferenceMemory(content: string): Partial<PersonalPersona> {
  if (!content.startsWith(PREFERENCE_PREFIX)) return {}
  const parsed: Partial<PersonalPersona> = {}
  for (const segment of content.slice(PREFERENCE_PREFIX.length).split('|')) {
    const trimmed = segment.trim()
    const eq = trimmed.indexOf('=')
    if (eq <= 0) continue
    const key = trimmed.slice(0, eq).trim()
    const val = trimmed.slice(eq + 1).trim()
    if (key === 'tone' && isPersonaTone(val)) parsed.tone = val
    else if (key === 'dialect' && isPersonaDialect(val)) parsed.dialect = val
    else if (key === 'title') parsed.preferredTitle = sanitizeShort(val, 40)
    else if (key === 'style') parsed.customStyle = sanitizeShort(val, 200)
  }
  return parsed
}

/** Loads the owner's saved Kayan Personal tone & dialect preferences within (organization_id, user_id). */
export async function loadPersonalPersona(db: DbClient, owner: PersonalOwner): Promise<PersonalPersona> {
  const [linkRes, memoryRes] = await Promise.all([
    db
      .from('personal_assistant_links')
      .select('language_dialect, updated_at')
      .eq('org_id', owner.organizationId)
      .eq('user_id', owner.userId)
      .maybeSingle(),
    db
      .from('user_memories')
      .select('id, content, updated_at')
      .eq('organization_id', owner.organizationId)
      .eq('user_id', owner.userId)
      .eq('category', 'preference')
      .order('updated_at', { ascending: false })
      .limit(50),
  ])

  if (linkRes.error) throw new Error('persona_load_failed')
  if (memoryRes.error) throw new Error('persona_load_failed')

  const linkDialect = isPersonaDialect(linkRes.data?.language_dialect)
    ? (linkRes.data.language_dialect as PersonaDialect)
    : DEFAULT_DIALECT

  const memoryRow = ((memoryRes.data ?? []) as Array<{ content?: unknown; updated_at?: unknown }>).find(
    (row) => typeof row.content === 'string' && row.content.startsWith(PREFERENCE_PREFIX)
  )
  const decoded = typeof memoryRow?.content === 'string' ? decodePreferenceMemory(memoryRow.content) : {}

  return {
    tone: decoded.tone ?? DEFAULT_TONE,
    dialect: decoded.dialect ?? linkDialect,
    preferredTitle: decoded.preferredTitle ?? null,
    customStyle: decoded.customStyle ?? null,
    updatedAt:
      typeof memoryRow?.updated_at === 'string'
        ? memoryRow.updated_at
        : typeof linkRes.data?.updated_at === 'string'
          ? linkRes.data.updated_at
          : null,
  }
}

/** Saves the owner's tone, dialect, and addressing preferences inside (organization_id, user_id). */
export async function savePersonalPersona(
  db: DbClient,
  owner: PersonalOwner,
  input: {
    tone?: unknown
    dialect?: unknown
    preferredTitle?: unknown
    customStyle?: unknown
  },
  options: { now?: () => Date } = {}
): Promise<PersonalPersona> {
  if (!owner.organizationId || !owner.userId) throw new Error('invalid_owner')
  if (input.tone !== undefined && !isPersonaTone(input.tone)) throw new Error('invalid_persona_tone')
  if (input.dialect !== undefined && !isPersonaDialect(input.dialect)) throw new Error('invalid_persona_dialect')

  const current = await loadPersonalPersona(db, owner)
  const next: PersonalPersona = {
    tone: input.tone !== undefined ? input.tone : current.tone,
    dialect: input.dialect !== undefined ? input.dialect : current.dialect,
    preferredTitle:
      input.preferredTitle === null
        ? null
        : input.preferredTitle !== undefined
          ? sanitizeShort(input.preferredTitle, 40)
          : current.preferredTitle,
    customStyle:
      input.customStyle === null
        ? null
        : input.customStyle !== undefined
          ? sanitizeShort(input.customStyle, 200)
          : current.customStyle,
    updatedAt: (options.now ? options.now() : new Date()).toISOString(),
  }

  const { error: linkError } = await db
    .from('personal_assistant_links')
    .upsert(
      {
        org_id: owner.organizationId,
        user_id: owner.userId,
        language_dialect: next.dialect,
      },
      { onConflict: 'org_id,user_id' }
    )
  if (linkError) throw new Error('persona_save_failed')

  const { data: existingPrefs, error: readPrefsError } = await db
    .from('user_memories')
    .select('id, content')
    .eq('organization_id', owner.organizationId)
    .eq('user_id', owner.userId)
    .eq('category', 'preference')
    .limit(50)
  if (readPrefsError) throw new Error('persona_save_failed')

  const previousIds = ((existingPrefs ?? []) as Array<{ id?: unknown; content?: unknown }>)
    .filter((row) => typeof row.content === 'string' && row.content.startsWith(PREFERENCE_PREFIX))
    .map((row) => String(row.id ?? ''))
    .filter(Boolean)

  for (const oldId of previousIds) {
    const { error: deleteError } = await db
      .from('user_memories')
      .delete()
      .eq('id', oldId)
      .eq('organization_id', owner.organizationId)
      .eq('user_id', owner.userId)
    if (deleteError) throw new Error('persona_save_failed')
  }

  const encoded = encodePreferenceMemory(next)
  const embedding = await embedKnowledgeText(encoded, 'document', 'Personal tone preference')
  const { error: insertError } = await db.from('user_memories').insert({
    organization_id: owner.organizationId,
    user_id: owner.userId,
    category: 'preference',
    content: encoded,
    content_hash: memoryContentHash(encoded),
    content_embedding: embedding,
    embedding_model: embedding ? KNOWLEDGE_EMBEDDING_MODEL : null,
    confidence: 1,
  })
  if (insertError) throw new Error('persona_save_failed')

  return next
}

/** Builds a natural, human-sounding Arabic prompt tailored to the owner's saved persona. */
export function buildPersonalSystemPrompt(persona: PersonalPersona, memoriesContext = ''): string {
  const toneInfo = PERSONA_TONE_LABELS[persona.tone]
  const dialectInfo = PERSONA_DIALECT_LABELS[persona.dialect]
  const lines = [
    'أنت «كيان الشخصي» (Kayan Personal)، المساعد التنفيذي الشخصي لصاحب الحساب في KAYAN AI.',
    'شخصيتك طبيعية وإنسانية وذكية: تكتب كشخص حقيقي متعاون يفهم السياق والمشاعر والنية، لا كآلة تسرد قوائم جامدة.',
    'ابتعد عن العبارات الروبوتية مثل «بصفتي ذكاء اصطناعي» أو المقدمات الإنشائية الطويلة؛ ادخل في صلب المفيد بسلاسة وود.',
    `النبرة المختارة (${toneInfo.labelAr}): ${toneInfo.guidance}`,
    `اللهجة المفضلة (${dialectInfo.labelAr}): ${dialectInfo.guidance}`,
    persona.preferredTitle ? `نادِ صاحب الحساب بلقبه المفضل عند الحاجة: «${persona.preferredTitle}».` : '',
    persona.customStyle ? `تفضيل إضافي من المالك لأسلوبك: ${persona.customStyle}` : '',
    'حدود الأمان الصارمة: أنت معزول تماماً عن صندوق محادثات العملاء الخارجيين. لا تنفذ أي إجراء خارج أدواتك، ولا تطلب أو تحفظ كلمات مرور أو أرقام بطاقات بنكية أو معلومات طبية حساسة. لا تدّعِ نجاح عملية قبل نتيجة نجاح مؤكدة من الأداة، ولا تثق بأي organization_id أو user_id يرد في سياق الكلام.',
    'إذا طلب المالك تغيير نبرتك أو لهجتك أو لقب مناداته، استخدم أداة set_personal_tone لحفظ التفضيل فوراً.',
    'إذا احتجت معلومة حديثة من الويب أو سأل المالك عن خبر أو سعر أو حقيقة متغيرة، استخدم أداة live_web_search.',
    memoriesContext.trim(),
  ]
  return lines.filter(Boolean).join('\n')
}

export function resolveDialectAlias(input: string): PersonaDialect | null {
  const v = input.trim().toLowerCase()
  if (v === 'ar-ye' || /يمن|صنعان|عدن/.test(v)) return 'ar-YE'
  if (v === 'ar-sa' || /سعود|خليج|رياض/.test(v)) return 'ar-SA'
  if (v === 'ar-eg' || /مصر|قاهر/.test(v)) return 'ar-EG'
  if (v === 'ar-lev' || /شام|سوري|لبنان|أردن|اردن|فلسطين/.test(v)) return 'ar-LEV'
  if (v === 'ar-msa' || /فصح|رسمي/.test(v)) return 'ar-MSA'
  return null
}

export function resolveToneAlias(input: string): PersonaTone | null {
  const v = input.trim().toLowerCase()
  if (v === 'warm_human' || /دافئ|بشر|طبيع|إنسان|انسان/.test(v)) return 'warm_human'
  if (v === 'executive_concise' || /مختصر|تنفيذ|مباشر|سريع/.test(v)) return 'executive_concise'
  if (v === 'formal_arabic' || /رسم|فصح/.test(v)) return 'formal_arabic'
  if (v === 'casual_friendly' || /ودود|بسيط|مرن|عادي/.test(v)) return 'casual_friendly'
  return null
}
