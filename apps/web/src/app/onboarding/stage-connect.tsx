'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ArrowLeft, AtSign, CheckCircle2, Loader2, MessageCircle, Phone, Clock } from 'lucide-react'
import { connectWhatsAppAction } from './actions'
import { CONNECTION_STATE_LABELS, type ChannelConnectionState } from '@/lib/channels/connect'

export type ConnectStageData = {
  whatsapp: { state: ChannelConnectionState; number: string | null } | null
  phone: {
    state: ChannelConnectionState
    publicNumber: string | null
    forwardingStatus: string | null
  } | null
}

/**
 * Stage 2 — وصّل نشاطك.
 *
 * WhatsApp is the primary path and the only filled button on the screen. The customer types
 * their own number; no provider identifier is ever requested. Voice and Instagram are
 * visible as planned-but-optional so nobody wonders where they are.
 */
export function StageConnect({
  data,
  publicPhone,
  canManage,
  onContinue,
  onRefresh,
}: {
  data: ConnectStageData
  publicPhone: string | null
  canManage: boolean
  onContinue: () => void
  onRefresh: () => void
}) {
  const [phoneNumber, setPhoneNumber] = useState(publicPhone ?? '')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)

  const whatsapp = data.whatsapp
  const whatsappState = whatsapp?.state ?? 'not_connected'
  const connected = whatsappState === 'verified' || whatsappState === 'pending'

  async function handleConnect() {
    setBusy(true)
    setError(null)
    setNotice(null)
    const result = await connectWhatsAppAction({ phoneNumber })
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'لم يكتمل ربط واتساب. اضغط «إعادة المحاولة» لإكمال الربط.')
      return
    }
    setNotice(result.message ?? 'تم ربط واتساب.')
    // The server re-reads the channel row; refreshing the shell shows the new state in
    // the same place, so a failed verification is retryable without leaving the stage.
    onRefresh()
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-text sm:text-2xl">وصّل نشاطك</h1>
        <p className="text-sm leading-6 text-text-muted">
          سنربط رقم نشاطك بالقنوات التي يتواصل معك العملاء من خلالها. WhatsApp هي الأهم، والباقي اختياري.
        </p>
      </div>

      {/* WhatsApp — the one primary action of this stage. */}
      <section className="rounded-2xl border border-border bg-background p-5">
        <header className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-success/15 text-success">
            <MessageCircle size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text">WhatsApp</h2>
            <p className="mt-0.5 text-xs leading-5 text-text-muted">
              اكتب رقم واتساب للأعمال الذي يستخدمه نشاطك. سنتولّى الربط والتحقق.
            </p>
          </div>
          {whatsappState === 'verified' ? (
            <span className="ms-auto shrink-0 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
              {CONNECTION_STATE_LABELS[whatsappState]}
            </span>
          ) : whatsappState === 'pending' ? (
            <span className="ms-auto shrink-0 rounded-full bg-warning/15 px-3 py-1 text-xs font-semibold text-warning">
              {CONNECTION_STATE_LABELS[whatsappState]}
            </span>
          ) : null}
        </header>

        {whatsapp?.number ? (
          <p className="mt-3 text-sm text-text">
            الرقم المربوط: <span dir="ltr" className="font-medium">{whatsapp.number}</span>
          </p>
        ) : null}

        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <input
            value={phoneNumber}
            onChange={(event) => setPhoneNumber(event.target.value)}
            placeholder="+967777123456"
            dir="ltr"
            inputMode="tel"
            disabled={!canManage}
            aria-label="رقم واتساب للأعمال"
            className="min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-text outline-none transition-colors focus:border-primary-dark focus:ring-2 focus:ring-primary-light disabled:opacity-60 sm:flex-1"
          />
          <button
            type="button"
            onClick={handleConnect}
            disabled={busy || !canManage}
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary-dark px-6 text-base font-semibold text-white transition-colors hover:bg-primary disabled:opacity-60"
          >
            {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
            {whatsappState === 'verified'
              ? 'تحديث الربط'
              : whatsappState === 'pending'
                ? 'إعادة المحاولة'
                : 'ربط WhatsApp'}
          </button>
        </div>

        {whatsappState === 'pending' ? (
          <p className="mt-3 flex items-start gap-2 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-text">
            <Clock size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
            حفظنا رقمك، ولم يكتمل التحقق من واتساب بعد. اضغط «إعادة المحاولة» لإكمال الربط.
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-sm text-text">
            {error}
          </p>
        ) : null}
        {notice ? (
          <p role="status" className="mt-3 rounded-lg border border-success/40 bg-success/10 px-3 py-2 text-sm text-text">
            {notice}
          </p>
        ) : null}

        {canManage && whatsappState === 'verified' && whatsapp?.number ? (
          <details className="mt-3">
            <summary className="cursor-pointer text-xs text-text-muted">تفاصيل متقدمة</summary>
            <p className="mt-2 text-xs leading-5 text-text-muted">
              يُستخدم هذا الرقم لربط رسائل العملاء بنشاطك. لإدارة الربط أو تغييره لاحقاً، افتح{' '}
              <Link href="/dashboard/channels" className="font-medium text-primary-dark underline">
                صفحة القنوات
              </Link>
              .
            </p>
          </details>
        ) : null}
      </section>

      {/* Voice — optional, planned, one click away later. */}
      <section className="rounded-2xl border border-border bg-background p-5">
        <header className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary-light/30 text-primary-dark">
            <Phone size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text">المكالمات</h2>
            <p className="mt-0.5 text-xs leading-5 text-text-muted">
              استقبل المكالمات عبر وكيل صوتي دون تغيير رقمك الحالي (تحويل المكالمات). اختياري، ويمكن تفعيله لاحقاً.
            </p>
          </div>
          {data.phone?.state === 'verified' ? (
            <span className="ms-auto shrink-0 rounded-full bg-success/15 px-3 py-1 text-xs font-semibold text-success">
              {CONNECTION_STATE_LABELS.verified}
            </span>
          ) : (
            <span className="ms-auto shrink-0 rounded-full bg-surface px-3 py-1 text-xs font-medium text-text-muted">
              اختياري
            </span>
          )}
        </header>
        {data.phone?.publicNumber ? (
          <p className="mt-3 text-sm text-text">
            رقمك الحالي: <span dir="ltr" className="font-medium">{data.phone.publicNumber}</span>
          </p>
        ) : null}
      </section>

      {/* Instagram — optional. */}
      <section className="rounded-2xl border border-border bg-background p-5">
        <header className="flex items-start gap-3">
          <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-surface text-text-muted">
            <AtSign size={22} aria-hidden="true" />
          </span>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text">Instagram</h2>
            <p className="mt-0.5 text-xs leading-5 text-text-muted">
              اختياري تماماً. اربطه لاحقاً من صفحة القنوات إذا كان عملاؤك يراسلونك هناك.
            </p>
          </div>
        </header>
      </section>

      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-text-muted">
          {connected
            ? 'يمكنك المتابعة، وسيطلب التشغيل اكتمال التحقق من القناة.'
            : 'يمكنك المتابعة الآن، لكن لن يستقبل الوكيل عملاءه قبل ربط قناة واحدة.'}
        </p>
        <button
          type="button"
          onClick={onContinue}
          disabled={!canManage}
          className={`inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl px-6 text-base font-semibold transition-colors disabled:opacity-60 sm:w-auto ${
            connected
              ? 'bg-primary-dark text-white hover:bg-primary'
              : 'border border-border bg-background text-text hover:border-primary-dark hover:text-primary-dark'
          }`}
        >
          {connected ? null : <CheckCircle2 size={18} aria-hidden="true" />}
          متابعة
          <ArrowLeft size={18} aria-hidden="true" />
        </button>
      </div>
    </div>
  )
}
