'use client'

import { useState, useTransition } from 'react'
import { BookOpen, Loader2, Pencil, Plus, Search, X } from 'lucide-react'
import {
  saveKnowledgeAction,
  setKnowledgeActiveAction,
  previewKnowledgeAction,
  getKnowledgeRevisionsAction,
  restoreKnowledgeRevisionAction,
  uploadKnowledgeDocumentAction,
  indexLegacyKnowledgeEmbeddingsAction,
  type KnowledgeRevision,
  type KnowledgeResult,
} from './actions'
import { KNOWLEDGE_CATEGORIES } from './categories'
import { ar } from '@/lib/i18n/ar'

export type KnowledgeRow = {
  id: string
  title: string
  content: string
  category: string
  is_active: boolean
}

const EMPTY = { id: null as string | null, title: '', content: '', category: 'general' }

export function KnowledgeManager({ rows, canManage }: { rows: KnowledgeRow[]; canManage: boolean }) {
  const [form, setForm] = useState(EMPTY)
  const [result, setResult] = useState<KnowledgeResult | null>(null)
  const [query, setQuery] = useState('')
  const [pending, startTransition] = useTransition()
  const [preview, setPreview] = useState<{ titles: string[]; error?: string } | null>(null)
  const [historyId, setHistoryId] = useState<string | null>(null)
  const [history, setHistory] = useState<KnowledgeRevision[]>([])
  const [documentFile, setDocumentFile] = useState<File | null>(null)
  const [embeddingProgress, setEmbeddingProgress] = useState<{ indexed: number; remaining: number } | null>(null)

  function run(work: () => Promise<KnowledgeResult>, resetOnSuccess = false) {
    setResult(null)
    startTransition(async () => {
      const outcome = await work()
      setResult(outcome)
      if (outcome.ok) {
        if (resetOnSuccess) setForm(EMPTY)
      }
    })
  }

  /**
   * Asks the server to run the agent's own retrieval, so the preview cannot drift from what
   * the agent would actually find.
   */
  function runEmbeddingBackfill() {
    setResult(null)
    setEmbeddingProgress(null)
    startTransition(async () => {
      const outcome = await indexLegacyKnowledgeEmbeddingsAction()
      if (!outcome.ok) { setResult({ ok: false, error: outcome.error }); return }
      setEmbeddingProgress({ indexed: outcome.indexed ?? 0, remaining: outcome.remaining ?? 0 })
      setResult({ ok: true, message: outcome.remaining === 0
        ? `اكتملت الفهرسة الدلالية. تمت معالجة ${outcome.indexed ?? 0} معلومة في هذه الدفعة.`
        : `تمت فهرسة ${outcome.indexed ?? 0} معلومة. المتبقي: ${outcome.remaining ?? 0}. اضغط مجدداً للمتابعة.` })
    })
  }

  function runUpload() {
    if (!documentFile) return
    const formData = new FormData()
    formData.set('file', documentFile)
    setResult(null)
    startTransition(async () => {
      const outcome = await uploadKnowledgeDocumentAction(formData)
      setResult(outcome)
      if (outcome.ok) setDocumentFile(null)
    })
  }

  function runHistory(id: string) {
    setHistoryId(id)
    setHistory([])
    startTransition(async () => {
      const outcome = await getKnowledgeRevisionsAction(id)
      if (outcome.ok) setHistory(outcome.revisions ?? [])
      else setResult({ ok: false, error: outcome.error })
    })
  }

  function runPreview() {
    setPreview(null)
    startTransition(async () => {
      const outcome = await previewKnowledgeAction(query)
      setPreview({ titles: outcome.titles ?? [], error: outcome.error })
    })
  }

  return (
    <div className="space-y-6">
      {result && (
        <div
          className={`rounded-xl border px-4 py-3 text-sm ${
            result.ok ? 'border-success/40 bg-success/10 text-text' : 'border-error/40 bg-error/10 text-text'
          }`}
        >
          {result.ok ? result.message : result.error}
        </div>
      )}

      <section className="rounded-xl border border-border bg-surface p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-text">
          <Search size={15} className="text-secondary" />
          {ar.knowledge.previewTitle}
        </h2>
        <p className="mt-1 text-xs text-text-muted">{ar.knowledge.previewDescription}</p>
        <div className="mt-3 flex flex-wrap gap-2">
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={ar.knowledge.searchPlaceholder}
            className="min-h-11 min-w-0 flex-1 rounded-lg border border-border px-3 py-2 text-base text-text md:min-w-[240px] md:text-sm"
          />
          <button
            type="button"
            disabled={pending || query.trim().length < 2}
            onClick={runPreview}
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-secondary px-3 py-2 text-base font-medium text-secondary transition-colors hover:bg-primary/10 disabled:opacity-60 md:text-sm"
          >
            {pending && <Loader2 className="animate-spin" size={14} />}
            {ar.knowledge.previewButton}
          </button>
        </div>
        {preview && (
          <p className="mt-3 text-xs text-text-muted">
            {preview.error
              ? preview.error
              : preview.titles.length === 0
                ? ar.knowledge.previewNoMatch
                : `${ar.knowledge.previewMatches}: ${preview.titles.join(' · ')}`}
          </p>
        )}
      </section>

      {canManage && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text">إضافة مستند إلى قاعدة المعرفة</h2>
          <p className="mt-1 text-xs text-text-muted">يمكن رفع ملفات TXT وMD وCSV حتى 5 ميجابايت. تُحفظ النسخة الأصلية ويُستخرج النص وتُنشأ مقاطع للبحث. يتطلب PDF مفتاح Gemini.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <input type="file" accept=".txt,.md,.csv,.docx,.pdf,text/plain,text/markdown,text/csv,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document" onChange={(event) => setDocumentFile(event.target.files?.[0] ?? null)} className="min-h-11 min-w-0 flex-1 text-xs text-text" />
            <button type="button" disabled={pending || !documentFile} onClick={runUpload} className="min-h-11 rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground disabled:opacity-60">رفع وحفظ المستند</button>
          </div>
          {documentFile && <p className="mt-2 text-xs text-text-muted">{documentFile.name} · {(documentFile.size / 1024).toFixed(0)} كيلوبايت</p>}
        </section>
      )}

      {rows.length === 0 ? (
        <div className="rounded-xl border border-border bg-surface px-4 py-8 text-center text-sm text-text-muted">
          {ar.knowledge.empty}
        </div>
      ) : (
        <ul className="divide-y divide-border overflow-hidden rounded-xl border border-border bg-surface">
          {rows.map((row) => (
            <li key={row.id} className="flex flex-wrap items-start justify-between gap-3 px-4 py-3">
              <div className="min-w-0 max-w-2xl">
                <p className="flex items-center gap-2 text-sm font-medium text-text">
                  <BookOpen size={15} className="text-secondary" />
                  {row.title}
                  <span className="rounded-full bg-background px-2 py-0.5 text-xs text-text-muted">
                    {ar.knowledge.categories[row.category as keyof typeof ar.knowledge.categories] ?? row.category}
                  </span>
                  {!row.is_active && (
                    <span className="rounded-full bg-warning/15 px-2 py-0.5 text-xs text-text">معطّل</span>
                  )}
                </p>
                <p className="mt-1 line-clamp-2 text-xs text-text-muted">{row.content}</p>
              </div>

              {canManage && (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() =>
                      setForm({ id: row.id, title: row.title, content: row.content, category: row.category })
                    }
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:text-secondary"
                    aria-label="تعديل"
                  >
                    <Pencil size={14} />
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => run(() => setKnowledgeActiveAction(row.id, !row.is_active))}
                    className="min-h-11 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text transition-colors hover:border-primary/50"
                  >
                    {row.is_active ? 'تعطيل' : 'تفعيل'}
                  </button>
                  <button
                    type="button"
                    disabled={pending}
                    onClick={() => runHistory(row.id)}
                    className="min-h-11 rounded-lg border border-border px-3 py-1.5 text-xs font-medium text-text-muted"
                  >
                    سجل الإصدارات
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
      )}

      {canManage && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <h2 className="text-sm font-semibold text-text">تفعيل البحث الدلالي للمعلومات السابقة</h2>
          <p className="mt-1 text-xs text-text-muted">يعالج هذا الإجراء المعلومات القديمة التي لم تُنشأ لها متجهات بحث بعد. تتم المعالجة على دفعات صغيرة مع بقاء البحث النصّي متاحاً. يتطلب ذلك تفعيل KNOWLEDGE_EMBEDDING_ENABLED في الخادم بعد مراجعة سياسة بيانات Gemini.</p>
          <div className="mt-3 flex flex-wrap items-center gap-3">
            <button type="button" disabled={pending} onClick={runEmbeddingBackfill} className="min-h-10 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text disabled:opacity-60">
              {pending ? 'جارٍ الفهرسة…' : 'فهرسة دفعة من المعلومات'}
            </button>
            {embeddingProgress && <span className="text-xs text-text-muted">تمت معالجة {embeddingProgress.indexed} · المتبقي {embeddingProgress.remaining}</span>}
          </div>
        </section>
      )}

      {historyId && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">سجل الإصدارات</h2>
            <button type="button" onClick={() => setHistoryId(null)} className="text-xs text-text-muted">إغلاق</button>
          </div>
          {history.length === 0 ? (
            <p className="text-xs text-text-muted">لا توجد إصدارات سابقة لهذا المدخل بعد.</p>
          ) : (
            <ul className="space-y-3">
              {history.map((revision) => (
                <li key={revision.id} className="rounded-lg border border-border p-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs font-semibold text-text">الإصدار {revision.revision_number} · {new Date(revision.created_at).toLocaleString('ar')}</p>
                    {canManage && (
                      <button type="button" disabled={pending} onClick={() => run(() => restoreKnowledgeRevisionAction(historyId, revision.id))} className="min-h-9 rounded-lg border border-border px-3 text-xs">
                        استعادة هذا الإصدار
                      </button>
                    )}
                  </div>
                  <p className="mt-2 text-sm font-medium text-text">{revision.title}</p>
                  <p className="mt-1 whitespace-pre-wrap text-xs text-text-muted">{revision.content}</p>
                  {revision.change_reason && <p className="mt-2 text-xs text-text-muted">السبب: {revision.change_reason}</p>}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {canManage && (
        <section className="rounded-xl border border-border bg-surface p-4">
          <header className="mb-3 flex items-center justify-between">
            <h2 className="text-sm font-semibold text-text">
              {form.id ? ar.knowledge.editTitle : ar.knowledge.addTitle}
            </h2>
            {form.id && (
              <button
                type="button"
                onClick={() => setForm(EMPTY)}
                className="inline-flex min-h-11 items-center gap-1 text-xs text-text-muted hover:text-text"
              >
                <X size={13} />
                إلغاء التعديل
              </button>
            )}
          </header>

          <div className="grid gap-3">
            <label className="text-xs text-text-muted">
              {ar.knowledge.titleLabel}
              <input
                value={form.title}
                onChange={(event) => setForm({ ...form, title: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-lg border border-border px-2 py-1.5 text-base text-text md:text-sm"
                placeholder="سياسة الإلغاء"
              />
            </label>
            <label className="text-xs text-text-muted">
              {ar.knowledge.categoryLabel}
              <select
                value={form.category}
                onChange={(event) => setForm({ ...form, category: event.target.value })}
                className="mt-1 min-h-11 w-full rounded-lg border border-border px-2 py-1.5 text-base text-text md:text-sm"
              >
                {KNOWLEDGE_CATEGORIES.map((category) => (
                  <option key={category} value={category}>
                    {ar.knowledge.categories[category as keyof typeof ar.knowledge.categories] ?? category}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-xs text-text-muted">
              {ar.knowledge.contentLabel}
              <textarea
                value={form.content}
                onChange={(event) => setForm({ ...form, content: event.target.value })}
                rows={5}
                className="mt-1 min-h-11 w-full rounded-lg border border-border px-2 py-1.5 text-base text-text md:text-sm"
                placeholder="يمكن للعميل إلغاء الموعد قبل 24 ساعة دون رسوم."
              />
            </label>
          </div>

          <button
            type="button"
            disabled={pending || !form.title.trim() || !form.content.trim()}
            onClick={() => run(() => saveKnowledgeAction(form), true)}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-base font-medium text-primary-foreground transition-colors hover:bg-primary-dark disabled:opacity-60 md:w-auto md:text-sm"
          >
            {pending ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
            {form.id ? 'حفظ التعديلات' : 'إضافة المدخل'}
          </button>
        </section>
      )}
    </div>
  )
}
