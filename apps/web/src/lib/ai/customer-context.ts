import { localNowContext } from '@/lib/calendar/relative-time'

export const CUSTOMER_CONTEXT_MARKER = '[CUSTOMER_CONTEXT]'

/**
 * Trusted, server-built context appended to the system prompt: who the customer is
 * (from the channel identity) and the current local date/time of the business, so
 * relative Arabic times map to correct ISO-8601 values in booking tools.
 */
export function buildCustomerContextBlock(input: {
  contact: { id: string; name: string | null; phone: string | null } | null
  timezone: string | null | undefined
  now?: Date
}): string {
  const clock = localNowContext(input.timezone, input.now ?? new Date())
  const lines = [
    CUSTOMER_CONTEXT_MARKER,
    'بيانات موثوقة من النظام (لا تعرضها حرفياً للعميل):',
    `- الوقت الحالي للنشاط: ${clock.weekdayAr} ${clock.today} الساعة ${clock.time} (${clock.timezone}، UTC${clock.offset}). غداً = ${clock.tomorrow}.`,
    `- حوّل أي وقت نسبي يذكره العميل («اليوم»، «غداً»، «بعد غد»، «3 عصراً») إلى ISO-8601 بتوقيت ${clock.timezone} مثل ${clock.tomorrow}T15:00:00${clock.offset} قبل استدعاء أدوات الحجز.`,
  ]
  if (input.contact) {
    lines.push(`- معرّف جهة الاتصال: ${input.contact.id}`)
    lines.push(`- اسم العميل: ${input.contact.name?.trim() || 'غير معروف بعد'}`)
    if (input.contact.phone) {
      lines.push(`- رقم العميل المعروف من القناة: ${input.contact.phone}`)
      lines.push('- لا تطلب رقم الجوال من العميل؛ هو معروف مسبقاً. استخدمه تلقائياً في الحجز والطلبات، إلا إذا طلب العميل صراحةً استخدام رقم آخر.')
    } else {
      lines.push('- رقم العميل غير معروف؛ اطلبه مرة واحدة فقط عند الحاجة للحجز أو الطلب.')
    }
    if (!input.contact.name?.trim()) lines.push('- إذا ذكر العميل اسمه فاحفظه مع الحجز أو الطلب ولا تسأل عنه مرة أخرى.')
  }
  return lines.join('\n')
}
