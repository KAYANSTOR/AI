'use client'
import { useEffect, useState, useTransition } from 'react'
import { AlertTriangle, CheckCircle2, Link2, Loader2, QrCode, Trash2, Pencil, Smartphone } from 'lucide-react'
import { startWhatsAppQrSessionAction, getWhatsAppQrSessionStatusAction, disconnectWhatsAppQrSessionAction, resetWhatsAppQrChannelAction } from './actions'

type SessionStatus = {
  status: string
  phoneNumber?: string | null
  qrDataUrl?: string | null
  pairingCode?: string | null
  connectedAt?: string | null
  lastError?: string | null
}
export function WhatsAppQrConnector({ disabled, connectionMode, publicNumber }: { disabled: boolean; connectionMode: string | null; publicNumber: string | null }) {
  const [phoneNumber, setPhoneNumber] = useState(publicNumber ?? '')
  const [method, setMethod] = useState<'qr' | 'pairing_code'>('pairing_code')
  const [session, setSession] = useState<SessionStatus | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, startTransition] = useTransition()
  const waiting = Boolean(session && ['starting', 'qr_required', 'pairing_code', 'reconnecting'].includes(session.status))
  const linked = session?.status === 'connected'
  const hasSavedSettings = Boolean(publicNumber || (session && session.status !== 'not_configured'))

  async function refreshStatus() {
    const result = await getWhatsAppQrSessionStatusAction()
    if (result.ok && result.session) setSession(result.session)
  }
  useEffect(() => {
    if (connectionMode !== 'qr_unofficial') return
    let cancelled = false
    const load = async () => {
      const result = await getWhatsAppQrSessionStatusAction()
      if (!cancelled && result.ok && result.session) setSession(result.session)
    }
    void load()
    return () => { cancelled = true }
  }, [connectionMode])
  useEffect(() => {
    if (!waiting) return
    const timer = window.setInterval(() => { void refreshStatus() }, 1800)
    return () => window.clearInterval(timer)
  }, [waiting])
  useEffect(() => {
    if (!linked) return
    const timer = window.setTimeout(() => window.location.reload(), 1200)
    return () => window.clearTimeout(timer)
  }, [linked])

  function start() {
    if (disabled) return
    const digits = phoneNumber.replace(/\D/g, '')
    if (!/^\+?[1-9]\d{7,14}$/.test(phoneNumber.replace(/[\s()-]/g, ''))) {
      setNotice('أدخل رقم الهاتف بصيغة دولية صحيحة، مثل +967777123456.')
      return
    }
    startTransition(async () => {
      setNotice(null)
      setSession({ status: 'starting' })
      const result = await startWhatsAppQrSessionAction({ number: phoneNumber, method })
      if (!result.ok) {
        setNotice(result.error ?? 'تعذّر بدء ربط واتساب.')
        setSession({ status: 'failed', lastError: result.error })
        return
      }
      if (result.session) setSession(result.session)
      window.setTimeout(() => window.location.reload(), 450)
    })
  }
  function disconnect() {
    startTransition(async () => {
      const result = await disconnectWhatsAppQrSessionAction()
      if (!result.ok) { setNotice(result.error ?? 'تعذّر فصل الجلسة.'); return }
      setSession({ status: 'disconnected' })
      setNotice('تم فصل الجلسة. يمكنك الآن تعديل الرقم ثم إعادة الربط.')
      window.location.reload()
    })
  }
  function resetSettings() {
    if (disabled || !window.confirm('سيتم فصل واتساب ومسح الرقم وإعدادات الاتصال فقط. ستبقى المحادثات والعملاء محفوظين. هل تريد المتابعة؟')) return
    startTransition(async () => {
      setNotice(null)
      const result = await resetWhatsAppQrChannelAction()
      if (!result.ok) { setNotice(result.error ?? 'تعذّر مسح الإعدادات.'); return }
      setPhoneNumber('')
      setSession({ status: 'not_configured' })
      setNotice(result.message ?? 'تم مسح إعدادات القناة.')
      window.location.reload()
    })
  }

  return (
    <section className="space-y-4 rounded-2xl border border-border bg-background p-4 sm:p-5">
      <div className="flex items-start gap-3">
        <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-[#25D366]/10 text-[#25D366]"><QrCode size={23} /></span>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-sm font-bold text-text">ربط واتساب عبر QR أو رقم الهاتف</h3>
            {linked ? <span className="inline-flex items-center gap-1 rounded-full bg-success/10 px-2 py-1 text-[11px] font-semibold text-success"><CheckCircle2 size={13} /> متصل</span> : null}
          </div>
          <p className="mt-1 text-xs leading-6 text-text-muted">اربط حساب WhatsApp الموجود على هاتفك كجهاز مرتبط، دون إدخال رمز Meta أو إنشاء تطبيق أعمال جديد.</p>
        </div>
      </div>
      <div className="rounded-xl border border-warning/40 bg-warning/5 p-3">
        <div className="flex items-start gap-2">
          <AlertTriangle size={17} className="mt-0.5 shrink-0 text-warning" />
          <p className="text-xs leading-6 text-text">هذا اتصال WhatsApp Web غير رسمي عبر مكتبة خارجية، وليس WhatsApp Cloud API من Meta. قد تنتهي الجلسة أو يقيّد واتساب الرقم. لا تستخدمه للرسائل المزعجة أو الإرسال الجماعي.</p>
        </div>
      </div>
      {linked ? (
        <div className="space-y-3 rounded-xl border border-success/30 bg-success/5 p-4">
          <p className="text-sm font-semibold text-text">تم ربط الرقم بنجاح وأصبحت الجلسة متصلة.</p>
          <p className="text-xs text-text-muted" dir="ltr">{session?.phoneNumber || phoneNumber}</p>
          <button type="button" onClick={disconnect} disabled={busy || disabled}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-border px-4 text-sm font-semibold text-text disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Pencil size={16} />} فصل الاتصال لتعديل الرقم
          </button>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2 rounded-xl border border-border p-1">
            <button type="button" onClick={() => setMethod('pairing_code')} disabled={busy}
              className={'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold ' + (method === 'pairing_code' ? 'bg-primary text-primary-foreground' : 'text-text-muted')}>
              <Smartphone size={16} /> برقم الهاتف
            </button>
            <button type="button" onClick={() => setMethod('qr')} disabled={busy}
              className={'inline-flex min-h-11 items-center justify-center gap-2 rounded-lg px-2 text-sm font-semibold ' + (method === 'qr' ? 'bg-primary text-primary-foreground' : 'text-text-muted')}>
              <QrCode size={16} /> رمز QR
            </button>
          </div>
          <div className="rounded-xl border border-border bg-surface px-3 py-3">
            <p className="text-sm font-semibold text-text">{method === 'pairing_code' ? 'الربط برقم الهاتف (مناسب لهاتف واحد)' : 'الربط عبر رمز QR'}</p>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              {method === 'pairing_code'
                ? 'سيظهر رمز من 8 خانات. افتح واتساب ← الأجهزة المرتبطة ← ربط جهاز ← الربط برقم الهاتف، ثم أدخل الرمز.'
                : 'افتح واتساب على هاتف آخر أو اعرض الرمز على شاشة ثانية، ثم امسحه من الأجهزة المرتبطة.'}
            </p>
          </div>
          <label className="block">
            <span className="text-sm font-semibold text-text">رقم واتساب مع مفتاح الدولة</span>
            <input value={phoneNumber} onChange={event => setPhoneNumber(event.target.value)}
              placeholder="+967777123456" dir="ltr" inputMode="tel" autoComplete="tel"
              className="mt-2 min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-left text-base text-text outline-none focus:border-secondary"
              disabled={busy || disabled} />
            <span className="mt-1 block text-[11px] leading-5 text-text-muted">
              أدخل رقم حساب واتساب نفسه مع مفتاح الدولة، ويجب أن يكون الهاتف متصلاً بالإنترنت.
            </span>
          </label>
          <button type="button" onClick={start} disabled={busy || disabled || !phoneNumber.trim()}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-[#25D366] px-4 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <Link2 size={17} />}
            {method === 'pairing_code' ? 'إصدار رمز الربط للهاتف' : 'إنشاء رمز QR للربط'}
          </button>
          {session?.status === 'qr_required' && session.qrDataUrl ? (
            <div className="mx-auto flex max-w-sm flex-col items-center gap-3 rounded-xl border border-border bg-white p-4">
              <img src={session.qrDataUrl} alt="رمز QR لربط واتساب" className="h-auto w-full max-w-[280px]" />
              <p className="text-center text-xs font-semibold text-gray-800">امسح الرمز من خيار الأجهزة المرتبطة في تطبيق واتساب.</p>
            </div>
          ) : null}
          {session?.status === 'pairing_code' && session.pairingCode ? (
            <div className="rounded-xl border border-success/30 bg-success/5 p-4 text-center">
              <p className="text-xs font-semibold text-text-muted">رمز ربط واتساب — أدخله في الهاتف نفسه</p>
              <p className="mt-3 font-mono text-3xl font-bold tracking-[0.28em] text-text" dir="ltr">{session.pairingCode}</p>
              <p className="mt-3 text-xs leading-6 text-text-muted">في واتساب: الأجهزة المرتبطة ← ربط جهاز ← الربط برقم الهاتف، ثم أدخل الرمز الظاهر هنا.</p>
            </div>
          ) : null}

          {waiting && !session?.qrDataUrl && !session?.pairingCode ? (
            <p role="status" className="rounded-xl border border-border bg-surface px-3 py-3 text-xs text-text-muted">جارٍ تجهيز جلسة واتساب والاتصال بالخدمة...</p>
          ) : null}
          {session?.status === 'reconnecting' ? (
            <p role="status" className="rounded-xl border border-warning/40 bg-warning/5 px-3 py-3 text-xs text-text">انقطع الاتصال مؤقتاً. يحاول النظام استعادة الجلسة تلقائياً.</p>
          ) : null}
          {session?.status === 'failed' || session?.status === 'disconnected' ? (
            <p role="status" className="rounded-xl border border-error/30 bg-error/5 px-3 py-3 text-xs text-text">لم يكتمل الربط أو تم فصل الجهاز. أعد المحاولة برمز جديد.</p>
          ) : null}
        </>
      )}
      {notice ? <p role="status" className="rounded-xl border border-border px-3 py-3 text-xs text-text">{notice}</p> : null}
      {hasSavedSettings ? (
        <div className="border-t border-border pt-3">
          <button type="button" onClick={resetSettings} disabled={busy || disabled}
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-xl border border-error/30 px-4 text-sm font-semibold text-error disabled:opacity-50">
            {busy ? <Loader2 size={16} className="animate-spin" /> : <Trash2 size={16} />} مسح إعدادات القناة
          </button>
          <p className="mt-1 text-[11px] leading-5 text-text-muted">يمسح رقم الاتصال وإعداداته فقط، ولا يحذف المحادثات أو بيانات العملاء.</p>
        </div>
      ) : null}
    </section>
  )
}
