/**
 * WhatsApp Brevity Guard.
 *
 * Stored agents keep the system prompt they were created with, so changing the default
 * template never reached them. This rule is appended by the runtime itself, at the very end
 * of the system instruction, for every fast text channel — old and new agents alike — and the
 * provider output budget is capped for the same channels.
 */

export const FAST_TEXT_CHANNELS = ['whatsapp', 'whatsapp_qr'] as const

export function isFastTextChannel(channel: string | null | undefined): boolean {
  return FAST_TEXT_CHANNELS.includes(String(channel ?? '').toLowerCase() as (typeof FAST_TEXT_CHANNELS)[number])
}

export const WHATSAPP_BREVITY_MARKER = '[WHATSAPP_BREVITY_GUARD]'

export const WHATSAPP_BREVITY_RULE = `${WHATSAPP_BREVITY_MARKER}
قاعدة تنسيق إلزامية لقناة واتساب (تتقدم على أي تعليمات سابقة عن الطول أو الأسلوب):
- اكتب الرد في سطر إلى 3 أسطر قصيرة فقط، بلهجة عربية طبيعية وودودة كأنك موظف يرد من جواله.
- ادخل في الجواب مباشرة: بلا مقدمات أو ترحيب مطوّل أو تكرار لسؤال العميل أو خاتمة إنشائية.
- لا تستخدم العناوين أو التنسيق العريض أو القوائم الطويلة، إلا إذا طلب العميل صراحةً قائمة منتجات أو أسعار أو تفاصيل.
- عند الحاجة لمعلومة إضافية اسأل سؤالاً واحداً قصيراً فقط.`

/** Output budget for fast text channels; generous enough for a short list when asked. */
export const WHATSAPP_MAX_OUTPUT_TOKENS = 350
export const DEFAULT_MAX_OUTPUT_TOKENS = 1024

export function maxOutputTokensForChannel(channel: string | null | undefined): number {
  if (!isFastTextChannel(channel)) return DEFAULT_MAX_OUTPUT_TOKENS
  const override = Number(process.env.WHATSAPP_MAX_OUTPUT_TOKENS)
  return Number.isFinite(override) && override >= 64 && override <= 1024
    ? Math.floor(override)
    : WHATSAPP_MAX_OUTPUT_TOKENS
}

/** Appends the brevity rule at the end of the system prompt (idempotent). */
export function applyChannelFormatRules(systemPrompt: string, channel: string | null | undefined): string {
  if (!isFastTextChannel(channel)) return systemPrompt
  if (systemPrompt.includes(WHATSAPP_BREVITY_MARKER)) return systemPrompt
  return `${systemPrompt.trimEnd()}\n\n${WHATSAPP_BREVITY_RULE}`
}

const DETAIL_REQUEST = /قائم[ةه]|منتجات|المنتجات|الأسعار|الاسعار|أسعار|اسعار|المنيو|منيو|تفاصيل|بالتفصيل|كل\s+(الخدمات|المنتجات|العروض)|الخدمات|العروض|\b(list|menu|catalog|details|prices)\b/i

export function customerAskedForDetails(userText: string | null | undefined): boolean {
  return DETAIL_REQUEST.test(String(userText ?? ''))
}

const MAX_BRIEF_LINES = 3
const MAX_BRIEF_CHARS = 420

/**
 * Last line of defence if a model ignores the instruction: strips markdown decoration and,
 * unless the customer asked for a list/details, keeps the reply to a few short lines,
 * cutting at a sentence boundary.
 */
export function enforceWhatsAppBrevity(reply: string, userText?: string | null): string {
  let text = reply
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  if (customerAskedForDetails(userText)) return text

  const lines = text.split('\n').map((line) => line.trim()).filter(Boolean)
  if (lines.length <= MAX_BRIEF_LINES && text.length <= MAX_BRIEF_CHARS) return lines.join('\n')

  text = lines.slice(0, MAX_BRIEF_LINES).join('\n')
  if (text.length > MAX_BRIEF_CHARS) {
    const slice = text.slice(0, MAX_BRIEF_CHARS)
    const cut = Math.max(slice.lastIndexOf('.'), slice.lastIndexOf('؟'), slice.lastIndexOf('!'), slice.lastIndexOf('?'), slice.lastIndexOf('\n'))
    text = (cut > MAX_BRIEF_CHARS * 0.4 ? slice.slice(0, cut + 1) : slice).trim()
  }
  return text
}
