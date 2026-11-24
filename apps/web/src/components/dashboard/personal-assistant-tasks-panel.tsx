'use client'

import { KayanSelect } from '@/components/ui/kayan-select'
import { useCallback, useEffect, useState, type FormEvent } from 'react'
import { Button } from '@/components/ui/button'

type Task = { id: string; title: string; notes: string | null; due_at: string | null; status: 'pending' | 'done' | 'snoozed' }
type Settings = { whatsapp_channel_id: string | null; whatsapp_reminders_enabled: boolean; morning_brief_enabled: boolean; morning_brief_local_time: string; timezone: string } | null
type Channel = { id: string; external_identifier: string | null }
const endpoint = '/api/assistant/tasks'
const inputClass = 'min-h-11 w-full rounded-xl border border-border bg-surface px-3 py-2 text-sm text-text outline-none focus:border-primary'

export function PersonalAssistantTasksPanel() {
  const [tasks, setTasks] = useState<Task[]>([])
  const [settings, setSettings] = useState<Settings>(null)
  const [channels, setChannels] = useState<Channel[]>([])
  const [title, setTitle] = useState('')
  const [dueAt, setDueAt] = useState('')
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    setLoading(true)
    try {
      const response = await fetch(endpoint, { cache: 'no-store' })
      if (!response.ok) throw new Error('load_failed')
      const result = await response.json() as { tasks: Task[]; settings: Settings; channels: Channel[] }
      setTasks(result.tasks ?? []); setSettings(result.settings); setChannels(result.channels ?? []); setError(null)
    } catch { setError('تعذّر تحميل المهام الشخصية.') } finally { setLoading(false) }
  }, [])
  useEffect(() => {
    // Initial data loading is an external synchronization, not derived render state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  async function create(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(null)
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, dueAt: dueAt ? new Date(dueAt).toISOString() : null }) })
      if (!response.ok) throw new Error('create_failed')
      setTitle(''); setDueAt(''); await load()
    } catch { setError('تعذّر إنشاء المهمة.') } finally { setSaving(false) }
  }
  async function action(id: string, actionName: 'complete' | 'delete') {
    setSaving(true); setError(null)
    try {
      const response = actionName === 'delete' ? await fetch(`${endpoint}?id=${encodeURIComponent(id)}`, { method: 'DELETE' }) : await fetch(endpoint, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, action: actionName }) })
      if (!response.ok) throw new Error('action_failed')
      await load()
    } catch { setError('تعذّر تحديث المهمة.') } finally { setSaving(false) }
  }
  async function saveSettings(patch: Record<string, unknown>) {
    setSaving(true); setError(null)
    try {
      const response = await fetch(endpoint, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ type: 'settings', ...patch }) })
      if (!response.ok) throw new Error('settings_failed')
      await load()
    } catch { setError('تعذّر حفظ إعدادات المساعد.') } finally { setSaving(false) }
  }

  return <section dir="rtl" className="space-y-4">
    <div className="rounded-2xl border border-border bg-surface p-4">
      <h2 className="text-base font-extrabold text-text">مهمة شخصية جديدة</h2>
      <form onSubmit={create} className="mt-3 grid gap-3 sm:grid-cols-[1fr_220px_auto] sm:items-end">
        <label className="space-y-1 text-sm font-medium text-text">العنوان<input required maxLength={300} value={title} onChange={(event) => setTitle(event.target.value)} className={inputClass} placeholder="مثال: الاتصال بالمحاسب" /></label>
        <label className="space-y-1 text-sm font-medium text-text">الموعد<input type="datetime-local" value={dueAt} onChange={(event) => setDueAt(event.target.value)} className={inputClass} /></label>
        <Button type="submit" loading={saving} disabled={!title.trim()}>إضافة</Button>
      </form>
    </div>
    <div id="daily-summary" className="rounded-2xl border border-border bg-surface p-4 scroll-mt-6">
      <h2 className="text-base font-extrabold text-text">التذكيرات والملخص اليومي</h2>
      <p className="mt-1 text-sm leading-6 text-text-muted">تظل هذه الإعدادات خاصة بك. رسائل Meta الاستباقية لا تُرسل إلا عبر قالب معتمد.</p>
      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <label className="flex items-center gap-2 text-sm text-text"><input type="checkbox" checked={settings?.whatsapp_reminders_enabled ?? false} onChange={(event) => void saveSettings({ whatsappRemindersEnabled: event.target.checked })} /> تذكيرات WhatsApp</label>
        <label className="flex items-center gap-2 text-sm text-text"><input type="checkbox" checked={settings?.morning_brief_enabled ?? false} onChange={(event) => void saveSettings({ morningBriefEnabled: event.target.checked })} /> الملخص الصباحي</label>
        <label className="space-y-1 text-sm text-text">قناة WhatsApp<KayanSelect value={settings?.whatsapp_channel_id ?? ''} onChange={(event) => void saveSettings({ whatsappChannelId: event.target.value || null })} className={inputClass}><option value="">لا توجد قناة</option>{channels.map((channel) => <option key={channel.id} value={channel.id}>{channel.external_identifier || channel.id}</option>)}</KayanSelect></label>
        <label className="space-y-1 text-sm text-text">وقت الملخص<input type="time" value={(settings?.morning_brief_local_time ?? '08:00').slice(0, 5)} onChange={(event) => void saveSettings({ morningBriefLocalTime: event.target.value })} className={inputClass} /></label>
      </div>
    </div>
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-center justify-between"><h2 className="text-base font-extrabold text-text">مهامي</h2><span className="text-xs text-text-muted">{tasks.filter((task) => task.status !== 'done').length} مفتوحة</span></div>
      {error ? <p role="alert" className="mt-3 rounded-xl bg-error/10 p-3 text-sm text-error">{error}</p> : null}
      {loading ? <p className="py-6 text-center text-sm text-text-muted">جارٍ التحميل…</p> : tasks.length === 0 ? <p className="py-6 text-center text-sm text-text-muted">لا توجد مهام شخصية بعد.</p> : <ul className="mt-3 space-y-2">{tasks.map((task) => <li key={task.id} className="flex flex-wrap items-center gap-3 rounded-xl border border-border p-3"><div className="min-w-0 flex-1"><p className={`text-sm font-semibold ${task.status === 'done' ? 'text-text-muted line-through' : 'text-text'}`}>{task.title}</p>{task.due_at ? <p className="mt-1 text-xs text-text-muted">{new Date(task.due_at).toLocaleString('ar-SA')}</p> : null}</div>{task.status !== 'done' ? <Button size="sm" variant="outline" disabled={saving} onClick={() => void action(task.id, 'complete')}>إكمال</Button> : null}<Button size="sm" variant="ghost" disabled={saving} onClick={() => void action(task.id, 'delete')}>حذف</Button></li>)}</ul>}
    </div>
  </section>
}
