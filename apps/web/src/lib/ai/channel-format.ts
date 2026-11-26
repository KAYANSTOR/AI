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
قاعدة تنسيق قناة واتساب:
- اكتب الرد بلهجة عربية طبيعية ومباشرة، وتجنب المقدمات المكررة أو الإطالة غير المفيدة.
- أكمل الجمل والمعلومات دائماً ولا تقطع الإجابة أو الجدول أو القائمة في المنتصف.
- عند عرض تفاصيل أو قوائم أو أسعار أو جداول، اذكرها كاملة بوضوح في أسطر مرتبة.`

/** Output budget for fast text channels; high enough for complete Arabic answers & structured lists. */
export const WHATSAPP_MAX_OUTPUT_TOKENS = 2048
export const DEFAULT_MAX_OUTPUT_TOKENS = 4096

export function maxOutputTokensForChannel(channel: string | null | undefined): number {
  if (!isFastTextChannel(channel)) return DEFAULT_MAX_OUTPUT_TOKENS
  const override = Number(process.env.WHATSAPP_MAX_OUTPUT_TOKENS)
  return Number.isFinite(override) && override >= 256 && override <= 4096
    ? Math.floor(override)
    : WHATSAPP_MAX_OUTPUT_TOKENS
}

/** Appends the WhatsApp style rule at the end of the system prompt (idempotent). */
export function applyChannelFormatRules(systemPrompt: string, channel: string | null | undefined): string {
  if (!isFastTextChannel(channel)) return systemPrompt
  if (systemPrompt.includes(WHATSAPP_BREVITY_MARKER)) return systemPrompt
  return `${systemPrompt.trimEnd()}\n\n${WHATSAPP_BREVITY_RULE}`
}

const DETAIL_REQUEST = /قائم[ةه]|منتجات|المنتجات|الأسعار|الاسعار|أسعار|اسعار|المنيو|منيو|تفاصيل|بالتفصيل|كل\s+(الخدمات|المنتجات|العروض)|الخدمات|العروض|\b(list|menu|catalog|details|prices)\b/i

export function customerAskedForDetails(userText: string | null | undefined): boolean {
  return DETAIL_REQUEST.test(String(userText ?? ''))
}

/**
 * Normalizes WhatsApp formatting without truncating sentences or dropping multi-line content,
 * lists, or tables; oversized messages are delivered intact as sequential chunks downstream.
 */
export function enforceWhatsAppBrevity(reply: string, _userText?: string | null): string {
  return reply
    .replace(/\*\*([^*\n]+?)\*\*/g, '*$1*')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/\r\n?/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}
