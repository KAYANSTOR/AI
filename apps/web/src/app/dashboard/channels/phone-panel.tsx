'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, Loader2, PhoneForwarded, XCircle } from 'lucide-react'
import {
  savePhoneConnectionAction,
  verifyPhoneSetupAction,
  confirmForwardingAction,
  type PhoneCheck,
  type PhoneResult,
  type PhoneSetupInput,
} from './phone-actions'
import { formatDateTime } from '@/lib/i18n/format'
import { ar } from '@/lib/i18n/ar'
import { forwardingStatusLabel } from '@/lib/i18n/labels'

export function PhonePanel({
  canManage,
  timezone,
  initial,
  instructions,
}: {
  canManage: boolean
  timezone: string
  initial: {
    existingPhoneNumber: string | null
    vapiNumber: string | null
    forwardType: string
    forwardingStatus: string
    lastVerifiedAt: string | null
  } | null
  instructions: string[]
}) {
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

  const statusLabel = forwardingStatusLabel(
    initial?.forwardingStatus ?? 'pending_test'
  )

  return (
    <section className="rounded-xl border border-border bg-surface p-5">
      <header className="mb-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
          <PhoneForwarded size={16} className="text-primary-dark" />
          {ar.channels.phoneSetupTitle}
        </h2>
        <p className="mt-1 text-xs leading-relaxed text-text-muted">{ar.channels.phoneSetupDescription}</p>
      </header>

      <p className="mb-4 text-xs text-text-muted">
        {ar.channels.phoneStatus}: <span className="font-medium text-text">{statusLabel}</span>
        {initial?.lastVerifiedAt
          ? ` · ${ar.channels.lastConfirmation}: ${formatDateTime(initial.lastVerifiedAt, timezone)}`
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

      <div className="grid gap-3 sm:grid-cols-2">
        <label className="text-xs text-text-muted">
          {ar.channels.phoneNumber}
          <input
            value={form.existingPhoneNumber}
            disabled={!canManage}
            onChange={(event) => setForm({ ...form, existingPhoneNumber: event.target.value })}
            placeholder="+966512345678"
            dir="ltr"
            className="mt-1 min-h-11 w-full rounded-lg border border-border px-2 py-1.5 text-base text-text disabled:bg-background md:text-sm"
          />
        </label>
        <label className="text-xs text-text-muted">
          {ar.channels.forwardingType}
          <select
            value={form.forwardType}
            disabled={!canManage}
            onChange={(event) =>
              setForm({ ...form, forwardType: event.target.value as PhoneSetupInput['forwardType'] })
            }
            className="mt-1 min-h-11 w-full rounded-lg border border-border px-2 py-1.5 text-base text-text disabled:bg-background md:text-sm"
          >
            {Object.entries(ar.channels.forwardingTypes).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </select>
        </label>
      </div>

      {canManage ? (
        <details className="mt-4 rounded-lg border border-border bg-background/60 px-3 py-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-text">
            إعدادات فنية متقدمة
          </summary>
          <div className="space-y-4 py-2">
          <label className="block text-xs text-text-muted">
            {ar.channels.vapiNumber}
            <input
              value={form.vapiNumber}
              disabled={!canManage}
              onChange={(event) => setForm({ ...form, vapiNumber: event.target.value })}
              placeholder="3a1b2c3d-…"
              dir="ltr"
              className="mt-1 min-h-11 w-full rounded-lg border border-border px-2 py-1.5 text-base text-text disabled:bg-background md:text-sm"
            />
          </label>
          <ol className="space-y-2 rounded-lg bg-background p-3 text-xs leading-relaxed text-text">
            {instructions.map((step, index) => (
              <li key={step} className="flex gap-2">
                <span className="font-semibold text-primary-dark">{index + 1}.</span>
                {step}
              </li>
            ))}
          </ol>
          </div>
        </details>
      ) : null}

      {canManage && (
        <div className="mt-4 flex flex-wrap gap-2">
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => savePhoneConnectionAction(form))}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-base font-medium text-surface transition-colors hover:bg-primary-dark disabled:opacity-60 sm:w-auto md:text-sm"
          >
            {pending && <Loader2 className="animate-spin" size={14} />}
            {ar.channels.savePhoneSetup}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={runVerify}
            className="min-h-11 w-full rounded-lg border border-primary px-4 py-2 text-base font-medium text-primary-dark transition-colors hover:bg-primary/10 disabled:opacity-60 sm:w-auto md:text-sm"
          >
            {ar.channels.checkPhoneSetup}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => run(() => confirmForwardingAction(initial?.forwardingStatus !== 'active'))}
            className="min-h-11 w-full rounded-lg border border-border px-4 py-2 text-base font-medium text-text transition-colors hover:border-primary/50 disabled:opacity-60 sm:w-auto md:text-sm"
          >
            {initial?.forwardingStatus === 'active'
              ? ar.channels.disableForwarding
              : ar.channels.confirmForwarding}
          </button>
        </div>
      )}

      {canManage && checks && (
        <details className="mt-4 rounded-lg border border-border bg-background p-3">
          <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-text">
            تفاصيل التحقق المتقدمة
          </summary>
          <div className="pt-2">
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
                  {check.detail ? <span className="text-text-muted"> — {check.detail}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[11px] text-text-muted">
            {ar.channels.checkScope}: {checks.scope}
          </p>
          </div>
        </details>
      )}
    </section>
  )
}
