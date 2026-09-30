'use client'

import { useChat } from '@ai-sdk/react'
import {
  DefaultChatTransport,
  getToolName,
  isDynamicToolUIPart,
  isTextUIPart,
  isToolUIPart,
  type UIMessage,
} from 'ai'
import { AlertCircle, Bot, Loader2, Send, Sparkles, User } from 'lucide-react'
import { useEffect, useRef, useState } from 'react'

/**
 * The transport is created once for the module: `useChat` keeps its options for the
 * lifetime of the chat, so rebuilding it per render would only throw work away.
 */
const transport = new DefaultChatTransport({ api: '/api/copilot' })

const WELCOME: UIMessage = {
  id: 'welcome',
  role: 'assistant',
  parts: [
    {
      type: 'text',
      text: 'أهلاً بك! أنا مساعد الأعمال (Copilot) الخاص بك في FrontDesk AI. كيف يمكنني مساعدتك في إدارة عملياتك وتحليل بياناتك اليوم؟',
    },
  ],
}

export default function CopilotPage() {
  const [input, setInput] = useState('')
  const { messages, sendMessage, status, error } = useChat({
    transport,
    messages: [WELCOME],
  })

  const busy = status === 'submitted' || status === 'streaming'
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  function onSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const text = input.trim()
    if (!text || busy) return
    setInput('')
    void sendMessage({ text })
  }

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-sm">
      <div className="flex items-center gap-3 border-b border-border bg-surface p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light/40">
          <Sparkles className="text-primary-dark" size={20} aria-hidden="true" />
        </div>
        <div>
          <h1 className="text-lg font-bold text-text">مساعد الأعمال (Copilot)</h1>
          <p className="text-xs text-text-muted">اسأل عن المبيعات، المحادثات، أو تحليلات فريقك.</p>
        </div>
      </div>

      <div className="flex-1 space-y-4 overflow-y-auto p-4">
        {messages.map((message) => (
          <div
            key={message.id}
            className={`flex gap-3 ${message.role === 'user' ? 'justify-end' : 'justify-start'}`}
          >
            {message.role === 'assistant' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light/50">
                <Bot size={16} className="text-primary-dark" aria-hidden="true" />
              </div>
            )}

            <div
              className={`max-w-[80%] rounded-2xl px-4 py-2 ${
                message.role === 'user'
                  ? 'bg-primary text-surface'
                  : 'border border-border bg-background text-text'
              }`}
            >
              {message.parts.map((part, index) => {
                if (isTextUIPart(part)) {
                  return (
                    <p
                      key={index}
                      className="whitespace-pre-wrap text-sm leading-relaxed"
                      dir="auto"
                    >
                      {part.text}
                    </p>
                  )
                }

                if (isToolUIPart(part) || isDynamicToolUIPart(part)) {
                  const done = part.state === 'output-available'
                  return (
                    <div
                      key={index}
                      className="mt-2 rounded border border-border bg-surface p-2 font-mono text-xs text-text-muted"
                    >
                      {done
                        ? `✓ تم جلب البيانات (${getToolName(part)})`
                        : `جارٍ جلب البيانات… (${getToolName(part)})`}
                    </div>
                  )
                }

                return null
              })}
            </div>

            {message.role === 'user' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-border bg-background">
                <User size={16} className="text-text-muted" aria-hidden="true" />
              </div>
            )}
          </div>
        ))}

        {busy && (
          <div className="flex items-center gap-2 text-xs text-text-muted" role="status">
            <Loader2 size={14} className="animate-spin" aria-hidden="true" />
            جارٍ التفكير…
          </div>
        )}

        {error && (
          <div
            role="alert"
            className="flex items-start gap-3 rounded-xl border border-error/40 bg-error/10 px-4 py-3"
          >
            <AlertCircle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-error" />
            <div className="text-sm text-text">
              <p className="font-semibold">تعذّر إكمال الطلب.</p>
              <p className="mt-1 text-text-muted" dir="auto">
                {error.message || 'خطأ غير معروف.'}
              </p>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      <div className="border-t border-border bg-surface p-4">
        <form onSubmit={onSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="اكتب سؤالك هنا…"
            className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={busy}
            dir="auto"
          />
          <button
            type="submit"
            disabled={busy || !input.trim()}
            aria-label="إرسال"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-surface transition-colors hover:bg-primary-dark disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send size={18} className="rtl:rotate-180" aria-hidden="true" />
          </button>
        </form>
      </div>
    </div>
  )
}
