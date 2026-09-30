'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, CircleAlert, Loader2, Plug, Power, RadioTower, XCircle } from 'lucide-react'
import type { BindingTestResult, ChannelType } from '@/lib/channels/management'
import type { CredentialMetadata } from '@/lib/credentials/catalog'
import { ChannelCredentials } from './channel-credentials'
import { saveChannelAction, setChannelActiveAction, testChannelAction } from './actions'
import { ar } from '@/lib/i18n/ar'
import { channelVerificationStatusLabel } from '@/lib/i18n/labels'
import type { ChannelSpec } from '@/lib/channels/management'

export type ChannelCardData = {
  spec: ChannelSpec
  timezone: string
  identifier: string | null
  publicNumber: string | null
  isActive: boolean
  connected: boolean
  verificationStatus: string | null
  credentials: CredentialMetadata[]
  credentialsStorageConfigured: boolean
  canManage: boolean
}

function statusChip(data: ChannelCardData) {
  if (!data.connected)
    return { label: ar.channels.notConnected, className: 'bg-background text-text-muted border-border' }
  if (!data.isActive)
    return { label: ar.channels.channelInactive, className: 'bg-warning/15 text-warning border-warning/40' }
  return { label: ar.channels.channelActive, className: 'bg-success/15 text-success border-success/40' }
}

export function ChannelCard({ data, channelType }: { data: ChannelCardData; channelType: ChannelType }) {
  const [identifier, setIdentifier] = useState(data.identifier ?? '')
  const [publicNumber, setPublicNumber] = useState(data.publicNumber ?? '')
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [testResult, setTestResult] = useState<BindingTestResult | null>(null)
  const [pending, startTransition] = useTransition()

  const chip = statusChip(data)
  const locked = !data.canManage

  function runSave() {
    if (locked) return
    startTransition(async () => {
      setTestResult(null)
      const result = await saveChannelAction({
        channelType: data.spec.type,
        identifier,
        publicNumber,
      })
      setFeedback({
        ok: result.ok,
        text: result.ok ? (result.message ?? ar.common.complete) : (result.error ?? ar.errors.save),
      })
    })
  }

  function runToggle() {
    if (locked) return
    startTransition(async () => {
      setTestResult(null)
      const result = await setChannelActiveAction({ channelType: data.spec.type, active: !data.isActive })
      setFeedback({
        ok: result.ok,
        text: result.ok ? (result.message ?? ar.common.complete) : (result.error ?? ar.errors.save),
      })
    })
  }

  function runTest() {
    startTransition(async () => {
      const result = await testChannelAction({ channelType: data.spec.type })
      setFeedback({
        ok: result.ok,
        text: result.ok ? ar.channels.bindingTestSuccess : (result.error ?? ar.errors.generic),
      })
      setTestResult(result.result ?? null)
    })
  }

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <header className="flex flex-wrap items-center justify-between gap-3 border-b border-border px-5 py-4">
        <div className="flex items-center gap-3">
          <span className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light/40">
            <RadioTower size={20} className="text-primary-dark" aria-hidden="true" />
          </span>
          <div>
            <h2 className="text-base font-semibold text-text">{data.spec.label}</h2>
            <p className="text-xs text-text-muted">
              {ar.channels.provider}: {data.spec.provider}
            </p>
          </div>
        </div>
        <span className={`rounded-full border px-3 py-1 text-xs font-medium ${chip.className}`}>{chip.label}</span>
      </header>

      <div className="space-y-4 px-5 py-4">
        {data.connected && (
          <dl className="grid grid-cols-1 gap-3 text-sm sm:grid-cols-2">
            <div>
              <dt className="text-xs text-text-muted">{data.spec.bindingLabel}</dt>
              <dd dir="ltr" className="mt-0.5 break-all text-start font-medium text-text">
                {data.identifier ?? '—'}
              </dd>
            </div>
            {data.spec.publicNumberLabel && (
              <div>
                <dt className="text-xs text-text-muted">{data.spec.publicNumberLabel}</dt>
                <dd dir="ltr" className="mt-0.5 text-start font-medium text-text">
                  {data.publicNumber ?? ar.common.unknown}
                </dd>
              </div>
            )}
            <div>
              <dt className="text-xs text-text-muted">{ar.channels.verificationStatus}</dt>
              <dd className="mt-0.5 font-medium text-text">
                {data.verificationStatus
                  ? channelVerificationStatusLabel(data.verificationStatus)
                  : ar.common.unknown}
              </dd>
            </div>
          </dl>
        )}

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text">{data.spec.bindingLabel}</span>
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              placeholder={data.spec.bindingPlaceholder}
              dir="ltr"
              disabled={locked}
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-text transition-colors focus:border-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60 md:text-sm"
            />
          </label>

          {data.spec.publicNumberLabel && (
            <label className="block">
              <span className="mb-1 block text-xs font-medium text-text">{data.spec.publicNumberLabel}</span>
              <input
                value={publicNumber}
                onChange={(event) => setPublicNumber(event.target.value)}
                placeholder="+966…"
                dir="ltr"
                disabled={locked}
                className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-text transition-colors focus:border-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60 md:text-sm"
              />
            </label>
          )}
        </div>

        <p className="text-xs leading-relaxed text-text-muted">{data.spec.bindingHint}</p>

        <details className="rounded-lg border border-border bg-background/60 px-3 py-2">
          <summary className="flex min-h-11 cursor-pointer items-center text-xs font-semibold text-text">
            {ar.channels.setupSteps}
          </summary>
          <ol className="mt-2 list-decimal space-y-1 ps-5 text-xs leading-relaxed text-text-muted">
            {data.spec.setup.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </details>

        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={runSave}
            disabled={pending || locked}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-dark px-4 py-2 text-base font-medium text-surface transition-colors hover:bg-primary disabled:opacity-60 sm:w-auto md:text-sm"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plug size={16} aria-hidden="true" />}
            {data.connected ? ar.channels.updateBinding : ar.channels.connectChannel}
          </button>

          <button
            type="button"
            onClick={runToggle}
            disabled={pending || locked || !data.connected}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-base font-medium text-text transition-colors hover:bg-background disabled:opacity-50 sm:w-auto md:text-sm"
          >
            <Power size={16} aria-hidden="true" />
            {data.isActive ? ar.channels.disableChannel : ar.channels.enableChannel}
          </button>

          <button
            type="button"
            onClick={runTest}
            disabled={pending || !data.connected}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg border border-border px-4 py-2 text-base font-medium text-text transition-colors hover:bg-background disabled:opacity-50 sm:w-auto md:text-sm"
          >
            <CheckCircle2 size={16} aria-hidden="true" />
            {ar.channels.testBinding}
          </button>
        </div>

        {feedback && (
          <p
            role="status"
            className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
              feedback.ok ? 'border-success/40 bg-success/10 text-text' : 'border-error/40 bg-error/10 text-text'
            }`}
          >
            {feedback.ok ? (
              <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
            ) : (
              <CircleAlert size={14} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
            )}
            {feedback.text}
          </p>
        )}

        <ChannelCredentials
          data={{
            channelType,
            timezone: data.timezone,
            connected: data.connected,
            storageConfigured: data.credentialsStorageConfigured,
            canManage: data.canManage,
            entries: data.credentials,
          }}
        />

        {testResult && (
          <div className="rounded-lg border border-border bg-background/60 p-3">
            <ul className="space-y-1.5 text-xs">
              {testResult.checks.map((check) => (
                <li key={check.label} className="flex items-start gap-2">
                  {check.ok ? (
                    <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                  ) : (
                    <XCircle size={14} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
                  )}
                  <span className="text-text">
                    {check.label}
                    {check.detail ? <span className="text-text-muted"> — {check.detail}</span> : null}
                  </span>
                </li>
              ))}
            </ul>
            {testResult.scope && (
              <p className="mt-2 border-t border-border pt-2 text-[11px] leading-relaxed text-text-muted">
                {ar.channels.checkVerifies}: {testResult.scope} {ar.channels.noProviderSend}
              </p>
            )}
          </div>
        )}
      </div>
    </section>
  )
}
