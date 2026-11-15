'use client'

import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { FileText, Loader2, Plus, Trash2 } from 'lucide-react'
import { Dialog } from '@/components/ui/overlay'
import { createWebsitePageAction, deleteWebsitePageAction } from './actions'

type WebsitePage = {
  id: string
  name: string
  path: string
  title: string | null
  description: string | null
  status: 'published' | 'draft' | 'scheduled'
  updated_at: string
}

const statusLabels: Record<WebsitePage['status'], string> = {
  published: 'منشورة',
  draft: 'مسودة',
  scheduled: 'مجدولة',
}

const fieldClass = 'min-h-11 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15'

export function WebsitePagesManager({ pages, canManage }: { pages: WebsitePage[]; canManage: boolean }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const publishedCount = pages.filter((page) => page.status === 'published').length

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError(null)
    const formElement = event.currentTarget
    const form = new FormData(formElement)
    const input = {
      name: String(form.get('name') ?? ''),
      path: String(form.get('path') ?? ''),
      title: String(form.get('title') ?? ''),
      description: String(form.get('description') ?? ''),
      status: String(form.get('status') ?? 'draft') as WebsitePage['status'],
    }
    startTransition(async () => {
      const result = await createWebsitePageAction(input)
      if (!result.ok) {
        setError(result.error)
        return
      }
      setOpen(false)
      formElement.reset()
      router.refresh()
    })
  }

  function removePage(page: WebsitePage) {
    if (!window.confirm(`حذف الصفحة «${page.name}»؟`)) return
    startTransition(async () => {
      const result = await deleteWebsitePageAction(page.id)
      if (!result.ok) setError(result.error)
      else router.refresh()
    })
  }

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-text">صفحات الموقع</h1>
          <p className="mt-1 text-sm text-text-muted">أدر محتوى الصفحات ومساراتها وحالة نشرها.</p>
        </div>
        {canManage ? (
          <button type="button" onClick={() => { setError(null); setOpen(true) }} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-4 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2">
            <Plus size={17} aria-hidden="true" /> إضافة صفحة
          </button>
        ) : null}
      </div>

      <section aria-label="ملخص صفحات الموقع" className="grid gap-3 sm:grid-cols-3">
        <Metric label="الصفحات المنشورة" value={publishedCount} />
        <Metric label="إجمالي الصفحات" value={pages.length} />
        <Metric label="زيارات الموقع" value="—" note="لا تتوفر بيانات زيارات مرتبطة حالياً" />
      </section>

      {error && !open ? <p role="alert" className="rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error}</p> : null}
      <section className="overflow-hidden rounded-2xl border border-border bg-surface shadow-sm">
        <div className="flex items-center gap-2 border-b border-border px-5 py-4">
          <FileText size={18} className="text-primary" aria-hidden="true" />
          <h2 className="font-semibold text-text">سجل صفحات الموقع</h2>
          <span className="ms-auto text-xs text-text-muted">{pages.length} سجل</span>
        </div>
        {pages.length === 0 ? (
          <div className="flex flex-col items-center px-5 py-14 text-center">
            <span className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/10 text-primary"><FileText size={22} aria-hidden="true" /></span>
            <h3 className="mt-4 text-base font-semibold text-text">لا توجد صفحات بعد</h3>
            <p className="mt-1 max-w-sm text-sm leading-6 text-text-muted">أنشئ صفحات الموقع وأضف عنوانها ووصفها لتظهر هنا.</p>
            {canManage ? <button type="button" onClick={() => setOpen(true)} className="mt-4 min-h-10 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-background">إضافة أول صفحة</button> : null}
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-start text-sm">
              <thead className="bg-background text-xs text-text-muted"><tr><th className="px-5 py-3 font-semibold">اسم الصفحة</th><th className="px-5 py-3 font-semibold">المسار</th><th className="px-5 py-3 font-semibold">آخر تحديث</th><th className="px-5 py-3 font-semibold">الحالة</th>{canManage ? <th className="px-5 py-3"><span className="sr-only">الإجراءات</span></th> : null}</tr></thead>
              <tbody className="divide-y divide-border">
                {pages.map((page) => (
                  <tr key={page.id}>
                    <td className="px-5 py-4"><p className="font-semibold text-text">{page.name}</p>{page.title ? <p className="mt-1 max-w-xs truncate text-xs text-text-muted">{page.title}</p> : null}</td>
                    <td className="px-5 py-4 font-mono text-xs text-text-muted" dir="ltr">{page.path}</td>
                    <td className="px-5 py-4 text-xs text-text-muted">{new Intl.DateTimeFormat('ar', { dateStyle: 'medium' }).format(new Date(page.updated_at))}</td>
                    <td className="px-5 py-4"><span className={`inline-flex rounded-full px-2.5 py-1 text-xs font-semibold ${page.status === 'published' ? 'bg-success/10 text-success' : 'bg-background text-text-muted'}`}>{statusLabels[page.status]}</span></td>
                    {canManage ? <td className="px-5 py-4 text-end"><button type="button" onClick={() => removePage(page)} disabled={pending} aria-label={`حذف الصفحة ${page.name}`} className="inline-flex h-9 w-9 items-center justify-center rounded-lg text-text-muted hover:bg-error/10 hover:text-error disabled:opacity-50"><Trash2 size={16} aria-hidden="true" /></button></td> : null}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <Dialog open={open} onOpenChange={setOpen} title="إضافة صفحة موقع" description="أدخل بيانات الصفحة ومسارها وحالة نشرها." footer={(
        <><button type="button" onClick={() => setOpen(false)} disabled={pending} className="min-h-11 rounded-xl border border-border px-4 text-sm font-semibold text-text hover:bg-background">إلغاء</button><button type="submit" form="website-page-form" disabled={pending} className="inline-flex min-h-11 items-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground hover:bg-primary-dark disabled:opacity-60">{pending ? <Loader2 size={16} className="animate-spin" aria-hidden="true" /> : null}حفظ</button></>
      )}>
        <form id="website-page-form" onSubmit={onSubmit} className="space-y-4">
          <label className="block space-y-1.5 text-sm font-medium text-text">اسم الصفحة <span className="text-error">*</span><input name="name" required maxLength={120} autoFocus className={fieldClass} placeholder="مثال: الخدمات" /></label>
          <label className="block space-y-1.5 text-sm font-medium text-text">المسار <span className="text-error">*</span><input name="path" required dir="ltr" className={`${fieldClass} text-start font-mono`} placeholder="/services" /><span className="block text-xs text-text-muted">استخدم أحرفاً إنجليزية صغيرة وأرقاماً وشرطات فقط.</span></label>
          <label className="block space-y-1.5 text-sm font-medium text-text">عنوان الصفحة<input name="title" maxLength={180} className={fieldClass} placeholder="عنوان يظهر في نتائج البحث" /></label>
          <label className="block space-y-1.5 text-sm font-medium text-text">وصف الصفحة<textarea name="description" maxLength={2000} rows={4} className={`${fieldClass} resize-y`} placeholder="اكتب وصفاً مختصراً لمحتوى الصفحة." /></label>
          <label className="block space-y-1.5 text-sm font-medium text-text">حالة النشر<select name="status" defaultValue="draft" className={fieldClass}><option value="published">منشورة</option><option value="draft">مسودة</option><option value="scheduled">مجدولة</option></select></label>
          {error ? <p role="alert" className="rounded-lg border border-error/30 bg-error/10 px-3 py-2 text-sm text-error">{error}</p> : null}
        </form>
      </Dialog>
    </div>
  )
}

function Metric({ label, value, note }: { label: string; value: string | number; note?: string }) {
  return <div className="rounded-2xl border border-border bg-surface p-4"><p className="text-xs font-medium text-text-muted">{label}</p><p className="mt-2 text-2xl font-bold text-text">{value}</p>{note ? <p className="mt-1 text-xs text-text-muted">{note}</p> : null}</div>
}
