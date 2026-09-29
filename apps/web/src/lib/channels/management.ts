import type { SupabaseClient } from '@supabase/supabase-js'
import { resolveChannelExact } from '@/lib/runtime/tenant'

/**
 * Channel management catalogue.
 *
 * This is the single description of what each channel needs to be connectable. It is
 * deliberately built on the existing `channels` table (docs/DB_CONTRACT.md) instead of
 * a second channel model: `provider_account_id` carries the provider's own identifier
 * that the webhooks resolve on, and `external_identifier` carries the customer-facing
 * number for SMS and Phone.
 */
export type ChannelType = 'whatsapp' | 'instagram' | 'sms' | 'phone'

export type ChannelSpec = {
  type: ChannelType
  label: string
  provider: string
  /** Column the inbound webhook resolves this channel by. */
  bindingColumn: 'provider_account_id' | 'external_identifier'
  bindingLabel: string
  bindingPlaceholder: string
  bindingHint: string
  /** Phone keeps the business's existing public number for display and audit. */
  publicNumberLabel: string | null
  setup: string[]
  /** What the "test" button actually proves. */
  testScope: string
}

export const CHANNEL_SPECS: readonly ChannelSpec[] = [
  {
    type: 'whatsapp',
    label: 'واتساب للأعمال',
    provider: 'Meta',
    bindingColumn: 'provider_account_id',
    bindingLabel: 'معرّف رقم واتساب (phone_number_id)',
    bindingPlaceholder: 'مثال 123456789012345',
    bindingHint:
      'المعرّف الرقمي لرقم واتساب من لوحة Meta. الرسائل الواردة تُوجَّه لشركتك بهذا المعرّف فقط.',
    publicNumberLabel: null,
    setup: [
      'اربط رقم واتساب للأعمال بتطبيق Meta في لوحة Meta for Developers.',
      'اشترك في حقل messages لحساب واتساب.',
      'انسخ phone_number_id والصقه هنا ثم اضغط ربط.',
    ],
    testScope: 'أن المعرّف محفوظ ونشط وأن النظام يوجّه رسائل هذا الرقم إلى شركتك.',
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
    bindingHint:
      'الرقم السحابي الذي يستقبل رسائل العملاء. الربط يتم على الرقم المُستقبِل (To) بنظام E.164.',
    publicNumberLabel: null,
    setup: [
      'أنشئ رقمًا سحابيًا في Twilio (القناة السحابية مستقلة عن تحويل المكالمات).',
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
    bindingHint:
      'معرّف رقم Vapi الذي تستقبل عليه المكالمات بعد التحويل. لا تحتاج شراء رقم جديد من المنصة.',
    publicNumberLabel: 'رقم شركتك الحالي (الرقم الذي يتصل به العملاء)',
    setup: [
      'ابنِ رقمك الحالي كما هو — لا نبيع أرقامًا ولا نطلب رقمًا جديدًا.',
      'حوّل المكالمات من رقمك الحالي إلى رقم Vapi عبر إعدادات مزوّد الاتصالات أو تطبيق الهاتف.',
      'املأ رقمك الحالي ومعرّف رقم Vapi ثم اضغط ربط.',
      'بعد التحويل تستمر المكالمة على السحابة حتى لو كان جوالك مغلقًا (ADR-0003).',
    ],
    testScope: 'أن معرّف Vapi محفوظ ونشط وأن النظام يوجّه مكالمات هذا الرقم إلى شركتك.',
  },
] as const

export function getChannelSpec(type: string): ChannelSpec | null {
  return CHANNEL_SPECS.find((spec) => spec.type === type) ?? null
}

/**
 * The canonical E.164 form. Provider payloads and operators both omit or vary the
 * prefix, and the binding must be exact, so normalisation happens in one place.
 */
export function normalizeChannelNumber(input: string): string {
  const digits = input.replace(/[^\d+]/g, '')
  if (digits.startsWith('+')) return digits
  if (digits.startsWith('00')) return '+' + digits.slice(2)
  return digits.length >= 8 ? '+' + digits : digits
}

export type ChannelRow = {
  id: string
  channel_type: string
  provider_account_id: string | null
  external_identifier: string | null
  verification_status: string | null
  is_active: boolean | null
  business_id: string | null
  updated_at: string | null
}

export type BindingCheck = { label: string; ok: boolean; detail?: string }

export type BindingTestResult = {
  ok: boolean
  checks: BindingCheck[]
  /** Stated so the UI never implies more than was verified. */
  scope: string
}

/**
 * Verifies what can be verified without contacting the provider: the binding is stored,
 * active, complete, and resolves through the exact same resolver the inbound webhooks
 * use. It intentionally does not claim a provider round-trip happened.
 */
export async function verifyChannelBinding(
  supabase: SupabaseClient,
  channel: ChannelRow
): Promise<BindingTestResult> {
  const spec = getChannelSpec(channel.channel_type)
  if (!spec) return { ok: false, checks: [{ label: 'قناة معروفة', ok: false, detail: channel.channel_type }], scope: '' }

  const identifier =
    spec.bindingColumn === 'provider_account_id' ? channel.provider_account_id : channel.external_identifier

  const checks: BindingCheck[] = [
    { label: 'القناة محفوظة', ok: Boolean(channel.id) },
    { label: 'القناة مُفعّلة', ok: channel.is_active === true },
    { label: spec.bindingLabel, ok: Boolean(identifier), detail: identifier ?? 'غير مُدخل' },
  ]

  if (spec.publicNumberLabel) {
    checks.push({
      label: spec.publicNumberLabel,
      ok: Boolean(channel.external_identifier),
      detail: channel.external_identifier ?? 'غير مُدخل',
    })
  }

  const resolved = await resolveChannelExact(supabase, {
    channelType: channel.channel_type,
    providerAccountId: channel.provider_account_id,
    externalIdentifier: channel.external_identifier,
  })

  checks.push({
    label: 'التوجيه يعيد هذه الشركة',
    ok: resolved?.id === channel.id,
    detail: resolved ? (resolved.id === channel.id ? 'مطابق' : 'يوجّه إلى قناة أخرى') : 'لا يوجد توجيه',
  })

  return { ok: checks.every((check) => check.ok), checks, scope: spec.testScope }
}
