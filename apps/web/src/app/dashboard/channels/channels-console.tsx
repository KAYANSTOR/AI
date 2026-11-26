'use client'

import { KayanSelect } from '@/components/ui/kayan-select'
import { useCallback, useMemo, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { useHistoryDismiss } from '@/hooks/use-history-dismiss'
import { CheckCircle2, CircleAlert, Link2, Loader2, MessageSquare, Power, RefreshCw, ArrowRight, Bot, MessageCircle } from 'lucide-react'
import {
  saveChannelAction,
  setChannelActiveAction,
  testChannelAction,
  connectWhatsAppChannelAction,
  connectTelegramChannelAction,
  completeMessengerConnectionAction,
  deleteChannelAction,
} from './actions'
import { getChannelSpec, type ChannelType, type BindingTestResult } from '@/lib/channels/management'
import { WhatsAppEmbeddedSignupButton } from '@/components/channels/whatsapp-embedded-signup'
import { WhatsAppQrConnector } from './whatsapp-qr-connector'
import { MessengerConnectButton } from '@/components/channels/messenger-connect-button'
import { registerWhatsAppCloudApiNumberAction } from '@/app/onboarding/embedded-signup-actions'
import { ChannelCard as UIChannelCard, type ChannelStatus } from '@/components/ui/channel-card'

type ChannelCard = {
  key: string
  type: ChannelType
  label: string
  provider: string
  description: string
  publicNumberLabel: string | null
  publicNumber: string | null
  identifier?: string | null
  connected: boolean
  verificationStatus: string | null
  isActive: boolean
  connectionMode: string | null
}

type State = 'not_connected' | 'pending' | 'verified' | 'disabled' | 'error'

function stateOf(card: ChannelCard): State {
  if (!card.connected) return 'not_connected'
  if (card.verificationStatus === 'pending') return 'pending'
  if (!card.isActive || card.verificationStatus === 'disabled') return 'disabled'
  if (card.verificationStatus === 'verified') return 'verified'
  if (card.verificationStatus === 'failed') return 'error'
  return 'pending'
}

const stateCopy: Record<State, { title: string; hint: string }> = {
  not_connected: { title: 'غير مربوط', hint: 'ابدأ بالربط عبر Meta لاستقبال رسائل العملاء' },
  pending: { title: 'إعداد WhatsApp غير مكتمل', hint: 'اربط الرقم عبر Meta ثم أكمل تسجيل Cloud API باستخدام PIN من 6 أرقام' },
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
  const router = useRouter()
  const [openKey, setOpenKey] = useState<string | null>(null)
  const [busyKey, setBusyKey] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const openCard = useMemo(() => cards.find((card) => card.key === openKey) ?? null, [cards, openKey])
  const closeDialog = useCallback(() => setOpenKey(null), [])
  // Back closes the channel settings view instead of leaving the page.
  useHistoryDismiss(Boolean(openCard), closeDialog)

  if (openCard) return <ChannelDialog card={openCard} canManage={canManage} onClose={closeDialog} />

  return (
    <div className="space-y-6">
      {notice ? <p role="status" className="rounded-xl border border-border bg-surface px-4 py-3 text-sm text-text">{notice}</p> : null}
      <section aria-labelledby="whatsapp-channel-options-title" className="space-y-3">
        <div>
          <h2 id="whatsapp-channel-options-title" className="text-base font-bold text-text">قنوات واتساب</h2>
          <p className="mt-1 text-xs leading-6 text-text-muted">اختر طريقة الربط المناسبة. لكل بطاقة اتصال وإعدادات وحالة مستقلة.</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.filter((card) => card.type === 'whatsapp').map((card) => {
            const state = stateOf(card)
            const status: ChannelStatus =
              state === 'verified' ? 'connected' : state === 'pending' || state === 'error' ? 'needsSetup' : 'disconnected'
            return (
              <UIChannelCard
                key={card.key}
                name={card.label}
                description={card.publicNumber ? `${card.publicNumber} · ${card.provider}` : card.description}
                status={status}
                icon={<MessageCircle className="h-6 w-6" aria-hidden="true" />}
                iconBg="bg-[#25D366]"
                actionLabel={state === 'verified' ? 'إدارة الاتصال' : state === 'pending' ? 'استكمال الربط' : 'إعداد هذه الطريقة'}
                onAction={() => setOpenKey(card.key)}
              />
            )
          })}
        </div>
      </section>

      <section aria-labelledby="channels-active-title" className="space-y-3">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 id="channels-active-title" className="text-base font-bold text-text">نشطة الآن</h2>
            <p className="mt-1 text-xs text-text-muted">القنوات المربوطة بنشاطك التجاري</p>
          </div>
          <span className="rounded-full border border-success/30 bg-success/10 px-3 py-1 text-xs font-semibold text-success">
            {cards.filter((card) => card.type !== 'whatsapp' && card.connected && card.verificationStatus === 'verified' && card.isActive).length} نشطة
          </span>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
        {cards.filter((card) => card.type !== 'whatsapp' && card.connected && card.verificationStatus === 'verified').map((card) => {
          const state = stateOf(card)
          const status: ChannelStatus =
            state === 'verified' ? 'connected' : state === 'pending' || state === 'error' ? 'needsSetup' : 'disconnected'

          const getChannelIcon = () => {
            if (card.type === 'whatsapp') {
              return (
                <svg className="h-6 w-6 fill-current" viewBox="0 0 24 24" aria-hidden="true">
                  <path d="M12.04 2c-5.46 0-9.91 4.45-9.91 9.91 0 1.75.46 3.45 1.32 4.95L2.05 22l5.25-1.38c1.45.79 3.08 1.21 4.74 1.21 5.46 0 9.91-4.45 9.91-9.91 0-2.65-1.03-5.14-2.9-7.01A9.816 9.816 0 0012.04 2zm5.78 14.07c-.24.68-1.4 1.25-1.93 1.33-.51.07-1.18.1-3.41-.83-2.85-1.18-4.69-4.08-4.83-4.27-.14-.19-1.16-1.54-1.16-2.94 0-1.4.73-2.09 1-2.37.26-.28.57-.35.76-.35.19 0 .38 0 .55.01.18.01.42-.07.65.49.24.57.82 2 .89 2.15.07.15.12.33.02.53-.1.19-.15.31-.3.49-.15.17-.32.39-.46.52-.15.15-.31.31-.13.62.18.31.79 1.3 1.7 2.11 1.17 1.04 2.15 1.36 2.46 1.51.31.15.49.13.67-.08.18-.21.78-.91.99-1.22.21-.31.42-.26.71-.15.29.11 1.83.86 2.14 1.02.31.15.52.23.6.36.08.13.08.77-.16 1.45z" />
                </svg>
              )
            }
            if (card.type === 'messenger') return <MessageCircle className="h-6 w-6" aria-hidden="true" />
            return <MessageSquare className="h-6 w-6" aria-hidden="true" />
          }

          const iconBg = card.type === 'whatsapp' ? 'bg-[#25D366]' : card.type === 'messenger' ? 'bg-[#0866FF]' : 'bg-primary'

          const toggleChannel = async () => {
            if (!canManage || busyKey) return
            setBusyKey(card.key)
            const result = await setChannelActiveAction({ channelType: card.type, active: !card.isActive, connectionMode: card.connectionMode })
            setNotice(result.ok ? (result.message ?? 'تم تحديث حالة القناة.') : (result.error ?? 'تعذّر تحديث القناة.'))
            setBusyKey(null)
            if (result.ok) router.refresh()
          }

          return (
            <div key={card.key} className="space-y-2">
              <UIChannelCard
              key={card.key}
              name={card.label}
              description={card.publicNumber ? `${card.publicNumber} · ${card.provider}` : card.description}
              status={status}
              icon={getChannelIcon()}
              iconBg={iconBg}
              actionLabel={state === 'verified' ? 'إدارة القناة' : state === 'pending' ? 'استكمال الربط' : state === 'disabled' ? 'إعادة تفعيل القناة' : 'ربط القناة'}
              onAction={() => setOpenKey(card.key)}
            />
              <div className="flex items-center justify-between rounded-xl border border-border bg-surface px-4 py-3">
                <span className="text-xs text-text-muted">{state === 'verified' && card.isActive ? 'الرد والتوجيه مفعّلان' : state === 'disabled' ? 'القناة متوقفة' : 'تحتاج إلى إكمال الإعداد'}</span>
                <button
                  type="button"
                  role="switch"
                  aria-checked={card.isActive}
                  aria-label={card.isActive ? 'إيقاف القناة' : 'تفعيل القناة'}
                  disabled={!canManage || busyKey === card.key || state === 'pending' || state === 'error' || state === 'not_connected'}
                  onClick={toggleChannel}
                  className={`relative inline-flex h-7 w-12 items-center rounded-full transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${card.isActive ? 'bg-success' : 'bg-border-strong'}`}
                >
                  <span className={`inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform ${card.isActive ? 'translate-x-1' : 'translate-x-6'}`} />
                </button>
              </div>
            </div>
          )
        })}
        </div>
      </section>

      <section aria-labelledby="channels-available-title" className="space-y-3">
        <div>
          <h2 id="channels-available-title" className="text-base font-bold text-text">متاحة للربط</h2>
          <p className="mt-1 text-xs text-text-muted">اختر قناة لإكمال إعدادها وربطها بحسابك</p>
        </div>
        <div className="grid gap-3 sm:grid-cols-2">
          {cards.filter((card) => card.type !== 'whatsapp' && (!card.connected || card.verificationStatus !== 'verified')).map((card) => {
            const state = stateOf(card)
            const getIcon = () => card.type === 'messenger' ? <MessageCircle className="h-6 w-6" aria-hidden="true" /> : <MessageSquare className="h-6 w-6" aria-hidden="true" />
            return (
              <UIChannelCard
                key={card.key}
                name={card.label}
                description={getChannelSpec(card.type)?.bindingHint ?? stateCopy[state].hint}
                status={state === 'pending' || state === 'error' ? 'needsSetup' : 'disconnected'}
                icon={getIcon()}
                iconBg={card.type === 'messenger' ? 'bg-[#0866FF]' : 'bg-primary'}
                actionLabel="إعداد القناة"
                onAction={() => setOpenKey(card.key)}
              />
            )
          })}
        </div>
      </section>

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
  const router = useRouter()
  const spec = getChannelSpec(card.type)
  const [identifier, setIdentifier] = useState(card.identifier ?? card.publicNumber ?? '')
  const [publicNumber, setPublicNumber] = useState(card.publicNumber ?? '')
  const [busy, startTransition] = useTransition()
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null)
  const [testResult, setTestResult] = useState<BindingTestResult | null>(null)
  const [registrationPin, setRegistrationPin] = useState('')
  const [telegramBotToken, setTelegramBotToken] = useState('')
  const [messengerPages, setMessengerPages] = useState<Array<{ id: string; name: string }>>([])
  const [selectedMessengerPage, setSelectedMessengerPage] = useState('')
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
          : card.type === 'telegram'
            ? await connectTelegramChannelAction({ botToken: telegramBotToken })
            : await saveChannelAction({ channelType: card.type, identifier, publicNumber })
      setNotice({
        ok: result.ok,
        text: result.ok ? result.message ?? 'تم حفظ الربط.' : result.error ?? 'تعذّر إكمال الربط.',
      })
      if (result.ok) router.refresh()
    })
  }

  function removeChannel() {
    if (!canManage || !card.connected) return
    const confirmed = window.confirm('هل تريد حذف إعدادات هذه القناة؟ سيتم فصل اتصال QR إن وجد، ويمكنك ربط الرقم أو الحساب الصحيح من جديد.')
    if (!confirmed) return
    startTransition(async () => {
      setNotice(null)
      const result = await deleteChannelAction({
        channelType: card.type,
        connectionMode: card.connectionMode,
      })
      setNotice({
        ok: result.ok,
        text: result.ok ? result.message ?? 'تم حذف إعدادات القناة.' : result.error ?? 'تعذّر حذف إعدادات القناة.',
      })
      if (result.ok) router.refresh()
    })
  }

  function test() {
    startTransition(async () => {
      setNotice(null)
      setTestResult(null)
      try {
        const result = await testChannelAction({ channelType: card.type, connectionMode: card.connectionMode })
        setNotice({
          ok: result.ok,
          text: result.ok ? 'تم اجتياز فحص الربط.' : result.error ?? 'فشل الفحص.',
        })
        setTestResult(result.result ?? null)
      } catch (error) {
        console.error('Channel connection test request failed', error)
        setNotice({
          ok: false,
          text: 'تعذّر إكمال طلب الفحص. بقيت صفحة القنوات مفتوحة؛ تحقق من الاتصال ثم أعد المحاولة.',
        })
      }
    })
  }

  function toggle() {
    startTransition(async () => {
      setNotice(null)
      const result = await setChannelActiveAction({
        channelType: card.type,
        active: state === 'disabled',
        connectionMode: card.connectionMode,
      })
      setNotice({
        ok: result.ok,
        text: result.ok ? result.message ?? 'تم التحديث.' : result.error ?? 'تعذّر التحديث.',
      })
      if (result.ok) router.refresh()
    })
  }

  function registerWhatsAppNumber() {
    if (!canManage || card.type !== 'whatsapp') return
    if (!/^\d{6}$/.test(registrationPin)) {
      setNotice({ ok: false, text: 'أدخل PIN التحقق بخطوتين المكوّن من 6 أرقام.' })
      return
    }
    startTransition(async () => {
      setNotice(null)
      const result = await registerWhatsAppCloudApiNumberAction({ pin: registrationPin })
      setNotice({
        ok: result.ok,
        text: result.ok ? result.message ?? 'تم تسجيل رقم الإرسال.' : result.error ?? 'تعذّر تسجيل رقم الإرسال.',
      })
      if (result.ok) {
        setRegistrationPin('')
        router.refresh()
      }
    })
  }

  return (
    <main className="mx-auto w-full max-w-4xl space-y-6">
      <div className="overflow-hidden rounded-3xl border border-border bg-surface shadow-sm">
        <header className="flex items-start gap-3 border-b border-border bg-surface px-5 py-5 sm:px-7">
          <div>
            <p className="text-xs font-semibold text-secondary">إعدادات القنوات</p>
            <h1 id="channel-dialog-title" className="mt-1 text-2xl font-bold text-text">
              {card.type === 'whatsapp'
                ? card.connectionMode === 'coexistence'
                  ? 'إعداد واتساب الأعمال عبر Meta'
                  : card.connectionMode === 'cloud_api'
                    ? 'إعداد واتساب العادي عبر Meta'
                    : 'إعداد واتساب عبر QR أو رقم الهاتف'
                : card.type === 'telegram' ? 'إعدادات تيليجرام' : card.type === 'messenger' ? 'إعدادات Facebook Messenger' : `إعدادات ${card.label}`}
            </h1>
            <p className="mt-2 inline-flex items-center gap-2 rounded-full border border-border bg-background px-3 py-1 text-xs font-semibold text-text-muted">
              <span className={`h-2 w-2 rounded-full ${state === 'verified' ? 'bg-success' : 'bg-text-muted'}`} />
              {state === 'verified' ? 'متصل' : 'غير متصل'}
            </p>
            <p className="mt-3 text-sm leading-6 text-text-muted">
              {card.type === 'telegram'
                ? 'اربط بوت تيليجرام ليرد مساعدك على الرسائل التي يرسلها العملاء إليه.'
                : card.type === 'whatsapp'
                  ? card.connectionMode === 'coexistence'
                    ? 'اربط WhatsApp Business App عبر Meta مع الاستمرار في استخدام التطبيق على الهاتف.'
                    : card.connectionMode === 'cloud_api'
                      ? 'اربط WhatsApp Cloud API من Meta دون دمج هذا الاتصال مع بطاقة QR أو بطاقة WhatsApp Business App.'
                      : 'اربط جهاز واتساب من هاتفك عبر QR أو رمز الربط برقم الهاتف.'
                  : stateCopy[state].hint}
            </p>
          </div>
          <button type="button" onClick={onClose} className="inline-flex shrink-0 items-center gap-2 rounded-xl border border-border px-3 py-2 text-sm font-semibold text-text hover:bg-background" aria-label="العودة إلى القنوات">
            <ArrowRight size={17} /> رجوع
          </button>
        </header>

        <div className="space-y-6 px-5 py-6 sm:px-7">
          {card.type === 'whatsapp' && card.connectionMode !== 'qr_unofficial' ? (
            <section className="space-y-3 rounded-2xl border border-border bg-background p-4">
              <div>
                <h2 className="text-sm font-bold text-text">
                  {card.connectionMode === 'coexistence' ? 'الربط عبر WhatsApp Business App' : 'الربط عبر WhatsApp Cloud API'}
                </h2>
                <p className="mt-1 text-xs leading-6 text-text-muted">
                  {card.connectionMode === 'coexistence'
                    ? 'هذا المسار مخصص لرقم يعمل في تطبيق WhatsApp Business، مع إبقاء التطبيق متاحاً على الهاتف.'
                    : 'هذا المسار مخصص لربط رقم WhatsApp Cloud API مباشرة. إذا كان الرقم مستخدماً في تطبيق واتساب، فقد تطلب Meta نقله إلى منصة الأعمال قبل إكمال الإعداد.'}
                </p>
              </div>
              <WhatsAppEmbeddedSignupButton
                mode={card.connectionMode === 'coexistence' ? 'coexistence' : 'cloud_api'}
                disabled={!canManage}
                onSuccess={(message) => {
                  setNotice({ ok: true, text: message })
                  router.refresh()
                }}
                onError={(message) => setNotice({ ok: false, text: message })}
              />
            </section>
          ) : null}

          {card.type === 'whatsapp' && card.connectionMode === 'qr_unofficial' ? (
            <WhatsAppQrConnector disabled={!canManage} connectionMode={card.connectionMode} publicNumber={card.publicNumber} />
          ) : null}

          {card.type === 'whatsapp' && card.connected && card.connectionMode === 'coexistence' ? (
            <section className="space-y-2 rounded-2xl border border-success/30 bg-success/5 p-4">
              <h3 className="text-sm font-bold text-text">الاستمرار باستخدام تطبيق WhatsApp Business</h3>
              <p className="text-xs leading-6 text-text-muted">
                أكدت Meta أن الرقم مسجل في Cloud API وما زال يعمل في تطبيق WhatsApp Business.
                لا تستخدم تسجيل الرقم التقليدي ولا تدخل PIN لهذا الاتصال.
              </p>
            </section>
          ) : null}

          {card.type === 'whatsapp' && card.connected && card.connectionMode === 'cloud_api' && state !== 'verified' ? (
            <section className="space-y-3 rounded-2xl border border-warning/40 bg-warning/5 p-4">
              <div>
                <h3 className="text-sm font-bold text-text">تسجيل رقم الإرسال على WhatsApp</h3>
                <p className="mt-1 text-xs leading-6 text-text-muted">
                  تفويض Meta وربط الرقم لا يُكملان تسجيله للإرسال تلقائياً. أدخل PIN التحقق بخطوتين الحالي للرقم.
                  هذا ليس رمز SMS. إذا لم تُنشئ PIN لهذا الرقم من قبل، اختر رمزاً جديداً من 6 أرقام واحتفظ به،
                  لأن Meta ستعتمده للتحقق بخطوتين.
                </p>
              </div>
              <div className="flex flex-col gap-2 sm:flex-row">
                <input
                  type="password"
                  value={registrationPin}
                  onChange={(event) => setRegistrationPin(event.target.value.replace(/\D/g, '').slice(0, 6))}
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={6}
                  dir="ltr"
                  placeholder="••••••"
                  aria-label="رمز PIN المكوّن من 6 أرقام"
                  disabled={busy || !canManage}
                  className="min-h-12 w-full rounded-xl border border-border bg-background px-3 text-center text-lg tracking-[0.35em] text-text outline-none focus:border-secondary focus:ring-2 focus:ring-accent/40 sm:max-w-52"
                />
                <button
                  type="button"
                  onClick={registerWhatsAppNumber}
                  disabled={busy || !canManage || registrationPin.length !== 6}
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary-dark px-5 text-sm font-semibold text-primary-foreground hover:bg-primary disabled:opacity-50"
                >
                  {busy ? <Loader2 size={18} className="animate-spin" /> : <CheckCircle2 size={17} />}
                  إكمال تسجيل الرقم
                </button>
              </div>
              <p className="text-[11px] leading-5 text-text-muted">
                لا يُحفظ هذا الرمز في Kayan AI؛ يُرسل إلى Meta لإكمال التسجيل فقط.
                استخدم هذا الإجراء إذا ظهر لك الخطأ 133010 أو إذا كان الرقم جديداً.
              </p>
            </section>
          ) : null}

          {card.type === 'messenger' ? (
            <section className="space-y-5">
              <div className="rounded-2xl border border-border bg-background p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#0866FF]/10 text-[#0866FF]"><MessageCircle size={24} /></span>
                  <div><h2 className="text-base font-bold text-text">ربط صفحة Facebook</h2><p className="mt-1 text-xs leading-6 text-text-muted">سجّل الدخول بالحساب الذي يدير الصفحة ووافق على صلاحيات الرسائل وWebhooks.</p></div>
                </div>
                <ul className="mt-4 space-y-2 text-xs leading-6 text-text-muted">
                  <li>اختر صفحة واحدة لربطها بصندوق الوارد.</li>
                  <li>لا نطلب كلمة مرور Facebook؛ التفويض يتم من نافذة Meta الرسمية.</li>
                  <li>يُحفظ رمز الصفحة مشفّراً على الخادم ولا يصل إلى المتصفح.</li>
                </ul>
              </div>
              <MessengerConnectButton disabled={!canManage || busy}
                onPages={(pages) => { setMessengerPages(pages); setSelectedMessengerPage(pages[0]?.id ?? ''); setNotice({ok:true,text:'تم التفويض. اختر الصفحة التي تريد ربطها.'}) }}
                onError={(message) => setNotice({ok:false,text:message})} />
              {messengerPages.length > 0 ? (
                <div className="space-y-3 rounded-2xl border border-border bg-background p-4">
                  <label className="block"><span className="text-sm font-semibold text-text">صفحة Facebook</span>
                    <KayanSelect value={selectedMessengerPage} onChange={(event)=>setSelectedMessengerPage(event.target.value)} disabled={busy}
                      className="mt-2 min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text">
                      {messengerPages.map(page=><option key={page.id} value={page.id}>{page.name}</option>)}
                    </KayanSelect>
                  </label>
                  <button type="button" onClick={()=>startTransition(async()=>{
                    setNotice(null)
                    const result=await completeMessengerConnectionAction({pageId:selectedMessengerPage})
                    setNotice({ok:result.ok,text:result.ok?result.message??'تم ربط الصفحة.':result.error??'تعذّر ربط الصفحة.'})
                    if(result.ok)router.refresh()
                  })} disabled={busy||!canManage||!selectedMessengerPage}
                    className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#0866FF] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
                    {busy?<Loader2 size={18} className="animate-spin"/>:<Link2 size={17}/>} تأكيد ربط الصفحة
                  </button>
                </div>
              ):null}
              <p className="text-xs leading-5 text-text-muted">يتطلب الربط صلاحيات Meta ‏pages_show_list وpages_messaging وpages_manage_metadata. وقد تتطلب إتاحته لجميع العملاء مراجعة Meta.</p>
            </section>
          ) : card.type === 'telegram' ? (
            <section className="space-y-5">
              <div className="rounded-2xl border border-border bg-background p-5">
                <div className="flex items-center gap-3">
                  <span className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[#229ED9]/10 text-[#229ED9]"><Bot size={24} /></span>
                  <div><h2 className="text-base font-bold text-text">أنشئ البوت في تيليجرام</h2><p className="mt-1 text-xs text-text-muted">اتبع الخطوات التالية للحصول على مفتاح الربط</p></div>
                </div>
                <ol className="mt-5 space-y-4 text-sm leading-6 text-text">
                  <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">1</span><span>افتح <bdi dir="ltr" className="font-semibold">@BotFather</bdi> في تيليجرام وأرسل <code dir="ltr">/newbot</code>.</span></li>
                  <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">2</span><span>اختر اسمًا ومعرّفًا للبوت.</span></li>
                  <li className="flex gap-3"><span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-primary/10 text-xs font-bold text-primary">3</span><span>انسخ المفتاح الذي يرسله إليك والصقه أدناه.</span></li>
                </ol>
                <a href="https://t.me/BotFather" target="_blank" rel="noopener noreferrer" className="mt-5 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-[#229ED9] px-4 text-sm font-bold text-white hover:opacity-90">
                  <Bot size={18} /> إنشاء البوت في BotFather
                </a>
              </div>
              <label className="block">
                <span className="text-sm font-semibold text-text">مفتاح البوت</span>
                <input
                  type="password"
                  value={telegramBotToken}
                  onChange={(event) => setTelegramBotToken(event.target.value)}
                  dir="ltr"
                  autoComplete="new-password"
                  spellCheck={false}
                  placeholder="أدخل مفتاح البوت من @BotFather"
                  className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-text outline-none focus:border-secondary focus:ring-2 focus:ring-accent/40"
                  disabled={busy || !canManage}
                />
                <span className="mt-2 block text-xs leading-5 text-text-muted">الصيغة: <code dir="ltr">123456:ABC-DEF1234ghIkl-zyx57W2v1u123ew11</code></span>
                <span className="mt-1 block text-xs text-text-muted">يُحفظ المفتاح مشفّرًا ولا يظهر مجددًا بعد نجاح الربط.</span>
              </label>
            </section>
          ) : card.type !== 'whatsapp' ? (
            <>
            {spec.publicNumberLabel ? (
              <label className="block">
                <span className="text-sm font-semibold text-text">{spec.publicNumberLabel}</span>
                <input
                  value={publicNumber}
                  onChange={(event) => setPublicNumber(event.target.value)}
                  dir="ltr"
                  autoComplete="tel"
                  inputMode="tel"
                  placeholder="+967777123456"
                  className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-text outline-none focus:border-secondary focus:ring-2 focus:ring-accent/40"
                  disabled={busy || !canManage}
                />
              </label>
            ) : null}
            <label className="block">
              <span className="text-sm font-semibold text-text">
                {spec.bindingLabel}
              </span>
              <span className="mt-1 block text-xs leading-5 text-text-muted">
                {card.type === 'instagram'
                  ? 'يُستخدم فقط لإنشاء الربط؛ لن نعرضه في الصفحة بعد الحفظ.'
                  : 'أدخل المعرّف أو الرقم المطلوب للقناة.'}
              </span>
              <input
                value={identifier}
                onChange={(event) => setIdentifier(event.target.value)}
                dir="ltr"
                autoComplete="off"
                inputMode="numeric"
                placeholder={spec.bindingPlaceholder}
                className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-text outline-none focus:border-secondary focus:ring-2 focus:ring-accent/40"
                disabled={busy || !canManage}
              />
            </label>
            </>
          ) : null}

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
            {canManage && card.connected ? (
              <button
                type="button"
                onClick={removeChannel}
                disabled={busy}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-error/40 px-4 text-sm font-semibold text-error hover:bg-error/5 disabled:opacity-50"
              >
                {busy ? <Loader2 size={17} className="animate-spin" /> : <CircleAlert size={17} />}
                حذف إعدادات القناة
              </button>
            ) : null}
            {canManage && card.type !== 'messenger' && card.type !== 'whatsapp' ? (
              <button
                type="button"
                onClick={submit}
                disabled={busy || (card.type === 'telegram' ? !telegramBotToken.trim() : !identifier.trim() || Boolean(spec.publicNumberLabel && !publicNumber.trim()))}
                className="inline-flex min-h-12 flex-1 items-center justify-center gap-2 rounded-xl border border-border bg-background px-4 text-sm font-semibold text-text hover:bg-surface disabled:opacity-50"
              >
                {busy ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={17} />}
                {state === 'verified' ? 'إعادة التحقق' : 'حفظ والربط'}
              </button>
            ) : null}
            {canManage && card.connected ? (
              <button type="button" onClick={removeChannel} disabled={busy}
                className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-error/30 px-4 text-sm font-semibold text-error hover:bg-error/5 disabled:opacity-50">
                حذف إعدادات القناة
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
                  إعادة فحص الاتصال
                </button>
                {state !== 'pending' ? (
                  <button
                    type="button"
                    onClick={toggle}
                    disabled={busy || !canManage}
                    className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-background disabled:opacity-50"
                  >
                    <Power size={17} />
                    {state === 'disabled' ? 'تفعيل' : 'إيقاف'}
                  </button>
                ) : null}
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
    </main>
  )
}
