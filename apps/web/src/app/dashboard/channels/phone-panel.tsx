'use client'

import { useState, useTransition } from 'react'
import {
  Check,
  CheckCircle2,
  Copy,
  Info,
  Loader2,
  Phone,
  PhoneCall,
  PhoneForwarded,
  PhoneOff,
  Settings2,
  Sparkles,
  XCircle,
} from 'lucide-react'
import {
  savePhoneConnectionAction,
  verifyPhoneSetupAction,
  confirmForwardingAction,
  autoProvisionPhoneChannelAction,
  type PhoneCheck,
  type PhoneResult,
  type PhoneSetupInput,
} from './phone-actions'
import { formatDateTime } from '@/lib/i18n/format'
import { ar } from '@/lib/i18n/ar'
import { forwardingStatusLabel } from '@/lib/i18n/labels'

export type CarrierProfile = {
  id: string
  country_code: string
  operator_name: string
  forward_on_no_answer_code: string | null
  forward_on_busy_code: string | null
  forward_all_code: string | null
  cancel_forward_code: string | null
  setup_instructions_url: string | null
}

const COUNTRY_NAMES: Record<string, { label: string; flag: string }> = {
  YE: { label: 'الجمهورية اليمنية', flag: '🇾🇪' },
  SA: { label: 'المملكة العربية السعودية', flag: '🇸🇦' },
  EG: { label: 'جمهورية مصر العربية', flag: '🇪🇬' },
  AE: { label: 'الإمارات العربية المتحدة', flag: '🇦🇪' },
  KW: { label: 'الكويت', flag: '🇰🇼' },
  QA: { label: 'قطر', flag: '🇶🇦' },
  GLOBAL: { label: 'المعيار العالمي العام', flag: '🌐' },
}

export function PhonePanel({
  canManage,
  timezone,
  carriers = [],
  initial,
  instructions: _instructions,
}: {
  canManage: boolean
  timezone: string
  carriers?: CarrierProfile[]
  initial: {
    existingPhoneNumber: string | null
    vapiNumber: string | null
    carrierProfileId?: string | null
    forwardType: string
    forwardingStatus: string
    lastVerifiedAt: string | null
  } | null
  instructions: string[]
}) {
  // Focus strictly on Yemen telecom carriers as requested
  const yemenCarriers = carriers.filter((c) => c.country_code === 'YE')
  const displayCarriers = yemenCarriers.length > 0 ? yemenCarriers : carriers

  const [form, setForm] = useState<PhoneSetupInput>({
    existingPhoneNumber: initial?.existingPhoneNumber ?? '',
    vapiNumber: initial?.vapiNumber ?? '',
    carrierProfileId: initial?.carrierProfileId ?? (displayCarriers[0]?.id || ''),
    forwardType: (initial?.forwardType ?? 'no_answer') as PhoneSetupInput['forwardType'],
  })
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  const [result, setResult] = useState<PhoneResult | null>(null)
  const [checks, setChecks] = useState<{ checks: PhoneCheck[]; scope: string } | null>(null)
  const [pending, startTransition] = useTransition()

  // Selected carrier
  const selectedCarrier =
    displayCarriers.find((c) => c.id === form.carrierProfileId) || displayCarriers[0] || null

  // Destination forwarding target
  const forwardTarget =
    form.vapiNumber?.trim() || initial?.vapiNumber?.trim() || '+967770000000'

  // Generate USSD codes
  let activationPattern = '*61*{PHONE}#'
  let cancelCode = '##61#'

  if (selectedCarrier) {
    if (form.forwardType === 'no_answer') {
      activationPattern = selectedCarrier.forward_on_no_answer_code || '*61*{PHONE}#'
      cancelCode = selectedCarrier.cancel_forward_code || '##61#'
    } else if (form.forwardType === 'busy') {
      activationPattern = selectedCarrier.forward_on_busy_code || '*67*{PHONE}#'
      cancelCode = selectedCarrier.cancel_forward_code || '##67#'
    } else if (form.forwardType === 'all') {
      activationPattern = selectedCarrier.forward_all_code || '*21*{PHONE}#'
      cancelCode = '##21#'
    } else if (form.forwardType === 'unavailable') {
      activationPattern = '*62*{PHONE}#'
      cancelCode = '##62#'
    }
  }

  const generatedCode = activationPattern.replace('{PHONE}', forwardTarget)

  // Extra note for Yemen Mobile if CDMA or 4G LTE
  const isYemenMobile = selectedCarrier?.operator_name.includes('يمن موبايل')
  const alternativeVoLTECode = isYemenMobile && form.forwardType === 'no_answer'
    ? `*61*${forwardTarget}#`
    : null

  function run(work: () => Promise<PhoneResult>) {
    setResult(null)
    startTransition(async () => {
      const outcome = await work()
      setResult(outcome)
    })
  }

  function runVerify() {
    setChecks(null)
    startTransition(async () => {
      const outcome = await verifyPhoneSetupAction()
      if (outcome.error) {
        setResult({ ok: false, error: outcome.error })
        return
      }
      setChecks({ checks: outcome.checks, scope: outcome.scope })
      setResult(
        outcome.ok
          ? { ok: true, message: ar.channels.phoneSetupComplete }
          : { ok: false, error: ar.channels.phoneSetupIncomplete }
      )
    })
  }

  function runAutoProvision() {
    setResult(null)
    startTransition(async () => {
      const outcome = await autoProvisionPhoneChannelAction()
      setResult(outcome)
      if (outcome.ok && outcome.vapiNumber) {
        setForm((prev) => ({
          ...prev,
          vapiNumber: outcome.vapiNumber ?? prev.vapiNumber,
        }))
      }
    })
  }

  function handleCopy(text: string, label: string) {
    navigator.clipboard.writeText(text)
    setCopiedCode(label)
    setTimeout(() => setCopiedCode(null), 2500)
  }

  const statusLabel = forwardingStatusLabel(initial?.forwardingStatus ?? 'pending_test')
  const isActive = initial?.forwardingStatus === 'active'

  return (
    <section className="rounded-2xl border border-border bg-surface p-6 shadow-xs space-y-6">
      {/* Header & Status */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4 border-b border-border pb-5">
        <div>
          <h2 className="flex items-center gap-2.5 text-base font-bold text-text">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary-light/40 text-primary-dark">
              <PhoneForwarded size={18} />
            </div>
            <span>تحويل المكالمات والرد الصوتي الذكي (AI Voice Receptionist)</span>
          </h2>
          <p className="mt-1.5 text-xs text-text-muted leading-relaxed max-w-2xl">
            يرد الوكيل الصوتي الذكي على استفسارات عملائك وحجوزاتهم بناءً على قاعدة معرفة شركتك المعتمدة
            عندما لا يجيب الموظفون أو عند انشغال الخط.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-center">
          <span
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold border ${
              isActive
                ? 'bg-success/10 text-success border-success/30'
                : 'bg-warning/10 text-warning border-warning/30'
            }`}
          >
            <span
              className={`h-2 w-2 rounded-full ${
                isActive ? 'bg-success animate-pulse' : 'bg-warning'
              }`}
            />
            {statusLabel}
          </span>
          {initial?.lastVerifiedAt && (
            <span className="text-[11px] text-text-muted hidden md:inline">
              آخر تأكيد: {formatDateTime(initial.lastVerifiedAt, timezone)}
            </span>
          )}
        </div>
      </div>

      {result && (
        <div
          className={`rounded-xl border p-4 text-xs font-semibold leading-relaxed ${
            result.ok
              ? 'border-success/40 bg-success/10 text-text'
              : 'border-error/40 bg-error/10 text-text'
          }`}
        >
          {result.ok ? result.message : result.error}
        </div>
      )}

      {/* Step-by-Step Configuration Form */}
      <div className="space-y-6">
        {/* Dedicated Number Auto-Provisioning Hero Card */}
        <div className="rounded-2xl border border-primary/40 bg-gradient-to-br from-primary/10 via-surface to-background p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-primary text-white shadow-xs">
                <Sparkles size={22} />
              </span>
              <div>
                <h3 className="text-sm sm:text-base font-bold text-text">
                  رقم موظف الاستقبال الذكي المخصص لشركتك (Dedicated AI Number)
                </h3>
                <p className="text-xs text-text-muted">
                  يتم حجز وإنشاء رقم سحابي مخصص لشركتك تلقائياً لتقوم بتحويل المكالمات إليه بنقرة زر واحدة.
                </p>
              </div>
            </div>

            {canManage && (
              <button
                type="button"
                disabled={pending}
                onClick={runAutoProvision}
                className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-xs sm:text-sm font-bold text-white hover:bg-primary-dark transition-all shadow-xs shrink-0 disabled:opacity-60"
              >
                {pending ? (
                  <Loader2 size={16} className="animate-spin" />
                ) : (
                  <Sparkles size={16} />
                )}
                <span>
                  {form.vapiNumber && form.vapiNumber.length > 5
                    ? '⚡ تحديث أو فحص الرقم'
                    : '⚡ تفعيل وإنشاء رقم خاص لشركتي الآن'}
                </span>
              </button>
            )}
          </div>

          {form.vapiNumber && form.vapiNumber.length > 5 ? (
            <div className="rounded-xl border border-success/30 bg-success/5 p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-success" />
                  <span className="text-xs font-bold text-success">
                    تم إنشاء وتفعيل رقم التحويل الذكي الخاص بشركتك:
                  </span>
                </div>
                <div className="flex items-center gap-3">
                  <span
                    className="font-mono text-base sm:text-xl font-extrabold text-text tracking-wider select-all"
                    dir="ltr"
                  >
                    {form.vapiNumber.startsWith('00') ? `+${form.vapiNumber.slice(2)}` : form.vapiNumber}
                  </span>
                  <span className="text-[11px] text-text-muted">
                    (للاتصال والتحويل المباشر من اليمن: {form.vapiNumber.startsWith('+') ? `00${form.vapiNumber.slice(1)}` : form.vapiNumber})
                  </span>
                </div>
              </div>

              <button
                type="button"
                onClick={() =>
                  handleCopy(
                    form.vapiNumber?.startsWith('00')
                      ? form.vapiNumber
                      : `00${form.vapiNumber?.replace(/^\+/, '')}`,
                    'dedicated_vapi_num'
                  )
                }
                className="inline-flex items-center justify-center gap-1.5 rounded-lg border border-border bg-surface px-3 py-1.5 text-xs font-semibold text-text hover:bg-background transition-colors self-start sm:self-center"
              >
                {copiedCode === 'dedicated_vapi_num' ? (
                  <>
                    <Check size={14} className="text-success" />
                    <span className="text-success font-bold">تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} />
                    <span>نسخ الرقم</span>
                  </>
                )}
              </button>
            </div>
          ) : (
            <div className="rounded-xl border border-warning/30 bg-warning/5 p-3.5 text-xs text-text-muted leading-relaxed">
              💡 اضغط على زر <strong>«تفعيل وإنشاء رقم خاص لشركتي الآن»</strong> بالأعلى، وسيقوم النظام فوراً في الخلفية بإنشاء وتجهيز رقم دولي خاص بنشاطك وربطه بموظف الاستقبال بالذكاء الاصطناعي دون أي خطوات تقنية.
            </div>
          )}
        </div>

        {/* Step 1 & 2: Business Phone Number and Carrier Selector */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Business Phone Number */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-text flex items-center justify-between">
              <span>١. رقم هاتف شركتك الحالي</span>
              <span className="text-[11px] font-normal text-text-muted">الرقم الذي يتصل به عملاؤك</span>
            </label>
            <div className="relative">
              <input
                value={form.existingPhoneNumber}
                disabled={!canManage}
                onChange={(event) =>
                  setForm({ ...form, existingPhoneNumber: event.target.value })
                }
                placeholder="77xxxxxxx أو 73xxxxxxx أو 71xxxxxxx أو +967xxxxxxxxx"
                dir="ltr"
                className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-text text-start placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
              />
            </div>
            <p className="text-[11px] text-text-muted">
              رقم شريحة هاتف شركتك في اليمن (يمن موبايل، يو، سبأفون، واي).
            </p>
          </div>

          {/* Telecom Carrier Selector */}
          <div className="space-y-1.5">
            <label className="block text-xs font-bold text-text flex items-center justify-between">
              <span>٢. شركة ومزوّد الاتصالات لشريحتك</span>
              <span className="text-[11px] font-semibold text-primary-dark">🇾🇪 شبكات اليمن</span>
            </label>
            <select
              value={form.carrierProfileId ?? ''}
              disabled={!canManage}
              onChange={(event) =>
                setForm({ ...form, carrierProfileId: event.target.value || null })
              }
              className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary disabled:opacity-60"
            >
              {displayCarriers.length === 0 ? (
                <option value="">يمن موبايل (Yemen Mobile)</option>
              ) : (
                displayCarriers.map((carrier) => {
                  const country = COUNTRY_NAMES[carrier.country_code] || {
                    label: carrier.country_code,
                    flag: '🇾🇪',
                  }
                  return (
                    <option key={carrier.id} value={carrier.id}>
                      {country.flag} {carrier.operator_name}
                    </option>
                  )
                })
              )}
            </select>
            <p className="text-[11px] text-text-muted">
              يتم توليد كود التحويل المعتمد لدى شبكتك المختارة تلقائياً ومجاناً.
            </p>
          </div>
        </div>

        {/* Step 3: Forwarding Scenario Selector */}
        <div className="space-y-2 pt-2 border-t border-border">
          <label className="block text-xs font-bold text-text">
            ٣. متى يتم تحويل المكالمة للوكيل الذكي؟
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            {[
              {
                id: 'no_answer',
                title: 'عند عدم الرد (موصى به)',
                desc: 'يرن هاتفك 20 ثانية أولاً، وإذا لم ترد يتحول المكالمة فوراً للوكيل.',
                badge: 'الأفضل للأعمال',
              },
              {
                id: 'busy',
                title: 'عند انشغال الخط',
                desc: 'إذا كان خطك مشغولاً بمكالمة أخرى، يرد الوكيل على العميل الثاني.',
              },
              {
                id: 'unavailable',
                title: 'عند إغلاق الهاتف / خارج التغطية',
                desc: 'عندما يكون جوالك مغلقاً أو في وضع الطيران.',
              },
              {
                id: 'all',
                title: 'تحويل كافة المكالمات (24/7)',
                desc: 'يرد الوكيل الذكي مباشرة على جميع المكالمات دون رنين هاتفك.',
              },
            ].map((option) => {
              const selected = form.forwardType === option.id
              return (
                <button
                  key={option.id}
                  type="button"
                  disabled={!canManage}
                  onClick={() =>
                    setForm({
                      ...form,
                      forwardType: option.id as PhoneSetupInput['forwardType'],
                    })
                  }
                  className={`text-start p-3 rounded-xl border transition-all relative ${
                    selected
                      ? 'border-primary bg-primary/5 ring-1 ring-primary'
                      : 'border-border bg-background hover:bg-background/80'
                  }`}
                >
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-bold text-text">{option.title}</span>
                    {option.badge && (
                      <span className="text-[10px] font-extrabold px-1.5 py-0.5 rounded-full bg-primary-light/40 text-primary-dark">
                        {option.badge}
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] text-text-muted leading-relaxed">{option.desc}</p>
                </button>
              )
            })}
          </div>
        </div>

        {/* Step 4: Live Activation USSD Code Card */}
        <div className="rounded-2xl border border-primary/30 bg-primary-light/15 p-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
            <div className="flex items-center gap-2">
              <Sparkles size={18} className="text-primary-dark" />
              <h3 className="text-sm font-bold text-text">
                كود تفعيل التحويل السريع (مخصص لخطك):
              </h3>
            </div>
            <span className="text-xs text-text-muted">
              {selectedCarrier?.operator_name || 'مزود الخدمة المعتمد'}
            </span>
          </div>

          <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
            <div className="flex-1 flex items-center justify-between bg-surface border border-border rounded-xl px-4 py-3 shadow-2xs">
              <span className="font-mono text-base sm:text-lg font-bold text-primary-dark tracking-wider select-all" dir="ltr">
                {generatedCode}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(generatedCode, 'code')}
                className="flex items-center gap-1 text-xs text-text-muted hover:text-text bg-background border border-border rounded-lg px-2.5 py-1.5 transition-colors"
              >
                {copiedCode === 'code' ? (
                  <>
                    <Check size={13} className="text-success" />
                    <span className="text-success font-bold">تم النسخ</span>
                  </>
                ) : (
                  <>
                    <Copy size={13} />
                    <span>نسخ</span>
                  </>
                )}
              </button>
            </div>

            {/* Direct Dial Link for Mobile */}
            <a
              href={`tel:${encodeURIComponent(generatedCode)}`}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-primary px-5 py-3 text-sm font-bold text-white hover:bg-primary-dark transition-all shadow-xs shrink-0"
            >
              <PhoneCall size={16} />
              <span>اتصال وتفعيل الكود فوراً</span>
            </a>
          </div>

          {/* Yemen Mobile 4G VoLTE alternative code if applicable */}
          {alternativeVoLTECode && (
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 rounded-xl bg-surface/80 border border-border px-3.5 py-2 text-xs">
              <div className="flex items-center gap-1.5 text-text-muted">
                <span>لشرائح يمن موبايل 4G / VoLTE (كود بديل):</span>
                <span className="font-mono font-bold text-text bg-background px-2 py-0.5 rounded border border-border" dir="ltr">
                  {alternativeVoLTECode}
                </span>
              </div>
              <button
                type="button"
                onClick={() => handleCopy(alternativeVoLTECode, 'volte')}
                className="text-[11px] font-bold text-primary-dark hover:underline self-end sm:self-auto"
              >
                {copiedCode === 'volte' ? 'تم نسخ كود 4G' : 'نسخ كود 4G'}
              </button>
            </div>
          )}

          {/* Instructions and Cancellation Code */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 text-xs text-text-muted pt-2 border-t border-primary/20">
            <div className="flex items-center gap-1.5">
              <Info size={14} className="text-primary-dark shrink-0" />
              <span>
                اطلب الكود من شريحة هاتف شركتك، وسيرد المشغل برسالة «تم تفعيل تحويل المكالمات».
              </span>
            </div>

            <div className="flex items-center gap-2 shrink-0">
              <span>كود الإلغاء في أي وقت:</span>
              <span className="font-mono font-bold text-text bg-surface border border-border rounded-md px-2 py-0.5 select-all" dir="ltr">
                {cancelCode}
              </span>
              <button
                type="button"
                onClick={() => handleCopy(cancelCode, 'cancel')}
                className="p-1 hover:text-text rounded transition-colors"
                title="نسخ كود الإلغاء"
              >
                {copiedCode === 'cancel' ? (
                  <Check size={13} className="text-success" />
                ) : (
                  <Copy size={13} />
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Step 5: Save & Management Actions */}
        {canManage && (
          <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
            <div className="flex flex-wrap gap-2.5">
              <button
                type="button"
                disabled={pending}
                onClick={() => run(() => savePhoneConnectionAction(form))}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl bg-primary px-6 py-2.5 text-sm font-bold text-white hover:bg-primary-dark disabled:opacity-60 transition-all shadow-xs"
              >
                {pending && <Loader2 className="animate-spin" size={15} />}
                <span>حفظ الإعدادات</span>
              </button>

              <button
                type="button"
                disabled={pending}
                onClick={runVerify}
                className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 py-2.5 text-sm font-semibold text-text hover:bg-surface hover:border-primary/50 disabled:opacity-60 transition-all"
              >
                <span>فحص وتأكيد الربط</span>
              </button>
            </div>

            <button
              type="button"
              disabled={pending}
              onClick={() =>
                run(() => confirmForwardingAction(initial?.forwardingStatus !== 'active'))
              }
              className={`inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border px-4 py-2.5 text-sm font-bold transition-all ${
                isActive
                  ? 'border-error/40 text-error hover:bg-error/10'
                  : 'border-success/40 text-success hover:bg-success/10'
              }`}
            >
              {isActive ? (
                <>
                  <PhoneOff size={16} />
                  <span>تعطيل التحويل</span>
                </>
              ) : (
                <>
                  <Phone size={16} />
                  <span>تأكيد تفعيل التحويل لدى المشغل</span>
                </>
              )}
            </button>
          </div>
        )}

        {/* Verification Checklist */}
        {canManage && checks && (
          <div className="rounded-xl border border-border bg-background p-4 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-bold text-text">تقرير فحص القناة الصوتية والتحويل:</h4>
              <span className="text-[11px] text-text-muted">النطاق: {checks.scope}</span>
            </div>
            <ul className="space-y-2">
              {checks.checks.map((check) => (
                <li key={check.label} className="flex items-start gap-2.5 text-xs text-text">
                  {check.ok ? (
                    <CheckCircle2 size={15} className="mt-0.5 shrink-0 text-success" />
                  ) : (
                    <XCircle size={15} className="mt-0.5 shrink-0 text-error" />
                  )}
                  <span>
                    <strong>{check.label}</strong>
                    {check.detail && (
                      <span className="text-text-muted"> — {check.detail}</span>
                    )}
                  </span>
                </li>
              ))}
            </ul>
          </div>
        )}

        {/* Advanced Technical Settings (Collapsed for normal users) */}
        {canManage && (
          <details className="rounded-xl border border-border bg-background/50 p-4 transition-all">
            <summary className="flex cursor-pointer items-center justify-between text-xs font-bold text-text-muted hover:text-text">
              <span className="flex items-center gap-2">
                <Settings2 size={15} />
                <span>إعدادات فنية متقدمة (معرّف التوجيه السحابي الداخلي Vapi/SIP)</span>
              </span>
              <span className="text-[11px] text-primary-dark">تعديل اختياري</span>
            </summary>
            <div className="space-y-4 pt-4 mt-3 border-t border-border">
              <label className="block text-xs text-text-muted">
                {ar.channels.vapiNumber} (معرّف التوجيه السحابي المخصص لشركتك):
                <input
                  value={form.vapiNumber}
                  disabled={!canManage}
                  onChange={(event) => setForm({ ...form, vapiNumber: event.target.value })}
                  placeholder="frontdesk_xxxx أو معرّف هاتف Vapi"
                  dir="ltr"
                  className="mt-1 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text font-mono focus:border-primary focus:outline-none"
                />
              </label>
              <p className="text-[11px] text-text-muted leading-relaxed">
                في المنصة متعددة المشتركين (Multi-tenant SaaS)، يتم إنشاء وتعيين معرّف التوجيه الداخلي
                تلقائياً لكل مشترك لضمان عزل البيانات الكامل، وتوجيه المكالمة إلى وكيل شركتك وقاعدة معرفتك تحديداً.
              </p>
            </div>
          </details>
        )}
      </div>
    </section>
  )
}
