'use client'

import { useCallback, useEffect, useState } from 'react'
import { CheckCircle2, Circle, FileText, Image as ImageIcon, MessageCircle, Mic, ShieldAlert, Sparkles, Trash2, Type } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/overlay'
import { cx } from '@/components/ui/cx'

type ReadinessItem = { key: string; label: string; done: boolean }
type Submission = {
  id: string
  inputType: 'text' | 'voice' | 'image' | 'document' | string
  status: 'pending' | 'indexing' | 'indexed' | 'cancelled' | 'failed' | string
  flagged: boolean
  fileName: string | null
  createdAt: string
  hash: string | null
  summary: string
  items: { title: string; content: string }[]
}
type TrainerData = {
  target: 'knowledge' | 'memory'
  mode: 'trainer' | 'central' | 'none'
  configured: boolean
  linked: boolean
  phoneMasked: string | null
  readiness: { percent: number; next: { key: string; label: string; question: string } | null; items: ReadinessItem[] }
  submissions: Submission[]
}

const STATUS: Record<string, { label: string; className: string }> = {
  pending: { label: 'بانتظار التأكيد', className: 'bg-accent/25 text-text' },
  indexing: { label: 'جارٍ الحفظ', className: 'bg-primary text-primary-dark' },
  indexed: { label: 'معتمدة ومفهرسة', className: 'bg-primary-dark text-white' },
  cancelled: { label: 'ملغاة', className: 'bg-surface-muted text-text-muted' },
  failed: { label: 'تعذّر الحفظ', className: 'bg-error-soft text-error' },
}

const TYPE: Record<string, { label: string; icon: typeof Type }> = {
  text: { label: 'نص', icon: Type },
  voice: { label: 'صوت', icon: Mic },
  image: { label: 'صورة', icon: ImageIcon },
  document: { label: 'ملف', icon: FileText },
}

const ERRORS: Record<string, string> = {
  hash_mismatch: 'تغيّرت المسودة بعد عرضها. حدّث الصفحة وراجعها من جديد.',
  already_decided: 'تم اتخاذ قرار بشأن هذه المسودة مسبقاً.',
  trainer_not_configured: 'رقم مدرب كيان غير مُعدّ بعد. تواصل مع الدعم.',
}

function formatDate(value: string) {
  try {
    return new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value))
  } catch {
    return value
  }
}

export function TrainerPanel() {
  const [data, setData] = useState<TrainerData | null>(null)
  const [loadError, setLoadError] = useState(false)
  const [busy, setBusy] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [selected, setSelected] = useState<Submission | null>(null)

  const load = useCallback(async () => {
    try {
      const response = await fetch('/api/knowledge/trainer', { cache: 'no-store' })
      if (!response.ok) { setLoadError(true); return }
      setData(await response.json() as TrainerData)
      setLoadError(false)
    } catch {
      setLoadError(true)
    }
  }, [])

  useEffect(() => {
    // Initial data loading is an external synchronization (state is set after the fetch resolves).
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function call(key: string, init: RequestInit, url = '/api/knowledge/trainer') {
    setBusy(key)
    setNotice(null)
    try {
      const response = await fetch(url, { ...init, headers: { 'Content-Type': 'application/json' } })
      const body = await response.json().catch(() => ({})) as Record<string, unknown>
      if (!response.ok) {
        setNotice(ERRORS[String(body.error)] ?? 'تعذّر تنفيذ الطلب. حاول مرة أخرى.')
        return null
      }
      return body
    } catch {
      setNotice('تعذّر الاتصال. تحقق من الإنترنت وحاول مرة أخرى.')
      return null
    } finally {
      setBusy(null)
    }
  }

  async function openWhatsApp() {
    const body = await call('link', { method: 'POST', body: JSON.stringify({ action: 'link_code' }) })
    const link = typeof body?.waLink === 'string' ? body.waLink : ''
    if (link.startsWith('https://wa.me/')) window.location.assign(link)
  }

  async function approve(item: Submission) {
    if (!item.hash) return
    const body = await call(`approve:${item.id}`, { method: 'POST', body: JSON.stringify({ action: 'approve', id: item.id, hash: item.hash }) })
    if (body) { setSelected(null); setNotice('تم الاعتماد والحفظ في المعرفة، ويستخدمها وكيلك فوراً.'); await load() }
  }

  async function cancel(item: Submission) {
    const body = await call(`cancel:${item.id}`, { method: 'POST', body: JSON.stringify({ action: 'cancel', id: item.id }) })
    if (body) { setSelected(null); await load() }
  }

  async function remove(item: Submission) {
    const body = await call(`delete:${item.id}`, { method: 'DELETE' }, `/api/knowledge/trainer?id=${encodeURIComponent(item.id)}`)
    if (body) { setSelected(null); await load() }
  }

  if (loadError && !data) {
    return (
      <section dir="rtl" className="rounded-xl border border-border bg-surface p-4 text-sm text-text-muted">
        تعذّر تحميل بيانات مدرب كيان. <button type="button" className="font-semibold text-primary-dark underline" onClick={() => void load()}>إعادة المحاولة</button>
      </section>
    )
  }

  if (!data) {
    return <section dir="rtl" aria-busy="true" className="h-40 animate-pulse rounded-xl border border-border bg-surface" />
  }

  const { readiness } = data
  const done = readiness.items.filter((item) => item.done)
  const missing = readiness.items.filter((item) => !item.done)
  const memory = data.target === 'memory'

  return (
    <section dir="rtl" className="w-full min-w-0 space-y-4 pb-28" aria-labelledby="trainer-title">
      <div className="rounded-xl border border-primary-dark/20 bg-primary-dark p-4 text-white sm:p-5">
        <div className="flex items-start gap-3">
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-accent text-primary-dark"><Sparkles className="h-5 w-5" aria-hidden /></span>
          <div className="min-w-0 flex-1">
            <h2 id="trainer-title" className="text-base font-bold">مدرب كيان عبر واتساب</h2>
            <p className="mt-1 text-sm leading-6 text-white/85">
              {memory
                ? 'أرسل تفضيلاتك وروتينك وجهات اتصالك بالنص أو الصوت أو الصورة أو الملف، وراجع المسودة قبل حفظها في ذاكرتك.'
                : 'أرسل المنيو أو الأسعار أو السياسات بالنص أو الصوت أو الصورة أو الملف، وراجع المسودة قبل حفظها في قاعدة المعرفة.'}
            </p>
            {data.linked && data.phoneMasked ? <p className="mt-1 text-xs text-white/70" dir="ltr">{data.phoneMasked}</p> : null}
          </div>
        </div>
        <button
          type="button"
          className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-accent px-4 text-sm font-bold text-primary-dark hover:brightness-95 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
          disabled={!data.configured || busy === 'link'}
          aria-busy={busy === 'link'}
          onClick={() => void openWhatsApp()}
        >
          <MessageCircle className="h-4 w-4" aria-hidden />
          {busy === 'link' ? 'جارٍ تجهيز الرابط…' : 'درّب وكيلك عبر واتساب'}
        </button>
        {!data.configured ? <p className="mt-2 text-xs text-white/75">رقم المدرب غير مُعدّ بعد.</p> : null}
        <p className="mt-2 text-xs text-white/70">الجلسة تنتهي بعد 30 دقيقة من آخر رسالة، أو أرسل «إنهاء التدريب».</p>
      </div>

      {notice ? <p role="status" className="rounded-lg border border-border bg-surface px-3 py-2 text-sm text-text">{notice}</p> : null}

      <div className="rounded-xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-sm font-semibold text-text">جاهزية المعرفة</h3>
          <span className="text-lg font-bold tabular-nums text-primary-dark">{readiness.percent}٪</span>
        </div>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-surface-muted" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={readiness.percent} aria-label="جاهزية المعرفة">
          <div className="h-full rounded-full bg-primary-dark transition-[width]" style={{ width: `${readiness.percent}%` }} />
        </div>
        {readiness.next ? <p className="mt-3 text-sm leading-6 text-text"><span className="font-semibold">التالي: </span>{readiness.next.question}</p> : null}
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <ul className="space-y-1.5" aria-label="عناصر مكتملة">
            {done.map((item) => (
              <li key={item.key} className="flex items-center gap-2 text-sm text-text"><CheckCircle2 className="h-4 w-4 shrink-0 text-success" aria-hidden />{item.label}</li>
            ))}
          </ul>
          <ul className="space-y-1.5" aria-label="عناصر ناقصة">
            {missing.map((item) => (
              <li key={item.key} className="flex items-center gap-2 text-sm text-text-muted"><Circle className="h-4 w-4 shrink-0" aria-hidden />{item.label}</li>
            ))}
          </ul>
        </div>
      </div>

      <div className="rounded-xl border border-border bg-surface">
        <h3 className="border-b border-border px-4 py-3 text-sm font-semibold text-text">آخر مدخلات واتساب</h3>
        {data.submissions.length === 0 ? (
          <p className="px-4 py-6 text-center text-sm text-text-muted">لا توجد مدخلات بعد. ابدأ من زر «درّب وكيلك عبر واتساب».</p>
        ) : (
          <ul className="divide-y divide-border">
            {data.submissions.map((item) => {
              const type = TYPE[item.inputType] ?? TYPE.text
              const status = STATUS[item.status] ?? STATUS.pending
              const Icon = type.icon
              return (
                <li key={item.id}>
                  <button type="button" onClick={() => setSelected(item)} className="flex min-h-14 w-full items-center gap-3 px-4 py-3 text-start hover:bg-surface-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-primary text-primary-dark" aria-label={type.label}><Icon className="h-4 w-4" aria-hidden /></span>
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-medium text-text">{item.items[0]?.title || item.fileName || item.summary || type.label}</span>
                      <span className="block text-xs text-text-muted">{formatDate(item.createdAt)}</span>
                    </span>
                    {item.flagged ? <ShieldAlert className="h-4 w-4 shrink-0 text-warning" aria-label="حُذفت أوامر مشبوهة من المحتوى" /> : null}
                    <span className={cx('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', status.className)}>{status.label}</span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <Dialog
        open={selected !== null}
        onOpenChange={(open) => { if (!open) setSelected(null) }}
        className="z-50"
        title={selected ? `مسودة ${TYPE[selected.inputType]?.label ?? ''}` : ''}
        description={selected ? (STATUS[selected.status] ?? STATUS.pending).label : undefined}
        footer={selected ? <>
          {selected.status === 'pending' ? (
            <>
              <Button variant="outline" onClick={() => void cancel(selected)} loading={busy === `cancel:${selected.id}`} disabled={busy !== null}>إلغاء</Button>
              <Button variant="primary" onClick={() => void approve(selected)} loading={busy === `approve:${selected.id}`} disabled={busy !== null || !selected.hash}>اعتماد وحفظ في المعرفة</Button>
            </>
          ) : null}
          {selected.status !== 'indexing' ? (
            <Button variant="ghost" onClick={() => void remove(selected)} loading={busy === `delete:${selected.id}`} disabled={busy !== null}>
              <Trash2 className="h-4 w-4" aria-hidden />حذف من السجل
            </Button>
          ) : null}
        </> : null}
      >
        {selected ? (
          <div className="space-y-3">
            {selected.flagged ? <p className="rounded-lg bg-warning/10 px-3 py-2 text-xs text-text">حُذفت أوامر مشبوهة من المحتوى؛ يُحفظ كبيانات فقط.</p> : null}
            {selected.summary ? <p className="text-sm leading-6 text-text-muted">{selected.summary}</p> : null}
            {selected.items.map((entry, index) => (
              <div key={`${selected.id}-${index}`} className="rounded-lg border border-border p-3">
                <p className="text-sm font-semibold text-text">{entry.title}</p>
                <p className="mt-1 whitespace-pre-wrap break-words text-sm leading-6 text-text-muted">{entry.content}</p>
              </div>
            ))}
            {selected.status === 'pending' ? <p className="text-xs text-text-muted">للتعديل: اضغط «تعديل» في واتساب وأرسل النسخة الصحيحة.</p> : null}
            {selected.status === 'indexed' ? <p className="text-xs text-text-muted">الحذف من السجل لا يحذف المعرفة المحفوظة؛ أدرها من قائمة المعرفة.</p> : null}
          </div>
        ) : null}
      </Dialog>
    </section>
  )
}
