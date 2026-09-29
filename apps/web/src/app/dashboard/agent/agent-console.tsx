'use client'

import { useState, useTransition } from 'react'
import { CircleAlert, CheckCircle2, History, Loader2, Save, Send } from 'lucide-react'
import type { ToolPolicy } from '@/lib/ai/registry'
import { ar } from '@/lib/i18n/ar'
import { capabilityLabel } from '@/lib/i18n/labels'
import {
  publishPromptAction,
  rollbackPromptAction,
  saveAgentProfileAction,
  setToolPolicyAction,
} from './actions'

export type AgentConsoleData = {
  agentId: string
  name: string
  locale: string
  temperature: number
  status: string
  modelProvider: string
  publishedVersion: number | null
  publishedInstructions: string
  versions: Array<{ version: number; status: string; publishedAt: string | null; characters: number }>
  tools: Array<{
    policy: ToolPolicy
    isAllowed: boolean
    requiresConfirmation: boolean
    capabilityEnabled: boolean
  }>
}

const RISK_LABEL: Record<string, string> = { read: 'قراءة', write: 'كتابة' }

function Feedback({ value }: { value: { ok: boolean; text: string } | null }) {
  if (!value) return null
  return (
    <p
      role="status"
      className={`flex items-start gap-2 rounded-lg border px-3 py-2 text-xs ${
        value.ok ? 'border-success/40 bg-success/10 text-text' : 'border-error/40 bg-error/10 text-text'
      }`}
    >
      {value.ok ? (
        <CheckCircle2 size={14} className="mt-0.5 shrink-0 text-success" aria-hidden="true" />
      ) : (
        <CircleAlert size={14} className="mt-0.5 shrink-0 text-error" aria-hidden="true" />
      )}
      {value.text}
    </p>
  )
}

export function AgentConsole({ data }: { data: AgentConsoleData }) {
  const [name, setName] = useState(data.name)
  const [locale, setLocale] = useState(data.locale)
  const [temperature, setTemperature] = useState(data.temperature)
  const [status, setStatus] = useState(data.status)
  const [instructions, setInstructions] = useState(data.publishedInstructions)
  const [profileFeedback, setProfileFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [promptFeedback, setPromptFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [toolFeedback, setToolFeedback] = useState<{ ok: boolean; text: string } | null>(null)
  const [pending, startTransition] = useTransition()

  function saveProfile() {
    startTransition(async () => {
      const result = await saveAgentProfileAction({ agentId: data.agentId, name, locale, temperature, status })
      setProfileFeedback({ ok: result.ok, text: result.ok ? (result.message ?? 'تم الحفظ.') : (result.error ?? 'تعذّر الحفظ.') })
    })
  }

  function publish() {
    startTransition(async () => {
      const result = await publishPromptAction({ agentId: data.agentId, instructions })
      setPromptFeedback({
        ok: result.ok,
        text: result.ok ? (result.message ?? 'تم النشر.') : (result.error ?? 'تعذّر النشر.'),
      })
    })
  }

  function rollback(version: number) {
    startTransition(async () => {
      const result = await rollbackPromptAction({ agentId: data.agentId, version })
      setPromptFeedback({
        ok: result.ok,
        text: result.ok ? (result.message ?? 'تمت الاستعادة.') : (result.error ?? 'تعذّرت الاستعادة.'),
      })
    })
  }

  function toggleTool(tool: string, next: { isAllowed?: boolean; requiresConfirmation?: boolean }, current: { isAllowed: boolean; requiresConfirmation: boolean }) {
    startTransition(async () => {
      const result = await setToolPolicyAction({
        agentId: data.agentId,
        toolName: tool,
        isAllowed: next.isAllowed ?? current.isAllowed,
        requiresConfirmation: next.requiresConfirmation ?? current.requiresConfirmation,
      })
      setToolFeedback({ ok: result.ok, text: result.ok ? (result.message ?? 'تم التحديث.') : (result.error ?? 'تعذّر التحديث.') })
    })
  }

  return (
    <div className="space-y-5">
      {/* ── Identity ─────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-text">هوية الوكيل</h2>
        <p className="mt-0.5 text-xs text-text-muted">
          النموذج المستخدم: <span dir="ltr">{data.modelProvider}</span>
        </p>

        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text">اسم الوكيل</span>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-text focus:border-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/20 md:text-sm"
            />
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text">لغة الرد</span>
            <select
              value={locale}
              onChange={(event) => setLocale(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-text focus:border-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/20 md:text-sm"
            >
              <option value="ar">العربية</option>
              <option value="en">الإنجليزية</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text">الحالة</span>
            <select
              value={status}
              onChange={(event) => setStatus(event.target.value)}
              className="min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base text-text focus:border-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/20 md:text-sm"
            >
              <option value="active">نشط</option>
              <option value="suspended">موقوف</option>
              <option value="archived">مؤرشف</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-xs font-medium text-text">
              أسلوب الرد (درجة الإبداع): {temperature.toFixed(2)}
            </span>
            <input
              type="range"
              min={0}
              max={1}
              step={0.05}
              value={temperature}
              onChange={(event) => setTemperature(Number(event.target.value))}
              className="mt-2 min-h-11 w-full accent-[var(--color-primary-dark)]"
            />
            <span className="mt-1 block text-[11px] text-text-muted">
              القيم الأقل تعني التزامًا أكبر بالمعلومات المسجّلة وعدم الاجتهاد.
            </span>
          </label>
        </div>

        <div className="mt-4 flex items-center gap-3">
          <button
            type="button"
            onClick={saveProfile}
            disabled={pending}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-dark px-4 py-2 text-base font-medium text-surface transition-colors hover:bg-primary disabled:opacity-60 md:w-auto md:text-sm"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save size={16} aria-hidden="true" />}
            حفظ
          </button>
          <Feedback value={profileFeedback} />
        </div>
      </section>

      {/* ── Instructions ─────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <h2 className="text-sm font-semibold text-text">تعليمات الوكيل</h2>
            <p className="mt-0.5 text-xs text-text-muted">
              النسخة المنشورة حاليًا: {data.publishedVersion ?? 'لا توجد'}
            </p>
          </div>
        </div>

        <textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={7}
          placeholder="مثال: رحّب بالعميل باسم النشاط، اسأل عن الخدمة المطلوبة، واقترح موعدين فقط…"
          className="mt-3 min-h-11 w-full rounded-lg border border-border bg-background px-3 py-2 text-base leading-relaxed text-text focus:border-primary-dark focus:outline-none focus:ring-2 focus:ring-primary/20 md:text-sm"
        />
        <p className="mt-2 text-[11px] leading-relaxed text-text-muted">
          هذه التعليمات تُضاف إلى سياق النشاط ولا تلغي السياسة العامة: الأسعار والتوافر والصلاحيات
          تبقى من قاعدة البيانات لا من النص.
        </p>

        <div className="mt-3 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={publish}
            disabled={pending}
            className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-lg bg-primary-dark px-4 py-2 text-base font-medium text-surface transition-colors hover:bg-primary disabled:opacity-60 md:w-auto md:text-sm"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send size={16} aria-hidden="true" />}
            نشر نسخة جديدة
          </button>
          <Feedback value={promptFeedback} />
        </div>

        {data.versions.length > 0 && (
          <div className="mt-4 border-t border-border pt-3">
            <h3 className="flex items-center gap-2 text-xs font-semibold text-text">
              <History size={14} aria-hidden="true" />
              سجل النسخ
            </h3>
            <ul className="mt-2 space-y-1.5">
              {data.versions.map((version) => (
                <li
                  key={version.version}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-background/60 px-3 py-2 text-xs"
                >
                  <span className="text-text">
                    نسخة {version.version} · {version.status === 'published' ? 'منشورة' : 'مؤرشفة'} ·{' '}
                    {version.characters} حرفًا
                  </span>
                  {version.status !== 'published' && (
                    <button
                      type="button"
                      onClick={() => rollback(version.version)}
                      disabled={pending}
                      className="rounded-md border border-border px-2.5 py-1 text-[11px] font-medium text-text transition-colors hover:bg-surface disabled:opacity-50"
                    >
                      استعادة
                    </button>
                  )}
                </li>
              ))}
            </ul>
          </div>
        )}
      </section>

      {/* ── Tools ────────────────────────────────────────────────── */}
      <section className="rounded-xl border border-border bg-surface p-5 shadow-sm">
        <h2 className="text-sm font-semibold text-text">الأدوات والصلاحيات</h2>
        <p className="mt-0.5 text-xs text-text-muted">
          سجل الأدوات هو مصدر الحقيقة. الأداة التي تخص قدرة غير مُفعّلة لا تُعرض للنموذج ولا تُنفّذ
          حتى لو سُمح بها هنا.
        </p>

        <ul className="mt-3 space-y-3 md:hidden">
          {data.tools.map((tool) => (
            <li key={tool.policy.name} className="min-w-0 rounded-lg border border-border bg-background p-3">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-medium text-text" dir="ltr">{tool.policy.name}</p>
                  <p className="mt-1 text-xs leading-relaxed text-text-muted">
                    {ar.agent.toolDescriptions[tool.policy.name as keyof typeof ar.agent.toolDescriptions] ??
                      tool.policy.description}
                  </p>
                </div>
                {tool.policy.capability && (
                  <span className="rounded-full border border-border px-2 py-1 text-[11px] text-text">
                    {capabilityLabel(tool.policy.capability)}
                  </span>
                )}
              </div>
              <div className="mt-2 flex flex-wrap items-center justify-between gap-x-3 border-t border-border pt-2 text-xs">
                <span className="text-text-muted">
                  {RISK_LABEL[tool.policy.risk] ?? tool.policy.risk}
                </span>
                <label className="inline-flex min-h-11 items-center gap-2 text-text">
                  <input
                    type="checkbox"
                    checked={tool.isAllowed}
                    disabled={pending}
                    onChange={(event) => toggleTool(tool.policy.name, { isAllowed: event.target.checked }, tool)}
                    className="h-5 w-5 accent-[var(--color-primary-dark)]"
                  />
                  مسموحة
                </label>
                <label className="inline-flex min-h-11 items-center gap-2 text-text">
                  <input
                    type="checkbox"
                    checked={tool.requiresConfirmation}
                    disabled={pending || tool.policy.risk === 'read'}
                    onChange={(event) =>
                      toggleTool(tool.policy.name, { requiresConfirmation: event.target.checked }, tool)
                    }
                    className="h-5 w-5 accent-[var(--color-primary-dark)]"
                  />
                  تتطلب تأكيدًا
                </label>
              </div>
            </li>
          ))}
        </ul>
        <div className="mt-3 hidden overflow-x-auto md:block">
          <table className="w-full text-xs">
            <thead>
              <tr className="border-b border-border text-text-muted">
                <th className="py-2 pe-3 text-start font-medium">الأداة</th>
                <th className="py-2 pe-3 text-start font-medium">القدرة</th>
                <th className="py-2 pe-3 text-start font-medium">النوع</th>
                <th className="py-2 pe-3 text-start font-medium">مسموحة</th>
                <th className="py-2 pe-3 text-start font-medium">تتطلب تأكيدًا</th>
              </tr>
            </thead>
            <tbody>
              {data.tools.map((tool) => (
                <tr key={tool.policy.name} className="border-b border-border/60 align-top">
                  <td className="py-2 pe-3">
                    <span className="font-medium text-text" dir="ltr">
                      {tool.policy.name}
                    </span>
                    <span className="mt-0.5 block text-[11px] text-text-muted">
                      {ar.agent.toolDescriptions[tool.policy.name as keyof typeof ar.agent.toolDescriptions] ??
                        tool.policy.description}
                    </span>
                  </td>
                  <td className="py-2 pe-3">
                    {tool.policy.capability ? (
                      <span
                        className={`rounded-full border px-2 py-0.5 text-[11px] ${
                          tool.capabilityEnabled
                            ? 'border-success/40 bg-success/10 text-success'
                            : 'border-warning/40 bg-warning/10 text-warning'
                        }`}
                        dir="ltr"
                      >
                        {capabilityLabel(tool.policy.capability)}
                        {tool.capabilityEnabled ? '' : ` (${ar.common.disabled})`}
                      </span>
                    ) : (
                      <span className="text-text-muted">—</span>
                    )}
                  </td>
                  <td className="py-2 pe-3 text-text">{RISK_LABEL[tool.policy.risk] ?? tool.policy.risk}</td>
                  <td className="py-2 pe-3">
                    <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={tool.isAllowed}
                        disabled={pending}
                        onChange={(event) => toggleTool(tool.policy.name, { isAllowed: event.target.checked }, tool)}
                        aria-label={'السماح بالأداة ' + tool.policy.name}
                        className="h-5 w-5 accent-[var(--color-primary-dark)]"
                      />
                    </label>
                  </td>
                  <td className="py-2 pe-3">
                    <label className="inline-flex min-h-11 min-w-11 items-center justify-center">
                      <input
                        type="checkbox"
                        checked={tool.requiresConfirmation}
                        disabled={pending || tool.policy.risk === 'read'}
                        onChange={(event) =>
                          toggleTool(tool.policy.name, { requiresConfirmation: event.target.checked }, tool)
                        }
                        aria-label={'طلب تأكيد للأداة ' + tool.policy.name}
                        className="h-5 w-5 accent-[var(--color-primary-dark)]"
                      />
                    </label>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <div className="mt-3">
          <Feedback value={toolFeedback} />
        </div>
      </section>
    </div>
  )
}
