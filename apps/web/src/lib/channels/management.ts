import type { DbClient } from '@/lib/db/client'
import { resolveChannelExact } from '@/lib/runtime/tenant'

export type ChannelType = 'whatsapp' | 'instagram' | 'sms' | 'phone' | 'telegram' | 'messenger'

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
    provider: 'Meta / WhatsApp Web QR',
    bindingColumn: 'provider_account_id',
    bindingLabel: 'رقم واتساب',
    bindingPlaceholder: '',
    bindingHint: 'اختر الربط الرسمي من Meta أو ربط WhatsApp Web عبر QR/رمز الهاتف. الربط عبر QR غير رسمي.',
    publicNumberLabel: 'رقم واتساب المحفوظ',
    setup: [
      'للربط الرسمي: استخدم زر Meta ثم أكمل إعداد Cloud API.',
      'للربط عبر الهاتف: اختر رمز QR أو رمز الربط برقم الهاتف من إعدادات القناة.',
      'امسح QR من الأجهزة المرتبطة في واتساب أو أدخل رمز الربط الذي يظهر في الصفحة.',
      'تتحول القناة إلى متصلة فقط بعد تأكيد WhatsApp نجاح ربط الجهاز.',
    ],
    testScope: 'التحقق من جلسة Meta الرسمية أو جلسة WhatsApp Web QR بحسب وضع الاتصال المختار.',
  },
  {
    type: 'instagram',
    label: 'إنستغرام',
    provider: 'ميتا',
    bindingColumn: 'provider_account_id',
    bindingLabel: 'حساب إنستغرام المهني',
    bindingPlaceholder: '',
    bindingHint: 'اربط حساب إنستغرام مهنيًا مرتبطًا بصفحة فيسبوك تديرها.',
    publicNumberLabel: null,
    setup: [
      'اربط حساب إنستغرام المهني بصفحة فيسبوك واختر الصفحة عند التفويض.',
    ],
    testScope: 'أن المعرّف محفوظ ونشط وأن النظام يوجّه رسائل هذا الحساب إلى شركتك.',
  },

  {
    type: 'telegram',
    label: 'تيليجرام',
    provider: 'Telegram Bot API',
    bindingColumn: 'provider_account_id',
    bindingLabel: 'معرّف بوت تيليجرام',
    bindingPlaceholder: 'سيُحدد تلقائياً بعد التحقق من رمز البوت',
    bindingHint: 'اربط بوتاً تملكه عبر BotFather. يتحقق Kayan AI من الرمز ثم يضبط Webhook آمناً لاستقبال الرسائل.',
    publicNumberLabel: null,
    setup: [
      'أنشئ بوتاً عبر @BotFather وانسخ رمز API.',
      'أدخل الرمز لإجراء تحقق مباشر مع Telegram.',
      'سيضبط النظام Webhook بعنوان آمن خاص بهذه القناة.',
      'أرسل رسالة إلى البوت للتأكد من وصولها إلى صندوق الوارد.',
    ],
    testScope: 'التحقق من هوية البوت وصلاحية الرمز وتسجيل Webhook الخاص بالقناة.',
  },
  {
    type: 'messenger',
    label: 'ماسنجر',
    provider: 'ميتا',
    bindingColumn: 'provider_account_id',
    bindingLabel: 'صفحة فيسبوك',
    bindingPlaceholder: 'اختر صفحة بعد تسجيل الدخول إلى فيسبوك',
    bindingHint: 'اربط صفحة تملك صلاحية إدارة الرسائل عليها؛ سيتم حفظ رمز الصفحة مشفّراً.',
    publicNumberLabel: null,
    setup: [
      'سجّل الدخول بالحساب الذي يدير الصفحة ووافق على صلاحيات الرسائل، ثم اختر الصفحة.',
    ],
    testScope: 'التحقق من هوية صفحة Facebook وصلاحية رمزها واشتراك التطبيق في إشعارات الرسائل.',
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
  connection_mode?: string | null
}

export type BindingCheck = { label: string; ok: boolean; detail?: string }

export type BindingTestResult = {
  ok: boolean
  checks: BindingCheck[]
  scope: string
}

export async function verifyChannelBinding(
  db: DbClient,
  channel: ChannelRow,
  organizationId: string
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

  if (spec.type === 'whatsapp' && channel.connection_mode === 'qr_unofficial') {
    checks.push({
      label: 'وضع WhatsApp Web QR',
      ok: channel.verification_status === 'verified' && channel.is_active === true,
      detail: channel.verification_status === 'verified' ? 'تم تأكيد جلسة الجهاز' : 'الجلسة غير متصلة',
    })
  } else if (spec.type === 'whatsapp') {
    const live = Boolean(channel.provider_account_id) && channel.verification_status === 'verified'
    checks.push({ label: 'ربط Meta فعلي', ok: live, detail: live ? 'مربوط' : 'غير مكتمل — استخدم زر Meta' })
  }

  const resolved = await resolveChannelExact(db, {
    organizationId,
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
