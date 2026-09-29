'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, PhoneForwarded, XCircle } from 'lucide-react'
import {
  savePhoneConnectionAction,
  verifyPhoneSetupAction,
  confirmForwardingAction,
  type PhoneCheck,
  type PhoneResult,
  type PhoneSetupInput,
} from './phone-actions'

const FORWARD_LABELS: Record<string, string> = {
  no_answer: 'عند عدم الرد',
  busy: 'عند الانشغال',
  unavailable: 'عند إغلاق الهاتف',
  all: 'تحويل كل المكالمات',
}

export function PhonePanel({
  canManage,
  initial,
  instructions,
}: {
  canManage: boolean
  initial: {
    existingPhoneNumber: string | null
    vapiNumber: string | null
    forwardType: string
    forwardingStatus: string
    lastVerifiedAt: string | null
  } | null
  instructions: string[]
}) {
  const router = useRouter()
  const [form, setForm] = useState<PhoneSetupInput>({
    existingPhoneNumber: initial?.existingPhoneNumber ?? '',
    vapiNumber: initial?.vapiNumber ?? '',
    forwardType: (initial?.forwardType ?? 'no_answer') as PhoneSetupInput['forwardType'],
  })
  const [result, setResult] = useState<PhoneResult | null>(null)
  const [checks, setChecks] = useState<{ checks: PhoneCheck[]; scope: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function run(work: () => Promise<PhoneResult>) {
    setResult(null)
    startTransition(async () => {
      const outcome = await work()
      setResult(outcome)
      if (outcome.ok) router.refresh()
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
          ? { ok: true, message: 'الإعداد مكتمل ومطابق للتوجيه المستخدم في نظام الاتصال.' }
          : { ok: false, error: 'بعض العناصر غير مكتملة — راجع القائمة أدناه.' }
      )
    })
  }

  const statusLabel =
    initial?.forwardingStatus === 'active'
      ? 'التحويل مُفعّل (تأكيد من فريقك)'
      : initial?.forwardingStatus === 'inactive'
        ? 'التحويل متوقف'
        : 'بانتظار تأكيد التحويل'

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <header className="mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
          <PhoneForwarded size={16} className="text-primary-dark" />
          الهاتف والمكالمات — استخدام رقمك الحالي
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-muted">
          لا نبيع أرقامًا ولا نطلب رقمًا جديدًا. تبقى مكالمات عملائك على رقمك الحالي، ويُحوَّل
          الاتصال إلى الرقم السحابي حتى يستقبله الوكيل.
        </p>
      </header>

      <ol className="mb-4 space-y-2 rounded-lg bg-background p-3 text-xs leading-relaxed text-text">
        {instructions.map((step, index) => (
          <li key={step} className="flex gap-2">
            <span className="font-semibold text-primary-dark">{index + 1}.</span>
            {step}
          </li>
        ))}
      </ol>

      <p className="mb-4 text-xs text-muted">
        الحالة الحالية: <span className="font-medium text-text">{statusLabel}</span>
        {initial?.lastVerifiedAt
          ? ` · آخر تأكيد: ${new Date(initial.lastVerifiedAt).toLocaleString('ar')}`
          : ''}
      </p>

      {result && (
        <div
          className={`mb-4 rounded-lg border px-3 py-2 text-sm ${
            result.ok ? 'border-success/40 bg-success/10 text-text' : 'border-error/40 bg-error/10 text-text'
          }`}
        >
          {result.ok ? result.message : result.error}
        </div>
      )}

      <div className="grid gap-3 sm:grid-cols-3">
        <label className="text-xs text-muted">
          رقم شركتك الحالي
          <input
            value={form.existingPhoneNumber}
            disabled={!canManage}
            onChange={(event) => setForm({ ...form, existingPhoneNumber: event.target.value })}
            placeholder="+966512345678"
            className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm text-text disabled:bg-background"
          />
        </label>
        <label className="text-xs text-muted">
          معرّف رقم Vapi
          <input
            value={form.vapiNumber}
            disabled={!canManage}
            onChange={(event) => setForm({ ...form, vapiNumber: event.target.value })}
            placeholder="3a1b2c3d-…"
            className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm text-text disabled:bg-background"
          />
        </label>
        <label className="text-xs text-muted">
          نوع التحويل
          <select
            value={form.forwardType}
            disabled={!canManage}
            onChange={(event) =>
              setForm({ ...form, forwardType: event.target.value as PhoneSetupInput['forwardType'] })
            }
            className="mt-1 w-full rounded-lg border border-border px-2 py-1.5 text-sm text-text disabled:bg-background"
          >
            {Object.entries(FORWARD_LABELS).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {canManage && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => savePhoneConnectionAction(form))}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-primary-dark disabled:opacity-60"
          >
            {pending && <Loader2 className="animate-spin" size={14} />}
            حفظ الإعداد
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={runVerify}
            className="rounded-lg border border-primary px-4 py-2 text-sm font-medium text-primary-dark transition-colors hover:bg-primary/10 disabled:opacity-60"
          >
            اختبار الإعداد
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => confirmForwardingAction(initial?.forwardingStatus !== 'active'))}
            className="rounded-lg border border-border px-4 py-2 text-sm font-medium text-text transition-colors hover:border-primary/50 disabled:opacity-60"
          >
            {initial?.forwardingStatus === 'active' ? 'تعليم التحويل كمتوقف' : 'تأكيد أن التحويل مُفعّل'}
          </button>
        </div>
      )}

      {checks && (
        <div className="mt-4 rounded-lg border border-border bg-background p-3">
          <ul className="space-y-1.5">
            {checks.checks.map((check) => (
              <li key={check.label} className="flex items-start gap-2 text-xs text-text">
                {check.ok ? (
                  <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" />
                ) : (
                  <XCircle size={14} className="mt-0.5 shrink-0 text-error" />
                )}
                <span>
                  {check.label}
                  {check.detail ? <span className="text-muted"> — {check.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-muted">نطاق هذا الفحص: {checks.scope}</p>
        </div>
      )}
    </section>
  )
}
