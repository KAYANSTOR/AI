// @ts-nocheck
'use client'

import { useChat } from '@ai-sdk/react'
import { Send, Bot, User, Sparkles } from 'lucide-react'
import { useEffect, useRef } from 'react'

export default function CopilotPage() {
  const { messages, input, handleInputChange, handleSubmit, isLoading } = useChat({
    api: '/api/copilot',
    initialMessages: [
      {
        id: '1',
        role: 'assistant',
        content: 'أهلاً بك! أنا مساعد الأعمال (Copilot) الخاص بك في FrontDesk AI. كيف يمكنني مساعدتك في إدارة عملياتك وتحليل بياناتك اليوم؟'
      }
    ]
  })

  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  return (
    <div className="flex h-[calc(100vh-8rem)] flex-col rounded-xl border border-border bg-surface shadow-sm overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 border-b border-border bg-surface p-4">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary-light/40">
          <Sparkles className="text-primary-dark" size={20} />
        </div>
        <div>
          <h1 className="text-lg font-bold text-text">مساعد الأعمال (Copilot)</h1>
          <p className="text-xs text-text-muted">اسأل عن المبيعات، المحادثات، أو تحليلات فريقك.</p>
        </div>
      </div>

      {/* Chat Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map(m => (
          <div key={m.id} className={`flex gap-3 ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {m.role === 'assistant' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-primary-light/50">
                <Bot size={16} className="text-primary-dark" />
              </div>
            )}
            
            <div className={`max-w-[80%] rounded-2xl px-4 py-2 ${
              m.role === 'user' 
                ? 'bg-primary text-primary-foreground rounded-tr-sm' 
                : 'bg-surface-hover border border-border text-text rounded-tl-sm'
            }`}>
              {/* Note: In a real app, use ReactMarkdown to render the content */}
              <p className="whitespace-pre-wrap text-sm leading-relaxed">{m.content}</p>
              
              {/* Display tool invocations if any */}
              {m.toolInvocations?.map((toolInvocation) => {
                const toolCallId = toolInvocation.toolCallId
                if (toolInvocation.state === 'result') {
                  return (
                    <div key={toolCallId} className="mt-2 rounded bg-background p-2 text-xs text-text-muted font-mono border border-border">
                      ✓ تم جلب البيانات ({toolInvocation.toolName})
                    </div>
                  )
                } else {
                  return (
                    <div key={toolCallId} className="mt-2 rounded bg-background p-2 text-xs text-text-muted font-mono border border-border">
                      <span className="animate-pulse">جارٍ جلب البيانات...</span>
                    </div>
                  )
                }
              })}
            </div>

            {m.role === 'user' && (
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-background border border-border">
                <User size={16} className="text-text-muted" />
              </div>
            )}
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      {/* Input Area */}
      <div className="border-t border-border bg-surface p-4">
        <form onSubmit={handleSubmit} className="flex gap-2">
          <input
            value={input}
            onChange={handleInputChange}
            placeholder="اكتب سؤالك هنا..."
            className="flex-1 rounded-xl border border-border bg-background px-4 py-2.5 text-sm text-text placeholder-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
            disabled={isLoading}
            dir="auto"
          />
          <button
            type="submit"
            disabled={isLoading || !input.trim()}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
          >
            <Send size={18} className="rtl:rotate-180" />
          </button>
        </form>
      </div>
    </div>
  )
}
