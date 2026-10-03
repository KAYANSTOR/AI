'use client'

import { useMemo, useState, useTransition } from 'react'
import { CheckCircle2, CircleAlert, Link2, Loader2, Power, RefreshCw, X } from 'lucide-react'
import {
  saveChannelAction,
  setChannelActiveAction,
  testChannelAction,
  connectWhatsAppChannelAction,
} from './actions'
import { getChannelSpec, type ChannelType, type BindingTestResult } from '@/lib/channels/management'
import { WhatsAppEmbeddedSignupButton } from '@/components/channels/whatsapp-embedded-signup'

type ChannelCard = {
  type: ChannelType
  label: string
  provider: string
  publicNumberLabel: string | null
  publicNumber: string | null
  connected: boolean
  verificationStatus: string | null
  isActive: boolean
}

type State = 'not_connected' | 'pending' | 'verified' | 'disabled' | 'error'

function stateOf(card: ChannelCard): State {
  if (!card.connected) return 'not_connected'
  if (!card.isActive || card.verificationStatus === 'disabled') return 'disabled'
  if (card.verificationStatus === 'verified') return 'verified'
  if (card.verificationStatus === 'failed') return 'error'
  return 'pending'
}

const stateCopy: Record<State, { title: string; hint: string }> = {
  not_connected: { title: 'غير مربوط', hint: 'ابدأ بالربط عبر Meta لاستقبال رسائل العملاء' },
  pending: { title: 'غير مربوط — الرقم محفوظ فقط', hint: 'أكمل الربط عبر زر Meta' },
  verified: { title: 'مربوط', hint: 'القناة جاهزة للتوجيه والرد' },
  disabled: { title: 'متوقف', hint: 'القناة موجودة لكنها غير مفعّلة' },
  error: { title: 'يحتاج إعادة محاولة', hint: 'راجع بيانات الربط ثم أعد المحاولة' },
}

export function ChannelsConsole({
  cards,
  canManage,
}: {
  cards: ChannelCard[]
  canManage: boolean
}) {
  const [openType, setOpenType] = useState<ChannelType | null>(null)
  const openCard = useMemo(() => cards.find((card) => card.type === openType) ?? null, [cards, openType])

  return (
    <div className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-2">
        {cards.map((card) => {
          const state = stateOf(card)
          return (
            <button
              key={card.type}
              type="button"
              onClick={() => setOpenType(card.type)}
              className="rounded-2xl border border-border bg-surface p-4 text-start transition-colors hover:border-primary-dark"
            >
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-base font-bold text-text">{card.label}</p>
                  <p className="mt-1 text-xs text-text-muted">{card.provider}</p>
                </div>
                <span className="rounded-full bg-background px-3 py-1 text-xs font-semibold text-text">
                  {stateCopy[state].title}
                </span>
              </div>
              {card.publicNumber ? (
                <p className="mt-3 text-sm text-text" dir="ltr">
                  {card.publicNumber}
                </p>
              ) : null}
              <p className="mt-2 text-xs leading-5 text-text-muted">{stateCopy[state].hint}</p>
            </button>
          )
        })}
      </div>

      {openCard ? (
        <ChannelDialog card={openCard} canManage={canManage} onClose={() => setOpenType(null)} />
      ) : null}
    </div>
  )
}

function ChannelDialog({
  card,
  canManage,
  onClose,
}: {
  card: ChannelCard
  canManage: boolean
  onClose: () => void
}) {
  const spec = getChannelSpec(card.type)
  const [identifier, setIdentifier] = useState(card.type === 'whatsapp' ? card.publicNumber ?? '' : '')
  const [busy, startTransition] = useTransition()
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [testResult, setTestResult] = useState<BindingTestResult | null>(null)
  const state = stateOf(card)

  if (!spec) return null

  function submit() {
    if (!canManage) return
    startTransition(async () => {
      setNotice(null)
      setTestResult(null)
      const result =
        card.type === 'whatsapp'
          ? await connectWhatsAppChannelAction({ number: identifier })
          : await saveChannelAction({ channelType: card.type, identifier })
      setNotice({
        ok: result.ok,
        text: result.ok ? result.message ?? 'تم حفظ الربط.' : result.error ?? 'تعذّر إكمال الربط.',
      })
      if (result.ok) window.location.reload()
    })
  }

  function test() {
    startTransition(async () => {
      setNotice(null)
      const result = await testChannelAction({ channelType: card.type })
      setNotice({
        ok: result.ok,
        text: result.ok ? 'تم اجتياز فحص الربط.' : result.error ?? 'فشل الفحص.',
      })
      setTestResult(result.result ?? null)
    })
  }

  function toggle() {
    startTransition(async () => {
      setNotice(null)
      const result = await setChannelActiveAction({
        channelType: card.type,
        active: state === 'disabled',
      })
      setNotice({
        ok: result.ok,
        text: result.ok ? result.message ?? 'تم التحديث.' : result.error ?? 'تعذّر التحديث.',
      })
      if (result.ok) window.location.reload()
    })
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4" role="presentation">
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="channel-dialog-title"
        className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-3xl border border-border bg-surface shadow-2xl"
      >
        <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface px-5 py-4">
          <div>
            <p className="text-xs font-semibold text-primary-dark">Kayan Connect</p>
            <h2 id="channel-dialog-title" className="mt-1 text-lg font-bold text-text">
              {card.label}
            </h2>
            <p className="mt-1 text-xs leading-5 text-text-muted">{stateCopy[state].hint}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-full border border-border p-2 text-text hover:bg-background"
            aria-label="إغلاق"
          >
            <X size={18} />
          </button>
        </header>

        <div className="space-y-4 px-5 py-5">
          {card.type === 'whatsapp' && state !== 'verified' ? (
            <div className="space-y-2">
              <WhatsAppEmbeddedSignupButton
                disabled={!canManage}
                onSuccess={(message) => {
                  setNotice({ ok: true, text: message })
                  window.location.reload()
                }}
                onError={(message) => setNotice({ ok: false, text: message })}
              />
              <p className="text-xs leading-5 text-text-muted">
                الربط الفعلي يتم من زر Meta فقط. حفظ الرقم وحده لا يستقبل رسائل العملاء.
              </p>
            </div>
          ) : null}

          <label className="block">
            <span className="text-sm font-semibold text-text">
              {card.type === 'whatsapp'
                ? 'رقم واتساب للأعمال (اختياري قبل الربط)'
                : card.type === 'instagram'
                  ? 'معرّف حساب Instagram Business'
                  : 'رقم Twilio'}
            </span>
            <span className="mt-1 block text-xs leading-5 text-text-muted">
              {card.type === 'whatsapp'
                ? 'احفظ الرقم للمرجع فقط. الربط الرسمي عبر زر Meta أعلاه.'
                : card.type === 'instagram'
                  ? 'يُستخدم فقط لإنشاء الربط؛ لن نعرضه في الصفحة بعد الحفظ.'
                  : 'اكتبه بصيغة دولية مثل +12025550123.'}
            </span>
            <input
              value={identifier}
              onChange={(event) => setIdentifier(event.target.value)}
              dir="ltr"
              autoComplete="off"
              inputMode={card.type === 'whatsapp' || card.type === 'sms' ? 'tel' : 'numeric'}
              placeholder={card.type === 'whatsapp' ? '+967777123456' : spec.bindingPlaceholder}
              className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-text outline-none focus:border-primary-dark focus:ring-2 focus:ring-primary-light"
              disabled={busy || !canManage}
            />
          </label>

          <div className="rounded-2xl border border-border bg-background p-4">
            <div className="flex items-center justify-between gap-3">
              <p className="text-sm font-bold text-text">مساعدة الربط</p>
              <span className="text-xs font-medium text-text-muted">{card.provider}</span>
            </div>
            <ol className="mt-3 space-y-2 ps-5 text-xs leading-6 text-text-muted">
              {spec.setup.map((step) => (
                <li key={step} className="list-decimal">
                  {step}
                </li>
              ))}
            </ol>
          </div>

          {notice ? (
            <p
              role="status"
              className={
                notice.ok
                  ? 'rounded-xl border border-success/40 bg-success/10 px-4 py-3 text-sm text-text'
                  : 'rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-text'
              }
            >
              {notice.text}
            </p>
          ) : null}

          {testResult ? (
            <div className="rounded-2xl border border-border bg-surface p-4">
              <p className="text-sm font-bold text-text">نتيجة الفحص</p>
              <ul className="mt-3 space-y-2 text-xs">
                {testResult.checks.map((check) => (
                  <li key={check.label} className="flex items-start gap-2">
                    {check.ok ? (
                      <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                    ) : (
                      <CircleAlert size={14} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
                    )}
                    <span className="text-text">
                      {check.label}
                      {check.detail ? <span className="text-text-muted"> — {check.detail}</span> : null}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          <div className="flex flex-col gap-2 sm:flex-row sm:flex-wrap">
            {canManage ? (
              <button
                type="button"
                onClick={submit}
                disabled={busy || !identifier.trim()}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-text hover:bg-surface disabled:opacity-50"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={17} />}
                {state === 'verified'
                  ? 'إعادة التحقق'
                  : card.type === 'whatsapp'
                    ? 'حفظ الرقم فقط'
                    : 'حفظ والربط'}
              </button>
            ) : null}
            {state !== 'not_connected' ? (
              <>
                <button
                  type="button"
                  onClick={test}
                  disabled={busy}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-background disabled:opacity-50"
                >
                  {busy ? <Loader2 size={17} className="animate-spin" /> : <RefreshCw size={17} />}
                  فحص الربط
                </button>
                <button
                  type="button"
                  onClick={toggle}
                  disabled={busy || !canManage}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-background disabled:opacity-50"
                >
                  <Power size={17} />
                  {state === 'disabled' ? 'تفعيل' : 'إيقاف'}
                </button>
              </>
            ) : null}
          </div>

          {state === 'verified' ? (
            <div className="rounded-2xl border border-success/30 bg-success/5 p-4">
              <p className="text-sm font-bold text-text">القناة جاهزة</p>
              <p className="mt-1 text-xs leading-5 text-text-muted">
                القناة مرتبطة بنشاطك ويمكن للنظام استخدامها للتوجيه والرد.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
