'use client'

import { useState } from 'react'
import { Bot, Eraser, Loader2, Play, Send, Sparkles } from 'lucide-react'

type ChatRole = 'user' | 'assistant'

type ChatMessage = {
  id: string
  role: ChatRole
  content: string
  tools?: string[]
}

const WELCOME = 'أهلاً بك 👋\nأنا الوكيل كما سيظهر للعميل. اكتب رسالة حقيقية وجرب الاستفسار أو الحجز.'

const PRESETS = [
  'السلام عليكم',
  'ما الخدمات التي تقدمونها؟',
  'أريد حجز موعد غداً',
  'كم سعر الخدمة؟',
]

export function AgentPlayground({ agentId }: { agentId: string }) {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { id: 'welcome', role: 'assistant', content: WELCOME },
  ])
  const [history, setHistory] = useState<Array<{ role: ChatRole; content: string }>>([])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function sendMessage(text: string) {
    const clean = text.trim()
    if (!clean || busy) return

    const nextHistory = [...history, { role: 'user' as const, content: clean }]
    setHistory(nextHistory)
    setMessages((current) => [
      ...current,
      { id: crypto.randomUUID(), role: 'user', content: clean },
    ])
    setInput('')
    setError(null)
    setBusy(true)

    try {
      const response = await fetch('/api/agent/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ agentId, messages: nextHistory }),
      })
      const payload = (await response.json()) as {
        reply?: string
        toolTrace?: Array<{ name: string; simulated: boolean }>
        error?: string
      }

      if (!response.ok || !payload.reply) {
        throw new Error(payload.error || 'agent_preview_failed')
      }

      const assistant = { role: 'assistant' as const, content: payload.reply }
      setHistory((current) => [...current, assistant])
      setMessages((current) => [
        ...current,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: payload.reply!,
          tools: payload.toolTrace?.map((tool) => tool.name) ?? [],
        },
      ])
    } catch (err) {
      setError(
        err instanceof Error ? err.message : 'تعذّر تشغيل تجربة الوكيل.'
      )
    } finally {
      setBusy(false)
    }
  }

  function clearConversation() {
    if (busy) return
    setHistory([])
    setMessages([])
    setError(null)
  }

  return (
    <section className="rounded-xl border border-border bg-surface shadow-sm">
      <header className="border-b border-border p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary-light/40">
              <Play size={21} className="text-primary-dark" aria-hidden="true" />
            </span>
            <div>
              <h2 className="text-base font-bold text-text">تجربة الوكيل كعميل</h2>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                هذه محادثة محاكاة تستخدم نفس الوكيل وبيانات نشاطك. لا يتم إرسال رسائل حقيقية،
                وأي إنشاء لحجز أو طلب أو عميل يتم محاكاته فقط ولا يغيّر قاعدة البيانات.
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={clearConversation}
            disabled={busy}
            className="inline-flex min-h-10 items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-medium text-text hover:bg-background disabled:opacity-50"
          >
            <Eraser size={15} aria-hidden="true" />
            مسح المحادثة
          </button>
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {PRESETS.map((preset) => (
            <button
              key={preset}
              type="button"
              onClick={() => void sendMessage(preset)}
              disabled={busy}
              className="min-h-10 rounded-full border border-border bg-background px-3 py-2 text-xs text-text hover:border-primary/50 hover:bg-primary-light/20 disabled:opacity-50"
            >
              {preset}
            </button>
          ))}
        </div>
      </header>

      <div className="min-h-[360px] space-y-4 bg-background/40 p-4">
        {messages.length === 0 && (
          <div className="flex min-h-[290px] items-center justify-center">
            <div className="max-w-md text-center">
              <Sparkles size={26} className="mx-auto text-primary-dark" aria-hidden="true" />
              <p className="mt-3 text-sm font-medium text-text">ابدأ برسالة من العميل</p>
              <p className="mt-1 text-xs leading-relaxed text-text-muted">
                جرّب: «أريد حجز موعد غداً» ثم تابع الحوار كما لو كنت عميلًا حقيقيًا.
              </p>
            </div>
          </div>
        )}

        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex ${message.role === 'user' ? 'justify-end' : 'justify-start'} gap-2`}
          >
            {message.role === 'assistant' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light/50">
                <Bot size={15} className="text-primary-dark" aria-hidden="true" />
              </div>
            )}

            <div
              className={`max-w-[82%] rounded-2xl px-4 py-2.5 ${
                message.role === 'user'
                  ? 'bg-primary text-surface'
                  : 'border border-border bg-surface text-text'
              }`}
            >
              <p className="whitespace-pre-wrap text-sm leading-relaxed" dir="auto">
                {message.content}
              </p>

              {message.role === 'assistant' && message.tools && message.tools.length > 0 && (
                <div className="mt-2 border-t border-border pt-2 text-[10px] text-text-muted">
                  أدوات استخدمها الوكيل في المحاكاة: {message.tools.join('، ')}
                </div>
              )}
            </div>
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-text-muted" role="status">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            الوكيل يعالج رسالة العميل…
          </div>
        )}

        {error && (
          <div className="rounded-lg border border-error/40 bg-error/10 px-3 py-2 text-xs text-text" role="alert">
            تعذّر إكمال التجربة. أعد المحاولة، وإذا استمر الخطأ تحقق من إعداد Gemini والوكيل.
          </div>
        )}
      </div>

      <form
        onSubmit={(event) => {
          event.preventDefault()
          void sendMessage(input)
        }}
        className="flex gap-2 border-t border-border bg-surface p-4"
      >
        <input
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder="اكتب كأنك عميل: أريد حجز موعد غداً…"
          disabled={busy}
          className="min-h-11 flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
          dir="auto"
          aria-label="رسالة العميل التجريبية"
        />
        <button
          type="submit"
          disabled={busy || !input.trim()}
          aria-label="إرسال"
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-surface hover:bg-primary-dark disabled:opacity-50"
        >
          <Send size={17} className="rtl:rotate-180" aria-hidden="true" />
        </button>
      </form>
    </section>
  )
}
