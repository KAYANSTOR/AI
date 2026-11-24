'use client'

import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'

type MemoryCategory = 'fact' | 'preference' | 'contact' | 'project'
type Memory = {
  id: string
  category: MemoryCategory
  content: string
  confidence: number
  updated_at: string
}

const ENDPOINT = '/api/assistant/memories'
const CATEGORIES: { id: MemoryCategory; label: string }[] = [
  { id: 'fact', label: 'معلومة' },
  { id: 'preference', label: 'تفضيل' },
  { id: 'contact', label: 'جهة اتصال' },
  { id: 'project', label: 'مشروع' },
]
const CATEGORY_LABEL = Object.fromEntries(CATEGORIES.map(({ id, label }) => [id, label])) as Record<MemoryCategory, string>
const fieldClass = 'min-h-11 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/15'

export function PersonalAssistantMemoryPanel() {
  const [items, setItems] = useState<Memory[]>([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [draft, setDraft] = useState('')
  const [newContent, setNewContent] = useState('')
  const [newCategory, setNewCategory] = useState<MemoryCategory>('fact')
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(ENDPOINT, { cache: 'no-store' })
      if (!response.ok) throw new Error('load_failed')
      const result = (await response.json()) as { memories: Memory[] }
      setItems(Array.isArray(result.memories) ? result.memories : [])
      setError(null)
    } catch {
      setError('تعذّر تحميل الذاكرة الشخصية. حاول تحديث الصفحة.')
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    // Initial data loading is an external synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function createMemory(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ category: newCategory, content: newContent }),
      })
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(result.error === 'duplicate_memory' ? 'هذه المعلومة محفوظة مسبقاً.' : 'تعذّر حفظ المعلومة.')
        return
      }
      setNewContent('')
      await load()
    } catch {
      setError('تعذّر الاتصال بالخادم. لم يتم تأكيد حفظ المعلومة.')
    } finally {
      setSaving(false)
    }
  }

  async function save(id: string) {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(ENDPOINT, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id, content: draft }),
      })
      const result = (await response.json().catch(() => ({}))) as { error?: string }
      if (!response.ok) {
        setError(result.error === 'duplicate_memory' ? 'هذه المعلومة محفوظة مسبقاً.' : 'تعذّر حفظ التعديل.')
        return
      }
      setEditingId(null)
      await load()
    } catch {
      setError('تعذّر الاتصال بالخادم. لم يتم تأكيد حفظ التعديل.')
    } finally {
      setSaving(false)
    }
  }

  async function remove(id: string) {
    setSaving(true)
    setError(null)
    try {
      const response = await fetch(`${ENDPOINT}?id=${encodeURIComponent(id)}`, { method: 'DELETE' })
      if (!response.ok) throw new Error('delete_failed')
      setItems((current) => current.filter((item) => item.id !== id))
      setConfirmDeleteId(null)
    } catch {
      setError('تعذّر حذف المعلومة.')
    } finally {
      setSaving(false)
    }
  }

  return (
    <section dir="rtl" className="space-y-4">
      <div className="rounded-2xl border border-border bg-surface p-4">
        <h2 className="text-base font-extrabold text-text">إضافة معلومة للذاكرة</h2>
        <p className="mt-1 text-sm leading-6 text-text-muted">
          أضف حقيقة أو تفضيلاً تريد الاحتفاظ به. هذه البيانات خاصة بحسابك ولا يراها بقية أعضاء المؤسسة.
        </p>
        <form onSubmit={createMemory} className="mt-4 space-y-3">
          <label className="block space-y-1.5 text-sm font-medium text-text">
            نوع المعلومة
            <select value={newCategory} onChange={(event) => setNewCategory(event.target.value as MemoryCategory)} className={fieldClass}>
              {CATEGORIES.map((category) => <option key={category.id} value={category.id}>{category.label}</option>)}
            </select>
          </label>
          <label className="block space-y-1.5 text-sm font-medium text-text">
            المعلومة
            <textarea
              value={newContent}
              maxLength={500}
              rows={3}
              required
              onChange={(event) => setNewContent(event.target.value)}
              className={`${fieldClass} min-h-24 resize-y`}
              placeholder="مثال: أفضل التواصل بعد الساعة 10 صباحاً"
            />
            <span className="block text-xs font-normal text-text-muted">حتى 500 حرف. لا تحفظ كلمات مرور أو بيانات دفع أو معلومات صحية حساسة.</span>
          </label>
          <Button type="submit" loading={saving} disabled={!newContent.trim()}>
            حفظ في ذاكرتي
          </Button>
        </form>
      </div>

      <div className="rounded-2xl border border-border bg-surface p-4">
        <div className="flex items-center justify-between gap-3">
          <h2 className="text-base font-extrabold text-text">المعلومات المحفوظة</h2>
          <span className="text-xs text-text-muted">{items.length} / 200</span>
        </div>
        <p className="mt-1 text-sm leading-6 text-text-muted">يمكنك تعديل أي معلومة أو حذفها نهائياً في أي وقت.</p>

        {error ? <p role="alert" className="mt-3 rounded-xl bg-error/10 p-3 text-sm text-error">{error}</p> : null}
        {loading ? <p className="py-6 text-center text-sm text-text-muted">جارٍ تحميل الذاكرة…</p> : null}
        {!loading && items.length === 0 ? <p className="py-6 text-center text-sm text-text-muted">لا توجد معلومات محفوظة بعد.</p> : null}

        <ul className="mt-3 space-y-3">
          {items.map((memory) => (
            <li key={memory.id} className="rounded-xl border border-border p-3">
              <span className="text-xs font-semibold text-text-muted">{CATEGORY_LABEL[memory.category]}</span>
              {editingId === memory.id ? (
                <div className="mt-2 space-y-2">
                  <textarea value={draft} maxLength={500} rows={3} onChange={(event) => setDraft(event.target.value)} className={`${fieldClass} min-h-20 resize-y`} />
                  <div className="flex flex-wrap gap-2">
                    <Button size="sm" onClick={() => void save(memory.id)} loading={saving}>حفظ التعديل</Button>
                    <Button size="sm" variant="outline" disabled={saving} onClick={() => setEditingId(null)}>إلغاء</Button>
                  </div>
                </div>
              ) : <p className="mt-1 whitespace-pre-wrap text-sm leading-6 text-text">{memory.content}</p>}
              {editingId !== memory.id ? (
                <div className="mt-3 flex flex-wrap items-center gap-2">
                  <Button size="sm" variant="outline" disabled={saving} onClick={() => { setEditingId(memory.id); setDraft(memory.content); setConfirmDeleteId(null) }}>تعديل</Button>
                  {confirmDeleteId === memory.id ? (
                    <>
                      <span className="text-xs text-text-muted">سيُحذف نهائياً.</span>
                      <Button size="sm" variant="danger" disabled={saving} onClick={() => void remove(memory.id)}>تأكيد الحذف</Button>
                      <Button size="sm" variant="ghost" disabled={saving} onClick={() => setConfirmDeleteId(null)}>إلغاء</Button>
                    </>
                  ) : <Button size="sm" variant="ghost" disabled={saving} onClick={() => setConfirmDeleteId(memory.id)}>حذف</Button>}
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      </div>
    </section>
  )
}
