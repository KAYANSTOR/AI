'use client'

import { useState } from 'react'
import { ArrowLeft, Loader2, Sparkles } from 'lucide-react'
import { generateAgentSetupAction, saveAgentSetupAction } from './actions'
import {
  HANDOFF_LABELS,
  REPLY_STYLE_LABELS,
  type AgentSetupDraft,
  type HandoffId,
  type ReplyStyleId,
} from '@/lib/ai/setup-draft'

const EXAMPLE =
  'نحن شركة تنظيم أعراس، نقدم التصوير والديكور والتنسيق، ونستقبل الحجوزات عبر واتساب.'

/**
 * Stage 3 — جهّز الوكيل.
 *
 * One textarea replaces the structured forms. The model turns the description into a draft;
 * the customer reviews it here and edits everything before it is published. Prices, hours,
 * availability and policies are not part of the draft at all.
 */
export function StageAgent({
  businessName,
  savedDescription,
  savedAgentName,
  hasSavedSetup,
  canManage,
  onContinue,
}: {
  businessName: string
  savedDescription: string
  savedAgentName: string | null
  hasSavedSetup: boolean
  canManage: boolean
  onContinue: () => void
}) {
  const [mode, setMode] = useState<'describe' | 'review'>(
    hasSavedSetup && savedDescription ? 'review' : 'describe'
  )
  const [description, setDescription] = useState(savedDescription)
  const [draft, setDraft] = useState<AgentSetupDraft>({
    agentName: savedAgentName || businessName + ' AI',
    replyStyle: 'warm',
    handoff: 'when_asked',
    summary: savedDescription,
    services: [],
  })
  const [notice, setNotice] = useState<string | null>(null)
  const [dropped, setDropped] = useState<string[]>([])
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function handleGenerate() {
    setBusy(true)
    setError(null)
    setNotice(null)
    setDropped([])
    const result = await generateAgentSetupAction({ description })
    setBusy(false)
    if (!result.ok || !result.result) {
      setError(result.error ?? 'تعذّر تجهيز الوكيل. حاول مرة أخرى.')
      return
    }
    setDraft(result.result.draft)
    setNotice(result.result.notice ?? null)
    setDropped(result.result.droppedServices)
    setMode('review')
  }

  async function handleSave() {
    setBusy(true)
    setError(null)
    const result = await saveAgentSetupAction({ draft })
    setBusy(false)
    if (!result.ok) {
      setError(result.error ?? 'تعذّر حفظ إعداد الوكيل.')
      return
    }
    onContinue()
  }

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="text-xl font-bold tracking-tight text-text sm:text-2xl">جهّز الوكيل</h1>
        <p className="text-sm leading-6 text-text-muted">
          عرّفنا بنشاطك بكلماتك، وسنجهّز الوكيل. لن نخترع أسعاراً ولا مواعيد ولا سياسات — فقط ما تكتبه أنت.
        </p>
      </div>

      {mode === 'describe' ? (
        <div className="space-y-4">
          <label className="block">
            <span className="text-sm font-semibold text-text">عرّفنا بنشاطك بكلماتك</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={5}
              disabled={!canManage}
              placeholder={EXAMPLE}
              className="mt-1.5 w-full rounded-xl border border-border bg-background p-3 text-base leading-7 text-text outline-none transition-colors focus:border-primary-dark focus:ring-2 focus:ring-primary-light disabled:opacity-60"
            />
          </label>

          {error ? (
            <p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-text">
              {error}
            </p>
          ) : null}

          <button
            type="button"
            onClick={handleGenerate}
            disabled={busy || !canManage || description.trim().length < 10}
            className="inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary-dark px-6 text-base font-semibold text-white transition-colors hover:bg-primary disabled:opacity-60 sm:w-auto"
          >
            {busy ? (
              <Loader2 size={18} className="animate-spin" aria-hidden="true" />
            ) : (
              <Sparkles size={18} aria-hidden="true" />
            )}
            تجهيز الوكيل
          </button>
        </div>
      ) : (
        <div className="space-y-5">
          <div className="rounded-2xl border border-border bg-background p-5">
            <h2 className="text-sm font-bold text-text">هذه هي الإعدادات التي جهّزناها لك</h2>
            <p className="mt-1 text-xs leading-5 text-text-muted">
              راجعها وعدّل أي شيء قبل الاعتماد. سيُستخدم هذا النص في ردود الوكيل.
            </p>

            {notice ? (
              <p role="status" className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-text">
                {notice}
              </p>
            ) : null}
            {dropped.length ? (
              <p role="status" className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs leading-5 text-text">
                تجاهلنا هذه العناصر لأنها تحمل أسعاراً أو أوقاتاً ولم نرد تخزينها كخدمات:{' '}
                {dropped.join('، ')}
              </p>
            ) : null}

            <div className="mt-4 space-y-4">
              <label className="block">
                <span className="text-xs font-semibold text-text">اسم الوكيل</span>
                <input
                  value={draft.agentName}
                  onChange={(event) => setDraft({ ...draft, agentName: event.target.value })}
                  className="mt-1.5 min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-text outline-none focus:border-primary-dark focus:ring-2 focus:ring-primary-light"
                />
              </label>

              <div className="grid gap-4 sm:grid-cols-2">
                <label className="block">
                  <span className="text-xs font-semibold text-text">أسلوب الرد</span>
                  <select
                    value={draft.replyStyle}
                    onChange={(event) =>
                      setDraft({ ...draft, replyStyle: event.target.value as ReplyStyleId })
                    }
                    className="mt-1.5 min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-text outline-none focus:border-primary-dark focus:ring-2 focus:ring-primary-light"
                  >
                    {Object.entries(REPLY_STYLE_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>

                <label className="block">
                  <span className="text-xs font-semibold text-text">التعامل مع العملاء</span>
                  <select
                    value={draft.handoff}
                    onChange={(event) =>
                      setDraft({ ...draft, handoff: event.target.value as HandoffId })
                    }
                    className="mt-1.5 min-h-12 w-full rounded-xl border border-border bg-surface px-3 text-base text-text outline-none focus:border-primary-dark focus:ring-2 focus:ring-primary-light"
                  >
                    {Object.entries(HANDOFF_LABELS).map(([value, label]) => (
                      <option key={value} value={value}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>

              <label className="block">
                <span className="text-xs font-semibold text-text">وصف النشاط</span>
                <textarea
                  value={draft.summary}
                  onChange={(event) => setDraft({ ...draft, summary: event.target.value })}
                  rows={4}
                  className="mt-1.5 w-full rounded-xl border border-border bg-surface p-3 text-sm leading-7 text-text outline-none focus:border-primary-dark focus:ring-2 focus:ring-primary-light"
                />
              </label>

              <label className="block">
                <span className="text-xs font-semibold text-text">خدمات يذكرها الوكيل</span>
                <textarea
                  value={draft.services.join('\n')}
                  onChange={(event) =>
                    setDraft({
                      ...draft,
                      services: event.target.value
                        .split('\n')
                        .map((line) => line.trim())
                        .filter(Boolean),
                    })
                  }
                  rows={3}
                  placeholder={'اسم خدمة في كل سطر\nمثال: تصوير الأعراس'}
                  className="mt-1.5 w-full rounded-xl border border-border bg-surface p-3 text-sm leading-7 text-text outline-none focus:border-primary-dark focus:ring-2 focus:ring-primary-light"
                />
              </label>
            </div>
          </div>

          {error ? (
            <p role="alert" className="rounded-xl border border-error/40 bg-error/10 px-4 py-3 text-sm text-text">
              {error}
            </p>
          ) : null}

          <div className="flex flex-col gap-3 border-t border-border pt-5 sm:flex-row sm:justify-between">
            <button
              type="button"
              onClick={() => {
                setMode('describe')
                setError(null)
              }}
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-border bg-background px-5 text-sm font-medium text-text transition-colors hover:border-primary-dark hover:text-primary-dark"
          >
            تعديل الوصف
            </button>
            <button
              type="button"
              onClick={handleSave}
              disabled={busy || !canManage}
              className="inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-primary-dark px-6 text-base font-semibold text-white transition-colors hover:bg-primary disabled:opacity-60"
            >
              {busy ? <Loader2 size={18} className="animate-spin" aria-hidden="true" /> : null}
              اعتماد الإعداد
              <ArrowLeft size={18} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
