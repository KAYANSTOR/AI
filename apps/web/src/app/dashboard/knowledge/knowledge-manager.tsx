'use client'

import { useState, useTransition } from 'react'
import { BookOpen, Loader2, Pencil, Plus, Search, Trash2, X } from 'lucide-react'
import {
  saveKnowledgeAction,
  setKnowledgeActiveAction,
  deleteKnowledgeAction,
  previewKnowledgeAction,
  KNOWLEDGE_CATEGORIES,
  type KnowledgeResult,
} from './actions'
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
          <Search size={15} className="text-primary-dark" />
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
            className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-primary px-3 py-2 text-base font-medium text-primary-dark transition-colors hover:bg-primary/10 disabled:opacity-60 md:text-sm"
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
                  <BookOpen size={15} className="text-primary-dark" />
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
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:text-primary-dark"
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
                    onClick={() => run(() => deleteKnowledgeAction(row.id))}
                    className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-lg border border-border text-text-muted transition-colors hover:border-error/40 hover:text-error"
                    aria-label="حذف"
                  >
                    <Trash2 size={14} />
                  </button>
                </div>
              )}
            </li>
          ))}
        </ul>
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
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2 text-base font-medium text-surface transition-colors hover:bg-primary-dark disabled:opacity-60 md:w-auto md:text-sm"
          >
            {pending ? <Loader2 className="animate-spin" size={14} /> : <Plus size={14} />}
            {form.id ? 'حفظ التعديلات' : 'إضافة المدخل'}
          </button>
        </section>
      )}
    </div>
  )
}
