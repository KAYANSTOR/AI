'use client'

import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useState, useTransition } from 'react'
import { ArrowLeft, Check, Loader2 } from 'lucide-react'
import { activateAccountAction } from '../actions'

type ActivationStatus = { channel: boolean; agent: boolean; active: boolean; canManage: boolean }

export function ActivationChecklist({ status }: { status: ActivationStatus }) {
  const router = useRouter()
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  function activate() {
    setError(null)
    startTransition(async () => {
      const result = await activateAccountAction()
      if (!result.ok) {
        setError(result.error ?? 'تعذّر تفعيل النشاط. راجع الخطوات الناقصة.')
        return
      }
      router.refresh()
    })
  }

  const tasks = [
    { title: 'ربط قناة تواصل', detail: 'اربط واتساب أو قناة أخرى لاستقبال رسائل العملاء.', href: '/dashboard/channels', done: status.channel },
    { title: 'تجهيز الوكيل الذكي', detail: 'أضف تعليمات الوكيل ومعلومات نشاطك.', href: '/dashboard/agent', done: status.agent },
  ]

  return (
    <main className="mx-auto max-w-3xl space-y-6 px-4 py-8 sm:px-8 sm:py-12">
      <div>
        <p className="text-sm font-bold text-primary">Kayan AI</p>
        <h1 className="mt-2 text-2xl font-bold text-text">قائمة التفعيل اللاحقة</h1>
        <p className="mt-2 text-sm leading-6 text-text-muted">أكمل ربط القنوات وتجهيز الوكيل واختباره بعد إعداد بيانات النشاط الأساسية.</p>
      </div>
      {status.active ? <p role="status" className="rounded-xl border border-success/30 bg-success/10 px-4 py-3 text-sm font-semibold text-success">نشاطك مفعّل.</p> : null}
      <ol className="space-y-3">
        {tasks.map((task) => (
          <li key={task.href} className="flex items-start gap-4 rounded-2xl border border-border bg-surface p-5">
            <span className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${task.done ? 'bg-success/10 text-success' : 'bg-background text-text-muted'}`}>{task.done ? <Check size={18} aria-hidden="true" /> : <span className="text-sm font-bold">{tasks.indexOf(task) + 1}</span>}</span>
            <div className="min-w-0 flex-1"><h2 className="font-semibold text-text">{task.title}</h2><p className="mt-1 text-sm text-text-muted">{task.detail}</p></div>
            <Link href={task.href} className="inline-flex min-h-10 shrink-0 items-center gap-1 rounded-lg border border-border px-3 text-sm font-semibold text-text hover:bg-background">{task.done ? 'مراجعة' : 'إكمال'}<ArrowLeft size={15} aria-hidden="true" /></Link>
          </li>
        ))}
        <li className="flex items-start gap-4 rounded-2xl border border-border bg-surface p-5">
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-background text-text-muted"><span className="text-sm font-bold">3</span></span>
          <div className="min-w-0 flex-1"><h2 className="font-semibold text-text">اختبار ثم تفعيل</h2><p className="mt-1 text-sm text-text-muted">سنفحص جاهزية النشاط والوكيل قبل تشغيل استقبال العملاء.</p></div>
          <button type="button" onClick={activate} disabled={!status.canManage || status.active || pending} className="inline-flex min-h-10 shrink-0 items-center gap-2 rounded-lg bg-primary px-3 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:opacity-50">{pending ? <Loader2 size={15} className="animate-spin" aria-hidden="true" /> : null}{status.active ? 'مفعّل' : 'اختبار وتفعيل'}</button>
        </li>
      </ol>
      {error ? <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error}</p> : null}
      {!status.canManage ? <p className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-3 text-sm text-text">التفعيل متاح لمالك النشاط أو المسؤول فقط.</p> : null}
    </main>
  )
}
