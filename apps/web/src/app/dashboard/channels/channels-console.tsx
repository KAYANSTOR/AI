'use client'

import { useMemo, useState, useTransition } from 'react'
import { CheckCircle2, CircleAlert, Link2, Loader2, MoreHorizontal, Power, RefreshCw, Sparkles, X } from 'lucide-react'
import {
  saveChannelAction,
  setChannelActiveAction,
  testChannelAction,
  connectWhatsAppChannelAction,
} from './actions'
import { getChannelSpec, type ChannelType, type BindingTestResult } from '@/lib/channels/management'

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

const stateCopy: Record<State, { label: string; hint: string; className: string }> = {
  not_connected: {
    label: 'غير مربوطة',
    hint: 'ابدأ الربط الآن',
    className: 'border-border bg-background text-text-muted',
  },
  pending: {
    label: 'قيد التحقق',
    hint: 'تم حفظ الإعداد ونحتاج إكمال التحقق',
    className: 'border-warning/40 bg-warning/10 text-warning',
  },
  verified: {
    label: 'جاهزة',
    hint: 'الرسائل يمكن توجيهها إلى الوكيل',
    className: 'border-success/40 bg-success/10 text-success',
  },
  disabled: {
    label: 'متوقفة',
    hint: 'الربط محفوظ لكنه غير مفعّل',
    className: 'border-border bg-background text-text-muted',
  },
  error: {
    label: 'تحتاج إعادة محاولة',
    hint: 'راجع بيانات الربط ثم أعد الفحص',
    className: 'border-error/40 bg-error/10 text-error',
  },
}

const channelIntro: Record<ChannelType, string> = {
  whatsapp: 'رقم واتساب الذي يتواصل منه عملاؤك.',
  instagram: 'الحساب المهني الذي تستقبل عبره الرسائل.',
  sms: 'رقم الرسائل الذي يستقبل رسائل العملاء.',
  phone: 'رقم شركتك الحالي للمكالمات.',
}

export function ChannelsConsole({ cards, canManage }: { cards: ChannelCard[]; canManage: boolean }) {
  const [selected, setSelected] = useState<ChannelCard | null>(null)
  const [filter, setFilter] = useState<'all' | 'ready' | 'action'>('all')

  const filtered = useMemo(() => {
    if (filter === 'ready') return cards.filter((card) => stateOf(card) === 'verified')
    if (filter === 'action') return cards.filter((card) => stateOf(card) !== 'verified')
    return cards
  }, [cards, filter])

  return (
    <>
      <div className="flex flex-wrap items-center gap-2" role="tablist" aria-label="تصفية القنوات">
        {[
          { id: 'all' as const, label: 'الكل' },
          { id: 'ready' as const, label: 'الجاهزة' },
          { id: 'action' as const, label: 'تحتاج إعدادًا' },
        ].map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={filter === tab.id}
            onClick={() => setFilter(tab.id)}
            className={`min-h-10 rounded-full border px-4 text-sm font-semibold transition-colors ${
              filter === tab.id
                ? 'border-primary-dark bg-primary-dark text-white'
                : 'border-border bg-surface text-text hover:border-primary-dark hover:text-primary-dark'
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        {filtered.map((card) => (
          <ChannelTile key={card.type} card={card} canManage={canManage} onOpen={() => setSelected(card)} />
        ))}
      </div>

      {!filtered.length ? (
        <div className="rounded-2xl border border-border bg-surface p-8 text-center">
          <p className="text-sm font-semibold text-text">لا توجد قنوات ضمن هذا العرض.</p>
        </div>
      ) : null}

      {selected ? (
        <ConnectionModal card={selected} canManage={canManage} onClose={() => setSelected(null)} />
      ) : null}
    </>
  )
}

function ChannelTile({
  card,
  canManage,
  onOpen,
}: {
  card: ChannelCard
  canManage: boolean
  onOpen: () => void
}) {
  const state = stateOf(card)
  const copy = stateCopy[state]

  return (
    <article className="rounded-2xl border border-border bg-surface p-5 shadow-sm transition-shadow hover:shadow-md">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light/30 text-primary-dark">
            <Sparkles size={19} aria-hidden="true" />
          </div>
          <div className="min-w-0">
            <h2 className="text-base font-bold text-text">{card.label}</h2>
            <p className="text-xs text-text-muted">{channelIntro[card.type]}</p>
          </div>
        </div>
        <span className={`shrink-0 rounded-full border px-2.5 py-1 text-xs font-semibold ${copy.className}`}>
          {copy.label}
        </span>
      </div>

      <div className="mt-5 rounded-xl bg-background p-3">
        <p className="text-xs font-medium text-text-muted">ما الذي تحتاجه؟</p>
        <p className="mt-1 text-sm leading-6 text-text">
          {card.type === 'whatsapp'
            ? 'رقم واتساب فقط. سيحاول النظام اكتشاف معرّف الربط في الخلفية.'
            : card.type === 'instagram'
              ? 'معرّف حساب Instagram Business من Meta عند أول ربط.'
              : 'رقم Twilio المستخدم للرسائل.'}
        </p>
      </div>

      {card.publicNumber ? (
        <p className="mt-4 text-xs text-text-muted">
          {card.publicNumberLabel ?? 'الرقم'}:{' '}
          <span dir="ltr" className="font-semibold text-text">{card.publicNumber}</span>
        </p>
      ) : null}

      <div className="mt-5 flex flex-wrap gap-2">
        {canManage ? (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary-dark px-4 py-2 text-sm font-semibold text-white transition-colors hover:bg-primary"
          >
            <Link2 size={16} aria-hidden="true" />
            {state === 'verified' ? 'إدارة الربط' : state === 'pending' ? 'إكمال الربط' : 'ربط القناة'}
          </button>
        ) : null}
        {state === 'verified' || state === 'pending' || state === 'error' ? (
          <button
            type="button"
            onClick={onOpen}
            className="inline-flex min-h-11 items-center justify-center rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-background"
            aria-label={`فتح تفاصيل ${card.label}`}
          >
            <MoreHorizontal size={17} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      <p className="mt-3 text-xs leading-5 text-text-muted">{copy.hint}</p>
    </article>
  )
}

function ConnectionModal({
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
          : await saveChannelAction({
              channelType: card.type,
              identifier,
            })

      setNotice({
        ok: result.ok,
        text: result.ok
          ? result.message ?? 'تم حفظ الربط.'
          : result.error ?? 'تعذّر إكمال الربط.',
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
      const result = await setChannelActiveAction({ channelType: card.type, active: state !== 'verified' })
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
            <h2 id="channel-dialog-title" className="mt-1 text-lg font-bold text-text">{card.label}</h2>
            <p className="mt-1 text-xs leading-5 text-text-muted">{channelIntro[card.type]}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 items-center justify-center rounded-xl border border-border text-text"
            aria-label="إغلاق"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </header>

        <div className="space-y-5 p-5">
          <div className={`rounded-2xl border px-4 py-3 ${stateCopy[state].className}`}>
            <div className="flex items-start gap-2">
              {state === 'verified' ? (
                <CheckCircle2 size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
              ) : (
                <CircleAlert size={17} className="mt-0.5 shrink-0" aria-hidden="true" />
              )}
              <div>
                <p className="text-sm font-bold">{stateCopy[state].label}</p>
                <p className="mt-0.5 text-xs leading-5 opacity-90">{stateCopy[state].hint}</p>
              </div>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-3">
            <Step number="1" label="أدخل بياناتك" active={state !== 'verified'} />
            <Step number="2" label="نحفظ الربط" active={state === 'pending' || state === 'verified'} />
            <Step number="3" label="نختبره" active={state === 'verified'} />
          </div>

          <label className="block">
            <span className="text-sm font-semibold text-text">
              {card.type === 'whatsapp'
                ? 'رقم واتساب للأعمال'
                : card.type === 'instagram'
                  ? 'معرّف حساب Instagram Business'
                  : 'رقم Twilio'}
            </span>
            <span className="mt-1 block text-xs leading-5 text-text-muted">
              {card.type === 'whatsapp'
                ? 'اكتبه بصيغة دولية، مثال +967777123456. لا تحتاج نسخ phone_number_id.'
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
              {spec.setup.map((step) => <li key={step} className="list-decimal">{step}</li>)}
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
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl bg-primary-dark px-4 text-sm font-semibold text-white hover:bg-primary disabled:opacity-50"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={17} />}
                {state === 'verified' ? 'إعادة التحقق' : 'حفظ والربط'}
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
                القناة مرتبطة بنشاطك ويمكن للنظام استخدامها للتوجيه والرد. التفعيل النهائي للوكيل يبقى خاضعًا
                لاختبارات التشغيل المطلوبة.
              </p>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  )
}

function Step({ number, label, active }: { number: string; label: string; active: boolean }) {
  return (
    <div className={`rounded-xl border p-3 ${active ? 'border-primary-light bg-primary-light/20' : 'border-border bg-background'}`}>
      <p className="text-xs font-bold text-text">0{number}</p>
      <p className="mt-1 text-[11px] leading-5 text-text-muted">{label}</p>
    </div>
  )
}
