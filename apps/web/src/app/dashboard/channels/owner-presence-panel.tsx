'use client'

import { KayanSelect } from '@/components/ui/kayan-select'
import { useState, useTransition } from 'react'
import { Loader2, UserRound } from 'lucide-react'
import { saveOwnerPresenceSettingsAction } from './owner-presence-actions'

export type OwnerPresenceChannel = {
  id: string
  label: string
  enabled: boolean
  pauseMinutes: number
  scope: 'channel' | 'conversation'
  pausedNow: boolean
}

function ChannelRow({ channel, canManage }: { channel: OwnerPresenceChannel; canManage: boolean }) {
  const [enabled, setEnabled] = useState(channel.enabled)
  const [minutes, setMinutes] = useState(String(channel.pauseMinutes))
  const [scope, setScope] = useState(channel.scope)
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function save() {
    startTransition(async () => {
      const result = await saveOwnerPresenceSettingsAction({
        channelId: channel.id, enabled, pauseMinutes: Number(minutes), scope,
      })
      setFeedback({ ok: result.ok, text: result.ok ? (result.message ?? 'تم الحفظ.') : (result.error ?? 'تعذّر الحفظ.') })
    })
  }

  return (
    <div className="space-y-3 rounded-xl border border-border bg-background/60 p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-text">{channel.label}</p>
        {channel.pausedNow && (
          <span className="rounded-full border border-warning/40 bg-warning/15 px-2 py-0.5 text-xs text-warning">
            الوكيل متوقف مؤقتاً لأنك ترد بنفسك
          </span>
        )}
      </div>
      <label className="flex items-center gap-2 text-sm text-text">
        <input type="checkbox" checked={enabled} disabled={!canManage || pending}
          onChange={(event) => setEnabled(event.target.checked)} />
        إيقاف الوكيل تلقائياً عندما أرد بنفسي من واتساب
      </label>
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="space-y-1 text-sm text-text">
          <span className="block text-text-muted">مدة الإيقاف (دقيقة) — تتجدد مع كل رسالة منك</span>
          <input type="number" min={1} max={1440} inputMode="numeric" value={minutes}
            disabled={!canManage || pending || !enabled}
            onChange={(event) => setMinutes(event.target.value)}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text" />
        </label>
        <label className="space-y-1 text-sm text-text">
          <span className="block text-text-muted">نطاق الإيقاف</span>
          <KayanSelect value={scope} disabled={!canManage || pending || !enabled}
            onChange={(event) => setScope(event.target.value === 'conversation' ? 'conversation' : 'channel')}
            className="w-full rounded-lg border border-border bg-background px-3 py-2 text-text">
            <option value="channel">الرقم كاملاً</option>
            <option value="conversation">المحادثة التي رددت فيها فقط</option>
          </KayanSelect>
        </label>
      </div>
      <p className="text-xs leading-5 text-text-muted">
        بعد انتهاء المدة يرد الوكيل تلقائياً على رسائل العملاء التي لم ترد عليها خلال آخر 24 ساعة.
      </p>
      {canManage && (
        <button type="button" onClick={save} disabled={pending}
          className="inline-flex min-h-10 items-center gap-2 rounded-lg bg-primary px-4 text-sm font-semibold text-white disabled:opacity-60">
          {pending && <Loader2 className="h-4 w-4 animate-spin" aria-hidden />}
          حفظ
        </button>
      )}
      {feedback && (
        <p role="status" className={`text-sm ${feedback.ok ? 'text-success' : 'text-error'}`}>{feedback.text}</p>
      )}
    </div>
  )
}

export function OwnerPresencePanel({ channels, canManage }: { channels: OwnerPresenceChannel[]; canManage: boolean }) {
  if (channels.length === 0) return null
  return (
    <section className="space-y-3 rounded-[1.15rem] border border-border bg-background/55 p-5 sm:p-6">
      <div className="flex items-center gap-2">
        <UserRound className="h-5 w-5 text-secondary" aria-hidden />
        <h2 className="text-lg font-bold text-text">تواجد صاحب النشاط</h2>
      </div>
      <p className="text-sm leading-6 text-text-muted">
        عندما ترسل رسالة يدوية من هاتفك، يتوقف الوكيل عن الرد ويترك لك المحادثة.
      </p>
      <div className="space-y-3">
        {channels.map((channel) => <ChannelRow key={channel.id} channel={channel} canManage={canManage} />)}
      </div>
    </section>
  )
}
