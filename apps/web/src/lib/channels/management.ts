import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveChannelExact } from '@/lib/runtime/tenant'

export type ChannelType = 'whatsapp' | 'instagram' | 'sms' | 'phone'

export type ChannelSpec = {
  type: ChannelType
  label: string
  provider: string
  bindingColumn: 'provider_account_id' | 'external_identifier'
  bindingLabel: string
  bindingPlaceholder: string
  bindingHint: string
  publicNumberLabel: string | null
  setup: string[]
  testScope: string
}

export const CHANNEL_SPECS: readonly ChannelSpec[] = [
  {
    type: 'whatsapp',
    label: 'واتساب للأعمال',
    provider: 'Meta',
    bindingColumn: 'provider_account_id',
    bindingLabel: 'رقم واتساب',
    bindingPlaceholder: 'مثال +967777123456',
    bindingHint: 'الربط الفعلي عبر زر Meta فقط. حفظ الرقم وحده لا يستقبل رسائل.',
    publicNumberLabel: 'رقم واتساب المحفوظ',
    setup: [
      'اضغط «ربط واتساب عبر Meta» وأكمل النافذة.',
      'اختر أو أنشئ رقم واتساب للأعمال داخل Meta.',
      'بعد الإغلاق يعود النظام بحالة مربوط.',
    ],
    testScope: 'أن الرقم مربوط فعليًا عبر Meta وأن النظام يوجّه رسائله لشركتك.',
  },
  {
    type: 'instagram',
    label: 'إنستغرام',
    provider: 'Meta',
    bindingColumn: 'provider_account_id',
    bindingLabel: 'معرّف حساب إنستغرام (account ID)',
    bindingPlaceholder: 'مثال 17841400000000000',
    bindingHint: 'المعرّف الرقمي للحساب المهني من لوحة Meta. لا يُستخدم اسم المستخدم للربط.',
    publicNumberLabel: null,
    setup: [
      'حوّل الحساب إلى حساب أعمال واربطه بصفحة على Meta.',
      'اشترك في حقل messages لحساب إنستغرام.',
      'انسخ account ID والصقه هنا ثم اضغط ربط.',
    ],
    testScope: 'أن المعرّف محفوظ ونشط وأن النظام يوجّه رسائل هذا الحساب إلى شركتك.',
  },
  {
    type: 'sms',
    label: 'الرسائل النصية SMS',
    provider: 'Twilio',
    bindingColumn: 'external_identifier',
    bindingLabel: 'رقم Twilio المستخدم للإرسال',
    bindingPlaceholder: 'مثال +12025550123',
    bindingHint: 'الرقم السحابي الذي يستقبل رسائل العملاء. الربط يتم على الرقم المُستقبِل (To) بنظام E.164.',
    publicNumberLabel: null,
    setup: [
      'أنشئ رقمًا سحابيًا في Twilio.',
      'اضبط Webhook للرسائل على عنوان مشروعك: /api/sms/webhook',
      'أدخل الرقم بصيغة E.164 ثم اضغط ربط.',
    ],
    testScope: 'أن الرقم محفوظ ونشط وأن النظام يوجّه رسائل هذا الرقم إلى شركتك.',
  },
  {
    type: 'phone',
    label: 'الهاتف والمكالمات',
    provider: 'Vapi',
    bindingColumn: 'provider_account_id',
    bindingLabel: 'معرّف رقم Vapi (phone number ID)',
    bindingPlaceholder: 'مثال 3a1b2c3d-…',
    bindingHint: 'معرّف رقم Vapi الذي تستقبل عليه المكالمات بعد التحويل.',
    publicNumberLabel: 'رقم شركتك الحالي (الرقم الذي يتصل به العملاء)',
    setup: [
      'ابنِ رقمك الحالي كما هو — لا نبيع أرقامًا ولا نطلب رقمًا جديدًا.',
      'حوّل المكالمات من رقمك الحالي إلى رقم Vapi.',
      'املأ رقمك الحالي ومعرّف رقم Vapi ثم اضغط ربط.',
    ],
    testScope: 'أن معرّف Vapi محفوظ ونشط وأن النظام يوجّه مكالمات هذا الرقم إلى شركتك.',
  },
]

export function getChannelSpec(type: string): ChannelSpec | null {
  return CHANNEL_SPECS.find((spec) => spec.type === type) ?? null
}

export function normalizeChannelNumber(value: string): string {
  const trimmed = value.trim()
  if (!trimmed) return trimmed
  const digits = trimmed.replace(/\D/g, '')
  if (trimmed.startsWith('+')) return '+' + digits
  if (digits.startsWith('00')) return '+' + digits.slice(2)
  // Yemen local 9-digit mobile (77xxxxxxx, 73xxxxxxx, 71xxxxxxx, 70xxxxxxx)
  if (digits.length === 9 && digits.startsWith('7')) return '+967' + digits
  // Yemen with leading 0 (077xxxxxxx, 073xxxxxxx, etc.)
  if (digits.length === 10 && digits.startsWith('07')) return '+967' + digits.slice(1)
  // Saudi with leading 0 (05xxxxxxxx)
  if (digits.length === 10 && digits.startsWith('05')) return '+966' + digits.slice(1)
  return digits ? '+' + digits : trimmed
}

export type ChannelRow = {
  id: string
  channel_type: string
  provider_account_id: string | null
  external_identifier: string | null
  verification_status: string | null
  is_active: boolean | null
}

export type BindingCheck = { label: string; ok: boolean; detail?: string }

export type BindingTestResult = {
  ok: boolean
  checks: BindingCheck[]
  scope: string
}

export async function verifyChannelBinding(
  supabase: SupabaseClient,
  channel: ChannelRow
): Promise<BindingTestResult> {
  const spec = getChannelSpec(channel.channel_type)
  if (!spec) {
    return { ok: false, checks: [{ label: 'قناة معروفة', ok: false, detail: channel.channel_type }], scope: '' }
  }

  const savedNumber = channel.external_identifier
  const providerId = channel.provider_account_id
  const identifier =
    spec.type === 'whatsapp'
      ? savedNumber || providerId
      : spec.bindingColumn === 'provider_account_id'
        ? providerId
        : channel.external_identifier

  const checks: BindingCheck[] = [
    { label: 'القناة محفوظة', ok: Boolean(channel.id) },
    { label: 'القناة مُفعّلة', ok: channel.is_active === true },
    {
      label: spec.bindingLabel,
      ok: Boolean(identifier),
      detail: identifier ?? 'غير مُدخل',
    },
  ]

  if (spec.publicNumberLabel) {
    checks.push({
      label: spec.publicNumberLabel,
      ok: Boolean(channel.external_identifier),
      detail: channel.external_identifier ?? 'غير مُدخل',
    })
  }

  // Real WhatsApp routing requires phone_number_id (provider_account_id).
  if (spec.type === 'whatsapp') {
    const live = Boolean(channel.provider_account_id) && channel.verification_status === 'verified'
    checks.push({
      label: 'ربط Meta فعلي',
      ok: live,
      detail: live ? 'مربوط' : 'غير مكتمل — استخدم زر Meta',
    })
  }

  const resolved = await resolveChannelExact(supabase, {
    channelType: channel.channel_type,
    providerAccountId:
      spec.type === 'whatsapp' && !channel.provider_account_id ? null : channel.provider_account_id,
    externalIdentifier: channel.external_identifier,
  })

  checks.push({
    label: 'التوجيه يعيد هذه الشركة',
    ok: resolved?.id === channel.id,
    detail: resolved ? (resolved.id === channel.id ? 'مطابق' : 'يوجّه إلى قناة أخرى') : 'لا يوجد توجيه',
  })

  return { ok: checks.every((check) => check.ok), checks, scope: spec.testScope }
}
