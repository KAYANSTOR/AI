'use client'

import { useState, useRef } from 'react'
import { Button } from '@/components/ui/button'
import { CheckCircle2, Send, ShieldCheck, XCircle } from 'lucide-react'
import { runActivationTestAction, activateAccountAction } from './actions'
import type { SmokeTestOutcome } from '@/lib/onboarding/smoke-test'
import type { ReplyTestResult } from '@/lib/onboarding/reply-test'

const CHECK_LABELS: Record<string, string> = {
  business_profile: 'بيانات النشاط جاهزة',
  business_type: 'نوع النشاط محدد',
  timezone: 'المنطقة الزمنية مضبوطة',
  active_channel: 'قناة مفعّلة',
  verified_channel: 'القناة متصلة ومتحقق منها',
  active_agent: 'الوكيل يعمل',
  reply_test: 'اختبار الرد الحقيقي',
}

const CHECK_FIXES: Record<string, string> = {
  business_profile: 'أكمل بيانات النشاط في المرحلة الأولى.',
  business_type: 'اختر نوع النشاط في المرحلة الأولى.',
  timezone: 'أكمل بيانات النشاط في المرحلة الأولى.',
  active_channel: 'اربط قناة واحدة على الأقل من «وصّل نشاطك».',
  verified_channel:
    'لم يكتمل التحقق من قناتك بعد. ارجع إلى «وصّل نشاطك» واضغط «إعادة المحاولة» لإكمال الربط.',
  active_agent: 'أكمل إعداد الوكيل في المرحلة الثالثة.',
  reply_test: 'أعد اختبار الرد بعد حفظ إعدادات الوكيل.',
}

const DEFAULT_MESSAGE = 'السلام عليكم، أريد حجز موعد'

/**
 * Stage 4 — جرّب ثم شغّل.
 *
 * The customer writes a message the way a customer would and sees a real answer from the
 * same prompt the runtime uses. The required checks are the production readiness checks;
 * the reply is a real provider call and is reported separately, never faked.
 */
export function StageTest({
  initialOutcome,
  initialReply,
  initialTestMessage,
  canManage,
  onActivated,
}: {
  initialOutcome: SmokeTestOutcome | null
  initialReply: ReplyTestResult | null
  initialTestMessage: string | null
  canManage: boolean
  onActivated: () => void
}) {
  const [message, setMessage] = useState(initialTestMessage?.trim() || DEFAULT_MESSAGE)
  const [outcome, setOutcome] = useState<SmokeTestOutcome | null>(initialOutcome)
  const [reply, setReply] = useState<ReplyTestResult | null>(initialReply)
  const [operation, setOperation] = useState<'test' | 'activate' | null>(null)
  const inFlight = useRef(false)
  const busy = operation !== null
  const [error, setError] = useState<string | null>(null)

  const passed = outcome?.passed === true && reply?.status === 'answered'

  async function handleTest() {
    if (inFlight.current || !canManage || message.trim().length < 2) return
    inFlight.current = true
    setOperation('test')
    setError(null)
    setReply(null)
    setOutcome(null)
    try {
      const result = await runActivationTestAction({ message })
      if (result.outcome) setOutcome(result.outcome)
      if (result.reply) setReply(result.reply)
      if (!result.ok) setError(result.error ?? 'تعذّر إجراء الاختبار. حاول مرة أخرى.')
    } catch {
      setError('تعذّر الاتصال بالخادم. أعد الاختبار.')
    } finally {
      inFlight.current = false
      setOperation(null)
    }
  }

  async function handleActivate() {
    if (inFlight.current || !canManage || !passed) return
    inFlight.current = true
    setOperation('activate')
    setError(null)
    try {
      const result = await activateAccountAction()
      if (!result.ok) {
        setOutcome(result.outcome ?? null)
        setReply(null)
        setError(result.error ?? 'لم يكتمل التفعيل. راجع الخطوات ثم حاول مرة أخرى.')
        return
      }
      onActivated()
    } catch {
      setError('تعذّر الاتصال بالخادم. تحقق من حالة النشاط ثم أعد المحاولة.')
    } finally {
      inFlight.current = false
      setOperation(null)
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-text sm:text-2xl">اختبر موظفك الجديد</h1>
        <p className="text-sm leading-6 text-text-muted">
          اكتب رسالة كما لو كنت العميل، وسنجرب الرد ونفحص أن كل شيء جاهز.
        </p>
      </div>

      <div className="rounded-2xl border border-border bg-background p-5">
        <label className="block">
          <span className="text-xs font-semibold text-text">رسالتك التجريبية</span>
          <textarea
            value={message}
            onChange={(event) => {
              setMessage(event.target.value)
              setReply(null)
              setOutcome(null)
            }}
            rows={3}
            maxLength={2000}
            disabled={!canManage || busy}
            className="mt-1.5 w-full rounded-xl border border-border bg-surface p-3 text-base leading-7 text-text outline-none focus:border-secondary focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
          />
        </label>

        {reply ? (
          <div className="mt-4 space-y-3">
            <div className="flex justify-start">
              <p className="max-w-[85%] rounded-2xl rounded-es-sm bg-surface px-4 py-2.5 text-sm leading-6 text-text">
                {message}
              </p>
            </div>
            {reply.status === 'answered' ? (
              <div className="flex justify-end">
                <p className="max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-ee-sm bg-primary-light/30 px-4 py-2.5 text-sm leading-6 text-text">
                  {reply.reply}
                </p>
              </div>
            ) : (
              <p
                role="status"
                className={`rounded-lg border px-3 py-2 text-xs leading-5 text-text ${
                  reply.status === 'failed'
                    ? 'border-error/40 bg-error/10'
                    : 'border-warning/30 bg-warning/10'
                }`}
              >
                {reply.message}
              </p>
            )}
          </div>
        ) : null}

        <Button
          size="lg"
          onClick={handleTest}
          disabled={busy || !canManage || message.trim().length < 2}
          loading={operation === 'test'}
          loadingLabel="جارٍ اختبار الرد..."
          leadingIcon={<Send size={18} aria-hidden="true" />}
          className="mt-4 w-full sm:w-auto"
        >
          {outcome ? 'إعادة الاختبار' : 'إرسال الاختبار'}
        </Button>
      </div>

      {outcome || reply ? (
        <div className="rounded-2xl border border-border bg-background p-5">
          <h2 className="text-sm font-bold text-text">نتيجة الفحص</h2>
          {outcome?.testedAt && !Number.isNaN(Date.parse(outcome.testedAt)) ? (
            <p className="mt-1 text-xs text-text-muted">آخر فحص: <time dateTime={outcome.testedAt}>{new Date(outcome.testedAt).toLocaleString('ar', { timeZone: 'Asia/Aden', dateStyle: 'short', timeStyle: 'short' })}</time> · توقيت اليمن</p>
          ) : null}
          <ul className="mt-3 space-y-3">
            {(outcome?.checks ?? []).map((check) => (
              <li key={check.name} className="flex items-start gap-3">
                {check.ok ? (
                  <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
                ) : (
                  <XCircle size={18} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium text-text">
                    {CHECK_LABELS[check.name] ?? check.name}
                  </p>
                  {!check.ok ? (
                    <p className="mt-0.5 text-xs leading-5 text-text-muted">
                      {CHECK_FIXES[check.name] ?? 'أكمل هذه الخطوة ثم أعد الاختبار.'}
                    </p>
                  ) : null}
                </div>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-text">
          {error}
        </p>
      ) : null}

      <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:items-center sm:justify-between">
        <p className="text-xs leading-5 text-text-muted">
          {passed
            ? 'نجحت الفحوص ووصل رد حقيقي من الوكيل. يمكنك تشغيل نشاطك الآن.'
            : 'لن يتم التشغيل قبل نجاح الفحوص ووصول رد حقيقي من الوكيل.'}
          {passed ? ' نتيجة اختبار الرد صالحة لعشر دقائق ما دامت الإعدادات لم تتغير.' : ''}
        </p>
        <Button
          size="lg"
          onClick={handleActivate}
          disabled={busy || !passed || !canManage}
          loading={operation === 'activate'}
          loadingLabel="جارٍ التحقق وتفعيل النشاط..."
          leadingIcon={<ShieldCheck size={18} aria-hidden="true" />}
          className="w-full sm:w-auto"
        >
          تشغيل نشاطي
        </Button>
      </div>
    </div>
  )
}
