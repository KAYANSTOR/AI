'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { CheckCircle2, Clock, FileText, Plus, RefreshCw, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/overlay'
import { KayanSelect } from '@/components/ui/kayan-select'
import { cx } from '@/components/ui/cx'

type Channel = { id: string; channel_type: string; external_identifier: string | null; connection_mode: string | null; is_active: boolean }
type Template = {
  id: string
  channel_id: string
  meta_template_id: string | null
  template_name: string
  language_code: string
  category: 'MARKETING' | 'UTILITY' | 'AUTHENTICATION'
  body_text: string
  status: 'draft' | 'pending' | 'approved' | 'rejected'
  rejection_reason: string | null
  last_synced_at: string | null
  updated_at: string
}
type Payload = { channels: Channel[]; templates: Template[]; hasApprovedTemplate: boolean; canManage: boolean }

const STATUS_META: Record<Template['status'], { label: string; className: string; icon: typeof Clock }> = {
  approved: { label: 'معتمد', className: 'bg-primary text-primary-dark', icon: CheckCircle2 },
  pending: { label: 'بانتظار مراجعة Meta', className: 'bg-accent text-primary-dark', icon: Clock },
  rejected: { label: 'مرفوض', className: 'bg-error-soft text-error', icon: XCircle },
  draft: { label: 'مسودة', className: 'bg-surface-muted text-text-muted', icon: FileText },
}

const CATEGORY_LABEL: Record<Template['category'], string> = {
  UTILITY: 'خدمي (Utility)',
  MARKETING: 'تسويقي (Marketing)',
  AUTHENTICATION: 'تحقق (Authentication)',
}

async function json<T>(url: string, init?: RequestInit): Promise<{ ok: boolean; status: number; data: T | null }> {
  try {
    const response = await fetch(url, { ...init, cache: 'no-store', headers: { 'Content-Type': 'application/json' } })
    return { ok: response.ok, status: response.status, data: (await response.json().catch(() => null)) as T | null }
  } catch {
    return { ok: false, status: 0, data: null }
  }
}

export function TemplatesClient() {
  const [payload, setPayload] = useState<Payload | null>(null)
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  const [createOpen, setCreateOpen] = useState(false)
  const [form, setForm] = useState({ name: '', languageCode: 'ar', category: 'UTILITY' as Template['category'], bodyText: '', examples: '' })

  const load = useCallback(async () => {
    const result = await json<Payload>('/api/settings/templates')
    setLoading(false)
    if (!result.ok || !result.data) { setError('تعذّر تحميل القوالب.'); return }
    setPayload(result.data)
  }, [])

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])

  const channel = payload?.channels[0] ?? null
  const byChannel = useMemo(() => {
    const map = new Map<string, Template[]>()
    for (const template of payload?.templates ?? []) {
      const list = map.get(template.channel_id) ?? []
      list.push(template)
      map.set(template.channel_id, list)
    }
    return map
  }, [payload])

  async function act(action: 'sync' | 'create', body: Record<string, unknown> = {}) {
    if (!channel) return
    setBusy(action)
    setError(null)
    setNotice(null)
    const result = await json<{ ok?: boolean; result?: { scanned?: number; saved?: number; status?: string }; error?: string }>(
      '/api/settings/templates',
      { method: 'POST', body: JSON.stringify({ channelId: channel.id, action, ...body }) }
    )
    setBusy(null)
    if (!result.ok) {
      const code = result.data?.error ?? ''
      setError(
        code === 'whatsapp_cloud_api_required'
          ? 'قوالب WhatsApp متاحة فقط عبر ربط Meta Cloud API (وليست عبر QR).'
          : code === 'template_examples_required'
            ? 'أضف مثالاً لكل متغيّر {{n}} في نص القالب.'
            : code
              ? String(code)
              : 'تعذّر تنفيذ الطلب.'
      )
      return
    }
    if (action === 'sync') setNotice(`تمت المزامنة: ${result.data?.result?.saved ?? 0} قالب محدّث.`)
    else { setNotice('أُرسل القالب إلى Meta للمراجعة. سيظهر «معتمد» بعد الموافقة.'); setCreateOpen(false); setForm({ name: '', languageCode: 'ar', category: 'UTILITY', bodyText: '', examples: '' }) }
    await load()
  }

  if (loading) return <p className="py-10 text-center text-sm text-text-muted">جارٍ التحميل…</p>

  return (
    <div dir="rtl" className="space-y-4 pb-28">
      <header className="space-y-1">
        <h1 className="type-heading-2 text-text">قوالب واتساب</h1>
        <p className="text-sm leading-6 text-text-muted">
          تُستخدم القوالب المعتمدة تلقائياً عندما يمرّ أكثر من 24 ساعة على آخر رسالة من العميل، فلا تفشل التذكيرات والحملات.
        </p>
      </header>

      {!payload?.channels.length ? (
        <p className="rounded-2xl border border-dashed border-border p-4 text-sm leading-6 text-text-muted">
          لا توجد قناة WhatsApp مرتبطة عبر Meta Cloud API. اربط القناة من صفحة القنوات أولاً.
        </p>
      ) : (
        <section className="rounded-2xl border border-border bg-surface p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-extrabold text-text">{channel?.external_identifier || 'قناة WhatsApp'}</p>
              <p className="text-xs text-text-muted">
                {payload.hasApprovedTemplate ? 'يوجد قالب معتمد جاهز للإرسال خارج النافذة.' : 'لا يوجد قالب معتمد بعد؛ الإرسال خارج النافذة سيُسجّل كفشل واضح.'}
              </p>
            </div>
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                loading={busy === 'sync'}
                disabled={!payload.canManage || !channel}
                onClick={() => void act('sync')}
                leadingIcon={<RefreshCw size={14} aria-hidden />}
              >
                مزامنة من Meta
              </Button>
              <Button
                size="sm"
                disabled={!payload.canManage || !channel}
                onClick={() => setCreateOpen(true)}
                leadingIcon={<Plus size={14} aria-hidden />}
              >
                قالب جديد
              </Button>
            </div>
          </div>
        </section>
      )}

      {error ? <p role="alert" className="rounded-xl bg-error-soft p-3 text-sm text-error">{error}</p> : null}
      {notice ? <p role="status" className="rounded-xl border border-accent bg-accent-light p-3 text-sm text-text">{notice}</p> : null}

      <section aria-label="قائمة القوالب" className="space-y-2">
        {(payload?.templates.length ?? 0) === 0 ? (
          <p className="rounded-2xl border border-dashed border-border p-6 text-center text-sm text-text-muted">لا توجد قوالب بعد. اضغط «مزامنة من Meta».</p>
        ) : null}
        {(byChannel.get(channel?.id ?? '') ?? []).map((template) => {
          const meta = STATUS_META[template.status]
          const Icon = meta.icon
          return (
            <article key={template.id} className="rounded-2xl border border-border bg-surface p-4">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate font-mono text-sm font-bold text-text" dir="ltr">{template.template_name}</p>
                  <p className="mt-0.5 text-[11px] text-text-muted" dir="ltr">{template.language_code} · {template.category}</p>
                </div>
                <span className={cx('inline-flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[11px] font-extrabold', meta.className)}>
                  <Icon size={12} aria-hidden /> {meta.label}
                </span>
              </div>
              <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-muted p-3 text-xs leading-5 text-text">{template.body_text}</p>
              {template.rejection_reason ? (
                <p className="mt-2 text-xs text-error">سبب الرفض: {template.rejection_reason}</p>
              ) : null}
              <p className="mt-2 text-[11px] text-text-muted">
                {CATEGORY_LABEL[template.category]} · المرجع <span className="font-mono" dir="ltr">{(template.meta_template_id ?? template.id).slice(0, 12)}</span>
              </p>
            </article>
          )
        })}
      </section>

      <Dialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        className="z-50"
        title="قالب WhatsApp جديد"
        description="أرسله للمراجعة في Meta. الاسم بأحرف لاتينية صغيرة وشرطات سفلية، والمتغيّرات بالشكل {{1}}."
        footer={<>
          <Button variant="outline" onClick={() => setCreateOpen(false)} disabled={busy === 'create'}>تراجع</Button>
          <Button
            loading={busy === 'create'}
            onClick={() => void act('create', {
              name: form.name,
              languageCode: form.languageCode,
              category: form.category,
              bodyText: form.bodyText,
              examples: form.examples.split('|').map((value) => value.trim()).filter(Boolean),
            })}
          >
            إرسال للمراجعة
          </Button>
        </>}
      >
        <div className="space-y-3">
          <label className="block text-xs font-bold text-text">
            اسم القالب
            <input
              dir="ltr"
              value={form.name}
              onChange={(event) => setForm((current) => ({ ...current, name: event.target.value }))}
              placeholder="appointment_reminder"
              maxLength={512}
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 font-mono text-sm text-text outline-none focus:border-primary-dark focus:ring-2 focus:ring-focus"
            />
          </label>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block text-xs font-bold text-text">
              اللغة
              <input
                dir="ltr"
                value={form.languageCode}
                onChange={(event) => setForm((current) => ({ ...current, languageCode: event.target.value }))}
                placeholder="ar"
                maxLength={6}
                className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 font-mono text-sm text-text outline-none focus:border-primary-dark focus:ring-2 focus:ring-focus"
              />
            </label>
            <label className="block text-xs font-bold text-text">
              الفئة
              <KayanSelect
                aria-label="فئة القالب"
                value={form.category}
                onValueChange={(value) => setForm((current) => ({ ...current, category: value as Template['category'] }))}
                options={Object.entries(CATEGORY_LABEL).map(([value, label]) => ({ value, label }))}
                className="mt-1"
              />
            </label>
          </div>
          <label className="block text-xs font-bold text-text">
            نص القالب
            <textarea
              value={form.bodyText}
              onChange={(event) => setForm((current) => ({ ...current, bodyText: event.target.value }))}
              rows={4}
              maxLength={1024}
              placeholder="مرحباً {{1}}، نذكّرك بموعدك يوم {{2}}."
              className="mt-1 w-full rounded-xl border border-border bg-surface p-3 text-sm leading-6 text-text outline-none focus:border-primary-dark focus:ring-2 focus:ring-focus"
            />
          </label>
          <label className="block text-xs font-bold text-text">
            أمثلة المتغيّرات (افصل بينها بـ |)
            <input
              value={form.examples}
              onChange={(event) => setForm((current) => ({ ...current, examples: event.target.value }))}
              placeholder="سارة|الأحد 5 عصراً"
              className="mt-1 min-h-11 w-full rounded-xl border border-border bg-surface px-3 text-sm text-text outline-none focus:border-primary-dark focus:ring-2 focus:ring-focus"
            />
          </label>
        </div>
      </Dialog>
    </div>
  )
}
