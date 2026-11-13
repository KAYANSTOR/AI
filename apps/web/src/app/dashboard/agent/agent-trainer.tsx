'use client'

import { useState, useRef, useEffect } from 'react'
import { Send, Loader2 } from 'lucide-react'
import type { AgentConsoleData } from './agent-console'
import { AgentConsole } from './agent-console'
import type { ReadinessResult } from '@/lib/ai/readiness'

type InitialProfileData = {
  businessTypeId: string
  industry: string
  setupDescription: string
  publicPhoneNumber: string
  systemPromptAddition: string
}

type ChatMessage = { id: string; role: 'user' | 'assistant'; content: string }

export function AgentTrainer({
  agentId,
  businessName,
  initialReadiness,
  consoleData,
  initialProfile: _initialProfile,
  view = 'train',
}: {
  agentId: string
  businessName: string
  initialReadiness: ReadinessResult
  consoleData: AgentConsoleData
  initialProfile?: InitialProfileData
  view?: 'train' | 'test' | 'settings'
}) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'w',
      role: 'assistant',
      content:
        view === 'test'
          ? `مرحبًا بك في «${businessName}». كيف أقدر أساعدك؟`
          : 'أهلاً بك. اكتب معلومات نشاطك لأحفظها في معرفة الوكيل.',
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const bottomRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  async function send() {
    const body = input.trim()
    if (!body || busy) return
    const next = [...messages, { id: crypto.randomUUID(), role: 'user' as const, content: body }]
    setMessages(next)
    setInput('')
    setBusy(true)
    setError(null)
    try {
      const endpoint = view === 'test' ? '/api/agent/test' : '/api/agent/train'
      const res = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          stream: false,
          messages: next.map((m) => ({ role: m.role, content: m.content })),
        }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) throw new Error(data.error || data.details || 'تعذّر الإرسال')
      const reply = data.reply || data.message || 'تم.'
      setMessages([...next, { id: crypto.randomUUID(), role: 'assistant', content: reply }])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'خطأ')
    } finally {
      setBusy(false)
    }
  }

  if (view === 'settings') {
    return (
      <div className="space-y-4">
        <h1 className="text-xl font-bold text-text">إعدادات الوكيل</h1>
        <AgentConsole data={consoleData} />
      </div>
    )
  }

  const isTrain = view === 'train'
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-text">{isTrain ? 'تدريب الوكيل' : 'اختبار الوكيل'}</h1>
        <p className="mt-1 text-sm text-text-muted">
          {isTrain ? `بناء معرفة «${businessName}»` : 'محاكاة عميل على بياناتك الحقيقية'}
        </p>
        <p className="mt-1 text-xs text-text-muted">جاهزية: {initialReadiness.score}%</p>
      </div>

      <div className="flex h-[560px] flex-col overflow-hidden rounded-2xl border border-border bg-surface">
        <div className="flex-1 space-y-3 overflow-y-auto p-4">
          {messages.map((m) => (
            <div key={m.id} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
              <div
                className={`max-w-[85%] rounded-2xl px-3 py-2 text-sm ${
                  m.role === 'user'
                    ? 'bg-primary text-primary-foreground'
                    : 'border border-border bg-background text-text'
                }`}
              >
                {m.content}
              </div>
            </div>
          ))}
          {busy ? (
            <div className="flex items-center gap-2 text-xs text-text-muted">
              <Loader2 className="h-4 w-4 animate-spin" /> جاري المعالجة…
            </div>
          ) : null}
          {error ? <p className="text-sm text-error">{error}</p> : null}
          <div ref={bottomRef} />
        </div>
        <form
          className="flex gap-2 border-t border-border p-3"
          onSubmit={(e) => {
            e.preventDefault()
            void send()
          }}
        >
          <input
            value={input}
            onChange={(e) => setInput(e.target.value)}
            disabled={busy}
            placeholder={isTrain ? 'اكتب معلومة عن نشاطك…' : 'اكتب كعميل…'}
            className="h-11 flex-1 rounded-xl border border-border bg-background px-3 text-sm text-text"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground disabled:opacity-50"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
          </button>
        </form>
      </div>
    </div>
  )
}
