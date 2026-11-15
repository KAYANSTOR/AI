'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Loader2, MessageSquarePlus, Send, X } from 'lucide-react'
import { startWhatsAppConversationAction } from './actions'

export function NewWhatsAppConversation() {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [phone, setPhone] = useState('')
  const [displayName, setDisplayName] = useState('')
  const [templateName, setTemplateName] = useState('hello_world')
  const [languageCode, setLanguageCode] = useState('en_US')
  const [parameters, setParameters] = useState('')
  const [consentConfirmed, setConsentConfirmed] = useState(false)
  const [feedback, setFeedback] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (pending) return

    const bodyParameters = parameters.trim()
      ? parameters.split(/\r?\n/).map((value) => value.trim())
      : []

    setFeedback(null)
    startTransition(async () => {
      try {
        const result = await startWhatsAppConversationAction({
          phone,
          displayName,
          templateName,
          languageCode,
          bodyParameters,
          consentConfirmed,
        })

        if (result.ok && result.conversationId) {
          setOpen(false)
          router.push('/dashboard/conversations/' + result.conversationId)
          router.refresh()
          return
        }

        setFeedback(result.error ?? 'تعذّر بدء المحادثة.')
      } catch {
        setFeedback('تعذّر الاتصال بالخادم. لم يتم تأكيد الإرسال؛ تحقق من الاتصال ثم أعد المحاولة.')
      }
    })
  }

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-11 shrink-0 items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground shadow-sm transition hover:bg-primary-dark active:scale-[0.98]"
      >
        <MessageSquarePlus className="h-4 w-4" aria-hidden="true" />
        محادثة جديدة
      </button>

      {open ? (
        <div
          className="fixed inset-0 z-[100] flex items-end justify-center bg-black/50 p-2 sm:items-center sm:p-4"
          role="presentation"
        >
          <section
            role="dialog"
            aria-modal="true"
            aria-labelledby="new-whatsapp-conversation-title"
            className="max-h-[92dvh] w-full max-w-lg overflow-y-auto rounded-3xl border border-border bg-surface shadow-2xl"
          >
            <header className="sticky top-0 z-10 flex items-start justify-between gap-3 border-b border-border bg-surface px-5 py-4">
              <div>
                <p className="text-xs font-semibold text-secondary">Kayan Connect</p>
                <h2 id="new-whatsapp-conversation-title" className="mt-1 text-lg font-bold text-text">
                  بدء محادثة WhatsApp
                </h2>
                <p className="mt-1 text-sm leading-6 text-text-muted">
                  أضف رقم العميل وأرسل إليه أول رسالة من قناتك المتصلة.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                disabled={pending}
                className="rounded-full border border-border p-2 text-text hover:bg-background disabled:opacity-50"
                aria-label="إغلاق"
              >
                <X size={18} />
              </button>
            </header>

            <form onSubmit={submit} className="space-y-4 px-5 py-5">
              <label className="block">
                <span className="text-sm font-semibold text-text">رقم واتساب المستلم</span>
                <input
                  required
                  type="tel"
                  inputMode="tel"
                  autoComplete="tel"
                  dir="ltr"
                  value={phone}
                  onChange={(event) => setPhone(event.target.value)}
                  placeholder="+967777123456"
                  disabled={pending}
                  className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-text outline-none focus:border-secondary focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
                />
                <span className="mt-1 block text-xs text-text-muted">
                  يمكنك كتابة الرقم اليمني المحلي أو الرقم الدولي مع مفتاح الدولة.
                </span>
              </label>

              <label className="block">
                <span className="text-sm font-semibold text-text">اسم العميل (اختياري)</span>
                <input
                  type="text"
                  value={displayName}
                  onChange={(event) => setDisplayName(event.target.value)}
                  placeholder="اسم العميل"
                  maxLength={120}
                  disabled={pending}
                  className="mt-2 min-h-12 w-full rounded-xl border border-border bg-background px-3 text-base text-text outline-none focus:border-secondary focus:ring-2 focus:ring-accent/40 disabled:opacity-60"
                />
              </label>

              <div className="rounded-2xl border border-border bg-background p-4">
                <p className="text-sm font-bold text-text">قالب الرسالة الأولى</p>
                <p className="mt-1 text-xs leading-5 text-text-muted">
                  لبدء المحادثة من جهة النشاط التجاري يلزم قالب معتمد. رقم Meta التجريبي يستخدم عادةً قالب hello_world باللغة en_US. في رقمك الفعلي أدخل قالباً معتمداً في حسابك.
                </p>

                <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="text-xs font-semibold text-text">اسم القالب</span>
                    <input
                      required
                      value={templateName}
                      onChange={(event) => setTemplateName(event.target.value)}
                      dir="ltr"
                      autoComplete="off"
                      placeholder="hello_world"
                      disabled={pending}
                      className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text outline-none focus:border-secondary disabled:opacity-60"
                    />
                  </label>
                  <label className="block">
                    <span className="text-xs font-semibold text-text">لغة القالب</span>
                    <input
                      required
                      value={languageCode}
                      onChange={(event) => setLanguageCode(event.target.value)}
                      dir="ltr"
                      autoComplete="off"
                      placeholder="en_US"
                      disabled={pending}
                      className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text outline-none focus:border-secondary disabled:opacity-60"
                    />
                  </label>
                </div>

                <label className="mt-3 block">
                  <span className="text-xs font-semibold text-text">متغيرات نص القالب (اختياري)</span>
                  <textarea
                    value={parameters}
                    onChange={(event) => setParameters(event.target.value)}
                    rows={3}
                    disabled={pending}
                    placeholder="كل متغير في سطر وبنفس ترتيب القالب"
                    className="mt-1 w-full resize-y rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-secondary disabled:opacity-60"
                  />
                </label>
              </div>

              <label className="flex items-start gap-3 rounded-xl border border-border bg-background px-3 py-3">
                <input
                  type="checkbox"
                  checked={consentConfirmed}
                  onChange={(event) => setConsentConfirmed(event.target.checked)}
                  disabled={pending}
                  className="mt-1 h-4 w-4 shrink-0 accent-primary"
                />
                <span className="text-xs leading-5 text-text-muted">
                  أؤكد أن المستلم وافق على تلقي الرسائل من هذا النشاط التجاري.
                </span>
              </label>

              {feedback ? (
                <p
                  role="status"
                  className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm leading-6 text-text"
                >
                  {feedback}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={pending || !phone.trim() || !consentConfirmed}
                className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 text-sm font-bold text-primary-foreground shadow-sm transition hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
              >
                {pending ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    جارٍ بدء المحادثة…
                  </>
                ) : (
                  <>
                    <Send className="h-4 w-4 rtl:-scale-x-100" />
                    إضافة الرقم وإرسال القالب
                  </>
                )}
              </button>
            </form>
          </section>
        </div>
      ) : null}
    </>
  )
}
