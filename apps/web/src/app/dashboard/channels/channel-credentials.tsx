'use client'

import { useState, useTransition } from 'react'
import { CheckCircle2, CircleAlert, KeyRound, Loader2, Power, Save, Trash2 } from 'lucide-react'
// Client-safe catalogue: importing the crypto-bearing service module here would pull
// Node builtins into the browser bundle.
import { CHANNEL_CREDENTIAL_FIELDS, type CredentialMetadata } from '@/lib/credentials/catalog'
import type { ChannelType } from '@/lib/channels/management'
import {
  deleteChannelCredentialAction,
  saveChannelCredentialAction,
  setChannelCredentialStatusAction,
} from './credential-actions'

export type CredentialPanelData = {
  channelType: ChannelType
  connected: boolean
  /** False when CREDENTIAL_ENCRYPTION_KEY is absent: nothing can be stored yet. */
  storageConfigured: boolean
  canManage: boolean
  entries: CredentialMetadata[]
}

export function ChannelCredentials({ data }: { data: CredentialPanelData }) {
  const fields = CHANNEL_CREDENTIAL_FIELDS[data.channelType]
  const [drafts, setDrafts] = useState<Record<string, string>>({})
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  const byType = new Map(data.entries.map((entry) => [entry.credential_type, entry]))
  const stored = data.entries.length
  const active = data.entries.filter((entry) => entry.status === 'active').length

  function save(credentialType: string) {
    const value = drafts[credentialType] ?? ''
    startTransition(async () => {
      const result = await saveChannelCredentialAction({ channelType: data.channelType, credentialType, value })
      setFeedback({
        ok: result.ok,
        text: result.ok ? (result.message ?? 'تم الحفظ.') : (result.error ?? 'تعذّر الحفظ.'),
      })
      if (result.ok) setDrafts((current) => ({ ...current, [credentialType]: '' }))
    })
  }

  function toggleStatus(status: 'active' | 'disabled') {
    startTransition(async () => {
      const result = await setChannelCredentialStatusAction({ channelType: data.channelType, status })
      setFeedback({
        ok: result.ok,
        text: result.ok ? (result.message ?? 'تم التحديث.') : (result.error ?? 'تعذّر التحديث.'),
      })
    })
  }

  function remove(credentialType?: string) {
    startTransition(async () => {
      const result = await deleteChannelCredentialAction({ channelType: data.channelType, credentialType })
      setFeedback({
        ok: result.ok,
        text: result.ok ? (result.message ?? 'تم الحذف.') : (result.error ?? 'تعذّر الحذف.'),
      })
    })
  }

  return (
    <div className="rounded-lg border border-border bg-background/60 p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-2 text-xs font-semibold text-text">
          <KeyRound size={14} aria-hidden="true" />
          بيانات اعتماد المزوّد
        </h3>
        <span className="text-[11px] text-text-muted">
          {stored === 0 ? 'لا شيء محفوظ' : `محفوظ: ${stored} · نشط: ${active}`}
        </span>
      </div>

      {!data.storageConfigured && (
        <p className="mt-2 flex items-start gap-2 rounded-lg border border-warning/40 bg-warning/10 px-3 py-2 text-[11px] leading-relaxed text-text">
          <CircleAlert size={13} className="mt-0.5 shrink-0 text-warning" aria-hidden="true" />
          تخزين بيانات الاعتماد غير مُهيّأ على الخادم. أضف
          <code className="mx-1 rounded bg-surface px-1" dir="ltr">
            CREDENTIAL_ENCRYPTION_KEY
          </code>
          (32 بايت بصيغة base64 أو 64 حرفًا hex) في إعدادات البيئة. لن تُحفظ أي قيمة قبل ذلك.
        </p>
      )}

      {!data.connected && (
        <p className="mt-2 text-[11px] text-text-muted">اربط القناة أولًا لتتمكن من إضافة بيانات الاعتماد.</p>
      )}

      <ul className="mt-3 space-y-3">
        {fields.map((field) => {
          const entry = byType.get(field.type)
          const isDisabled = !data.connected || !data.storageConfigured || !data.canManage
          return (
            <li key={field.type} className="rounded-lg border border-border bg-surface p-3">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-text" dir="ltr">
                    {field.label}
                    {field.required ? <span className="text-error"> *</span> : null}
                  </p>
                  {field.hint && <p className="mt-0.5 text-[11px] text-text-muted">{field.hint}</p>}
                </div>
                <span
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] ${
                    !entry
                      ? 'border-border bg-background text-text-muted'
                      : entry.status === 'active'
                        ? 'border-success/40 bg-success/10 text-success'
                        : 'border-warning/40 bg-warning/10 text-warning'
                  }`}
                >
                  {!entry ? 'غير مُهيّأ' : entry.status === 'active' ? 'نشط' : 'معطّل'}
                </span>
              </div>

              {entry && (
                <p className="mt-1.5 text-[10px] text-text-muted">
                  آخر تحديث: {entry.updated_at ? new Date(entry.updated_at).toLocaleString('ar') : '—'}
                  {entry.last_verified_at
                    ? ` · آخر تحقق: ${new Date(entry.last_verified_at).toLocaleString('ar')}`
                    : ''}
                </p>
              )}

              <div className="mt-2 flex flex-wrap items-center gap-2">
                <input
                  type={field.secret ? 'password' : 'text'}
                  value={drafts[field.type] ?? ''}
                  onChange={(event) => setDrafts((current) => ({ ...current, [field.type]: event.target.value }))}
                  placeholder={entry ? 'استبدال القيمة المحفوظة' : 'أدخل القيمة'}
                  disabled={isDisabled || pending}
                  autoComplete="off"
                  dir="ltr"
                  className="min-w-0 flex-1 rounded-lg border border-border bg-background px-3 py-1.5 text-xs text-text focus:border-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:opacity-60"
                />
                <button
                  type="button"
                  onClick={() => save(field.type)}
                  disabled={isDisabled || pending || !(drafts[field.type] ?? '').trim()}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-primary-dark px-3 py-1.5 text-[11px] font-medium text-surface transition-colors hover:bg-primary disabled:opacity-50"
                >
                  {pending ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save size={12} aria-hidden="true" />}
                  {entry ? 'استبدال' : 'حفظ'}
                </button>
                {entry && (
                  <button
                    type="button"
                    onClick={() => remove(field.type)}
                    disabled={pending || !data.canManage}
                    aria-label={'حذف ' + field.label}
                    className="rounded-lg border border-border p-1.5 text-text-muted transition-colors hover:bg-background hover:text-error disabled:opacity-50"
                  >
                    <Trash2 size={12} aria-hidden="true" />
                  </button>
                )}
              </div>
            </li>
          )
        })}
      </ul>

      <p className="mt-2 text-[10px] leading-relaxed text-text-muted">
        القيم تُخزَّن مشفّرة على الخادم فقط ولا تُعاد إلى المتصفح أبدًا بعد الحفظ. تُستخدم بيانات كل شركة
        في قنواتها وحدها.
      </p>

      {stored > 0 && data.canManage && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => toggleStatus(active > 0 ? 'disabled' : 'active')}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium text-text transition-colors hover:bg-surface disabled:opacity-50"
          >
            <Power size={12} aria-hidden="true" />
            {active > 0 ? 'تعطيل بيانات الاعتماد' : 'تفعيل بيانات الاعتماد'}
          </button>
          <button
            type="button"
            onClick={() => remove()}
            disabled={pending}
            className="inline-flex items-center gap-1.5 rounded-lg border border-border px-3 py-1.5 text-[11px] font-medium text-text-muted transition-colors hover:bg-surface hover:text-error disabled:opacity-50"
          >
            <Trash2 size={12} aria-hidden="true" />
            حذف كل بيانات القناة
          </button>
        </div>
      )}

      {feedback && (
        <p
          role="status"
          className={`mt-2 flex items-start gap-2 rounded-lg border px-3 py-2 text-[11px] ${
            feedback.ok ? 'border-success/40 bg-success/10 text-text' : 'border-error/40 bg-error/10 text-text'
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2 size={12} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
          ) : (
            <CircleAlert size={12} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
          )}
          {feedback.text}
        </p>
      )}
    </div>
  )
}
