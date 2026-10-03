'use client'

import { useState, useRef, useEffect, useTransition } from 'react'
import {
  Bot,
  Send,
  Loader2,
  Sparkles,
  CheckCircle2,
  AlertCircle,
  HelpCircle,
  Building2,
  Briefcase,
  Tag,
  ShieldCheck,
  Plus,
  Trash2,
  Edit3,
  RotateCcw,
  ArrowRight,
  ChevronDown,
  ChevronUp,
  User,
  Sliders,
  Check,
  X,
  MessageSquare,
} from 'lucide-react'
import type { AgentConsoleData } from './agent-console'
import { AgentConsole } from './agent-console'
import type { ReadinessResult } from '@/lib/ai/readiness'
import {
  saveAgentKnowledgeItemAction,
  deleteAgentKnowledgeItemAction,
  toggleAgentKnowledgeItemAction,
  updateBusinessTypeAndInstructionsAction,
} from './actions'

type InitialProfileData = {
  businessTypeId: string
  industry: string
  setupDescription: string
  publicPhoneNumber: string
  systemPromptAddition: string
}

type ChatMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  savedFacts?: Array<{ title: string; category: string }>
}

type TestMessage = {
  id: string
  role: 'user' | 'assistant'
  content: string
  tools?: string[]
}

const BUSINESS_TYPE_OPTIONS = [
  {
    id: 'it_technology',
    label: 'شركة تكنولوجيا المعلومات',
    badge: 'جديد',
    hint: 'حلول برمجية، استشارات تقنية، خدمات سحابية ودعم فني',
  },
  {
    id: 'appointments',
    label: 'الحجوزات والمواعيد',
    hint: 'عيادات وصالونات ومراكز وخدمات تعتمد على المواعيد',
  },
  {
    id: 'sales',
    label: 'المبيعات والتجارة',
    hint: 'متاجر وموزّعون وشركات تبيع منتجات أو خدمات',
  },
  {
    id: 'home_services',
    label: 'الخدمات المنزلية والميدانية',
    hint: 'تنظيف وصيانة وتكييف وسباكة وزيارات ميدانية',
  },
  {
    id: 'weddings_events',
    label: 'تنسيق وتنظيم الأعراس والفعاليات',
    hint: 'شركات تنظيم الفعاليات والمناسبات والمعارض',
  },
  {
    id: 'custom',
    label: 'نشاط مخصّص',
    hint: 'نشاط آخر باستخدام وحدات عامة وحقول قابلة للتهيئة',
  },
]

const DEFAULT_WELCOME = `أهلًا بك 👋 أنا مساعدك الذكي لشركتك. سأساعدك في تجهيز معلومات شركتك حتى أتمكن من الرد على عملائك بطريقة صحيحة وطبيعية.
سأطرح عليك بعض الأسئلة، وأثناء حديثنا سأكتشف المعلومات التي أحتاجها وأرتبها تلقائيًا.
لن تحتاج إلى تعبئة نماذج طويلة، فقط تحدث معي كأنك تتحدث مع موظف يفهمك.`

const TEST_PRESETS = [
  { label: 'طلب حجز موعد', text: 'مرحبًا، أريد حجز موعد لديكم.' },
  { label: 'استفسار عن الأسعار', text: 'كم سعر الخدمة لديكم؟ وما طرق الدفع؟' },
  { label: 'ساعات العمل', text: 'ما هي ساعات وأيام العمل لديكم؟' },
  { label: 'سؤال غير موجود في المعرفة', text: 'هل تقدمون شحن طرود سريعة إلى خارج الدولة؟' },
  { label: 'طلب التحدث مع موظف', text: 'أريد التحدث مع موظف خدمة العملاء من فضلكم.' },
]

export function AgentTrainer({
  agentId,
  businessName,
  initialReadiness,
  consoleData,
  initialProfile,
}: {
  agentId: string
  businessName: string
  initialReadiness: ReadinessResult
  consoleData: AgentConsoleData
  initialProfile?: InitialProfileData
}) {
  const [activeTab, setActiveTab] = useState<'train' | 'test' | 'settings'>('train')
  const [readiness, setReadiness] = useState<ReadinessResult>(initialReadiness)

  // ─────────────────────────────────────────────────────────────
  // BUSINESS PROFILE & TYPE MODAL STATE
  // ─────────────────────────────────────────────────────────────
  const [isProfileModalOpen, setIsProfileModalOpen] = useState(false)
  const [profileSaving, setProfileSaving] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [currentBusinessName, setCurrentBusinessName] = useState(businessName)
  const [profileForm, setProfileForm] = useState<InitialProfileData & { businessName: string }>({
    businessName: businessName,
    businessTypeId: initialProfile?.businessTypeId || 'it_technology',
    industry: initialProfile?.industry || '',
    setupDescription: initialProfile?.setupDescription || '',
    publicPhoneNumber: initialProfile?.publicPhoneNumber || '',
    systemPromptAddition: initialProfile?.systemPromptAddition || '',
  })

  // ─────────────────────────────────────────────────────────────
  // TRAINING SESSION STATE
  // ─────────────────────────────────────────────────────────────
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'welcome',
      role: 'assistant',
      content: DEFAULT_WELCOME,
    },
  ])
  const [input, setInput] = useState('')
  const [busy, setBusy] = useState(false)
  const [trainError, setTrainError] = useState<string | null>(null)
  const [toastMessage, setToastMessage] = useState<string | null>(null)
  const chatBottomRef = useRef<HTMLDivElement>(null)

  // ─────────────────────────────────────────────────────────────
  // TESTING SESSION STATE
  // ─────────────────────────────────────────────────────────────
  const [testMessages, setTestMessages] = useState<TestMessage[]>([
    {
      id: 'test-welcome',
      role: 'assistant',
      content: `مرحبًا بك في «${currentBusinessName}»! كيف يمكنني مساعدتك اليوم؟`,
    },
  ])
  const [testHistory, setTestHistory] = useState<Array<{ role: 'user' | 'assistant'; content: string }>>([])
  const [testInput, setTestInput] = useState('')
  const [testBusy, setTestBusy] = useState(false)
  const [testError, setTestError] = useState<string | null>(null)
  const testBottomRef = useRef<HTMLDivElement>(null)

  // ─────────────────────────────────────────────────────────────
  // KNOWLEDGE BASE MANAGEMENT MODAL / FORM STATE
  // ─────────────────────────────────────────────────────────────
  const [expandedCategory, setExpandedCategory] = useState<string | null>('business_info')
  const [editingItem, setEditingItem] = useState<{
    id?: string
    title: string
    content: string
    category: string
  } | null>(null)
  const [isPending, startTransition] = useTransition()

  useEffect(() => {
    chatBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages, busy])

  useEffect(() => {
    testBottomRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [testMessages, testBusy])

  function showToast(msg: string) {
    setToastMessage(msg)
    setTimeout(() => setToastMessage(null), 4000)
  }

  // Send message in Training mode
  async function handleSendTrain(textToSend?: string) {
    const text = (textToSend || input).trim()
    if (!text || busy) return

    const userMessage: ChatMessage = {
      id: crypto.randomUUID(),
      role: 'user',
      content: text,
    }

    const assistantMsgId = crypto.randomUUID()
    const placeholderAssistant: ChatMessage = {
      id: assistantMsgId,
      role: 'assistant',
      content: '',
      savedFacts: [],
    }

    const nextMessages = [...messages, userMessage]
    setMessages([...nextMessages, placeholderAssistant])
    setInput('')
    setTrainError(null)
    setBusy(true)

    try {
      const payloadMessages = nextMessages.map((m) => ({
        role: m.role,
        content: m.content,
      }))

      const response = await fetch('/api/agent/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          stream: true,
          messages: payloadMessages,
        }),
      })

      if (!response.ok || !response.body) {
        throw new Error('تعذّر الاتصال بخادم التدريب.')
      }

      const reader = response.body.getReader()
      const decoder = new TextDecoder()
      let streamText = ''
      let done = false

      while (!done) {
        const { value, done: readerDone } = await reader.read()
        done = readerDone
        if (value) {
          const chunkStr = decoder.decode(value, { stream: true })
          const lines = chunkStr.split('\n')
          for (const line of lines) {
            if (line.startsWith('data: ')) {
              const dataStr = line.slice(6).trim()
              try {
                const data = JSON.parse(dataStr)
                if (data.type === 'token') {
                  streamText += data.content
                  setMessages((prev) =>
                    prev.map((m) => (m.id === assistantMsgId ? { ...m, content: streamText } : m))
                  )
                } else if (data.type === 'token_reset') {
                  streamText = data.content
                  setMessages((prev) =>
                    prev.map((m) => (m.id === assistantMsgId ? { ...m, content: streamText } : m))
                  )
                } else if (data.type === 'done') {
                  setMessages((prev) =>
                    prev.map((m) =>
                      m.id === assistantMsgId
                        ? {
                            ...m,
                            content: data.reply || streamText,
                            savedFacts: data.savedFacts || [],
                          }
                        : m
                    )
                  )
                  if (data.readiness) {
                    setReadiness(data.readiness)
                  }
                  if (data.savedFacts && data.savedFacts.length > 0) {
                    showToast(`تم استيعاب وحفظ ${data.savedFacts.length} معلومة مؤكدة في ذاكرة الوكيل.`)
                  }
                } else if (data.type === 'error') {
                  throw new Error(data.error)
                }
              } catch {
                // Ignore parse errors on partial chunks
              }
            }
          }
        }
      }
    } catch (err) {
      setTrainError(err instanceof Error ? err.message : 'تعذّر إرسال الرسالة.')
      setMessages((prev) => prev.filter((m) => m.id !== assistantMsgId || m.content.length > 0))
    } finally {
      setBusy(false)
    }
  }

  // Send message in Customer Test mode
  async function handleSendTest(textToSend?: string) {
    const text = (textToSend || testInput).trim()
    if (!text || testBusy) return

    const userEntry = { role: 'user' as const, content: text }
    const nextHistory = [...testHistory, userEntry]
    setTestHistory(nextHistory)

    setTestMessages((curr) => [
      ...curr,
      { id: crypto.randomUUID(), role: 'user', content: text },
    ])
    setTestInput('')
    setTestError(null)
    setTestBusy(true)

    try {
      const res = await fetch('/api/agent/test', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          messages: nextHistory,
        }),
      })

      const payload = await res.json()
      if (!res.ok || !payload.reply) {
        throw new Error(payload.error || 'فشل تجربة الوكيل.')
      }

      const assistantEntry = { role: 'assistant' as const, content: payload.reply }
      setTestHistory([...nextHistory, assistantEntry])

      setTestMessages((curr) => [
        ...curr,
        {
          id: crypto.randomUUID(),
          role: 'assistant',
          content: payload.reply,
          tools: payload.toolTrace?.map((t: { name: string }) => t.name) || [],
        },
      ])
    } catch (err) {
      setTestError(err instanceof Error ? err.message : 'حدث خطأ أثناء تجربة الوكيل.')
    } finally {
      setTestBusy(false)
    }
  }

  function handleSaveManualKnowledge(e: React.FormEvent) {
    e.preventDefault()
    if (!editingItem || !editingItem.title.trim() || !editingItem.content.trim()) return

    startTransition(async () => {
      const res = await saveAgentKnowledgeItemAction({
        id: editingItem.id || null,
        title: editingItem.title,
        content: editingItem.content,
        category: editingItem.category,
      })

      if (res.ok) {
        showToast(res.message || 'تم حفظ المعلومة بنجاح.')
        setEditingItem(null)
        // Refresh readiness client-side
        const r = await fetch('/api/agent/train', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            agentId,
            messages: [{ role: 'user', content: 'تحديث الجاهزية' }],
          }),
        })
        const data = await r.json()
        if (data?.readiness) setReadiness(data.readiness)
      } else {
        alert(res.error || 'تعذّر الحفظ.')
      }
    })
  }

  function handleDeleteKnowledge(id: string) {
    if (!confirm('هل أنت متأكد من حذف هذه المعلومة من ذاكرة الوكيل؟')) return
    startTransition(async () => {
      const res = await deleteAgentKnowledgeItemAction(id)
      if (res.ok) {
        showToast('تم حذف المعلومة بنجاح.')
        setReadiness((prev) => ({
          ...prev,
          categories: prev.categories.map((c) => ({
            ...c,
            items: c.items.filter((i) => i.id !== id),
          })),
        }))
      }
    })
  }

  function handleToggleKnowledge(id: string, currentActive: boolean) {
    startTransition(async () => {
      const res = await toggleAgentKnowledgeItemAction(id, !currentActive)
      if (res.ok) {
        setReadiness((prev) => ({
          ...prev,
          categories: prev.categories.map((c) => ({
            ...c,
            items: c.items.map((i) => (i.id === id ? { ...i, isActive: !currentActive } : i)),
          })),
        }))
      }
    })
  }

  const scoreColor =
    readiness.score >= 80
      ? 'text-emerald-600 bg-emerald-50 dark:bg-emerald-950/40 border-emerald-200 dark:border-emerald-800'
      : readiness.score >= 50
      ? 'text-amber-600 bg-amber-50 dark:bg-amber-950/40 border-amber-200 dark:border-amber-800'
      : 'text-rose-600 bg-rose-50 dark:bg-rose-950/40 border-rose-200 dark:border-rose-800'

  async function handleSaveProfileForm(e: React.FormEvent) {
    e.preventDefault()
    setProfileSaving(true)
    setProfileError(null)

    try {
      const res = await updateBusinessTypeAndInstructionsAction({
        agentId,
        businessName: profileForm.businessName,
        businessTypeId: profileForm.businessTypeId,
        industry: profileForm.industry,
        setupDescription: profileForm.setupDescription,
        publicPhoneNumber: profileForm.publicPhoneNumber,
        systemPromptAddition: profileForm.systemPromptAddition,
      })

      if (!res.ok) {
        throw new Error(res.error || 'تعذّر تحديث البيانات.')
      }

      setCurrentBusinessName(profileForm.businessName)
      showToast('تم تحديث نوع النشاط والبيانات وتعليمات الوكيل بنجاح!')
      setIsProfileModalOpen(false)

      // Refresh readiness
      const r = await fetch('/api/agent/train', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          agentId,
          messages: [{ role: 'user', content: 'تحديث بيانات الشركة والنشاط' }],
        }),
      })
      const data = await r.json()
      if (data?.readiness) setReadiness(data.readiness)
    } catch (err) {
      setProfileError(err instanceof Error ? err.message : 'حدث خطأ أثناء الحفظ.')
    } finally {
      setProfileSaving(false)
    }
  }

  return (
    <div className="space-y-6">
      {/* Toast notification */}
      {toastMessage && (
        <div className="fixed top-20 start-1/2 -translate-x-1/2 z-50 rounded-xl bg-surface border border-primary/40 px-5 py-3 shadow-lg flex items-center gap-3 text-sm font-semibold text-primary-dark animate-fade-in">
          <CheckCircle2 size={18} className="text-primary" />
          <span>{toastMessage}</span>
        </div>
      )}

      {/* Main Navigation Tabs & Action Button */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
        <div className="flex flex-1 border-b border-border bg-surface rounded-2xl p-1.5 shadow-xs">
          <button
            type="button"
            onClick={() => setActiveTab('train')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'train'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-muted hover:text-text hover:bg-background/60'
            }`}
          >
            <Sparkles size={18} />
            <span>جلسة تدريب الوكيل (بناء المعرفة)</span>
            <span className="ms-1.5 rounded-full bg-white/20 px-2 py-0.5 text-xs">
              {readiness.score}%
            </span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('test')}
            className={`flex-1 flex items-center justify-center gap-2 py-3 px-4 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'test'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-muted hover:text-text hover:bg-background/60'
            }`}
          >
            <Bot size={18} />
            <span>اختبر الوكيل كعميل حقيقي</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('settings')}
            className={`flex items-center justify-center gap-2 py-3 px-5 rounded-xl text-sm font-bold transition-all ${
              activeTab === 'settings'
                ? 'bg-primary text-white shadow-sm'
                : 'text-text-muted hover:text-text hover:bg-background/60'
            }`}
          >
            <Sliders size={18} />
            <span>الإعدادات المتقدمة</span>
          </button>
        </div>

        {/* Embedded action button requested by user */}
        <button
          type="button"
          onClick={() => setIsProfileModalOpen(true)}
          className="flex items-center justify-center gap-2 py-3 px-5 rounded-2xl text-sm font-bold bg-primary text-white hover:bg-primary-dark transition-all shadow-sm shrink-0"
        >
          <Building2 size={18} />
          <span>تحديث نوع النشاط والبيانات</span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: AGENT TRAINING (CONVERSATIONAL INTERVIEW & KNOWLEDGE)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === 'train' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Main Chat Interface (7 cols) */}
          <div className="lg:col-span-7 flex flex-col h-[740px] rounded-2xl border border-border bg-surface shadow-sm overflow-hidden">
            {/* Chat Header */}
            <div className="border-b border-border bg-background/50 px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light/40 text-primary-dark">
                  <Bot size={22} />
                </div>
                <div>
                  <h2 className="text-base font-bold text-text flex items-center gap-2">
                    جلسة تدريب الوكيل الذكي
                    <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
                  </h2>
                  <p className="text-xs text-text-muted">
                    تحدث مع الوكيل بحرية، وسيقوم هو باستيعاب وحفظ معلومات نشاطك تلقائياً.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm('هل تريد بدء جلسة تدريب جديدة من البداية؟')) {
                    setMessages([{ id: 'welcome', role: 'assistant', content: DEFAULT_WELCOME }])
                  }
                }}
                className="flex items-center gap-1.5 text-xs text-text-muted hover:text-text px-2.5 py-1.5 rounded-lg border border-border hover:bg-surface transition-colors"
                title="إعادة ضبط الجلسة"
              >
                <RotateCcw size={14} />
                <span>إعادة ضبط</span>
              </button>
            </div>

            {/* Messages Body */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4">
              {messages.map((msg) => (
                <div
                  key={msg.id}
                  className={`flex gap-3 ${
                    msg.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {msg.role === 'assistant' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-light/50 text-primary-dark mt-1">
                      <Bot size={17} />
                    </div>
                  )}

                  <div className="max-w-[85%] space-y-2">
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed ${
                        msg.role === 'user'
                          ? 'bg-primary text-white rounded-br-xs'
                          : 'border border-border bg-background text-text rounded-bl-xs'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{msg.content}</p>
                    </div>

                    {/* Saved knowledge badge if extracted in this turn */}
                    {msg.savedFacts && msg.savedFacts.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        {msg.savedFacts.map((fact, idx) => (
                          <span
                            key={idx}
                            className="inline-flex items-center gap-1.5 text-xs px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/40 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800"
                          >
                            <CheckCircle2 size={13} />
                            <span>تم استيعاب وحفظ: <strong>{fact.title}</strong></span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>

                  {msg.role === 'user' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary text-white mt-1">
                      <User size={16} />
                    </div>
                  )}
                </div>
              ))}

              {busy && (
                <div className="flex items-center gap-2 text-xs text-text-muted py-2 px-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-light/30">
                    <Loader2 size={14} className="animate-spin text-primary" />
                  </div>
                  <span>الوكيل يفكر ويرتب المعلومات المستخلصة…</span>
                </div>
              )}

              {trainError && (
                <div className="flex items-center gap-2 rounded-xl border border-error/40 bg-error/10 p-3 text-xs text-error">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>{trainError}</span>
                </div>
              )}

              <div ref={chatBottomRef} />
            </div>

            {/* Quick Prompt Suggestions */}
            <div className="px-5 py-2 border-t border-border bg-surface flex items-center gap-2 overflow-x-auto no-scrollbar">
              <span className="text-[11px] text-text-muted shrink-0 flex items-center gap-1">
                <Sparkles size={12} className="text-primary" />
                اقتراحات:
              </span>
              <button
                type="button"
                onClick={() =>
                  handleSendTrain(
                    `اسم شركتنا هو «${currentBusinessName}»، ونقدم خدمات متخصصة لعملائنا.`
                  )
                }
                className="text-xs px-2.5 py-1 rounded-full border border-border bg-background hover:bg-surface text-text-muted hover:text-text shrink-0 transition-colors"
              >
                نبذة عن الشركة
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSendTrain(
                    'أريد توضيح قائمة الخدمات والمنتجات التي نقدمها وأسعارها.'
                  )
                }
                className="text-xs px-2.5 py-1 rounded-full border border-border bg-background hover:bg-surface text-text-muted hover:text-text shrink-0 transition-colors"
              >
                الخدمات والأسعار
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSendTrain(
                    'أوقات العمل الرسمية لدينا هي من الأحد إلى الخميس من 9 صباحاً حتى 6 مساءً.'
                  )
                }
                className="text-xs px-2.5 py-1 rounded-full border border-border bg-background hover:bg-surface text-text-muted hover:text-text shrink-0 transition-colors"
              >
                أوقات العمل
              </button>
              <button
                type="button"
                onClick={() =>
                  handleSendTrain(
                    'سياسة الحجز تتطلب حجزاً مسبقاً، ويمكن الإلغاء قبل 24 ساعة من الموعد.'
                  )
                }
                className="text-xs px-2.5 py-1 rounded-full border border-border bg-background hover:bg-surface text-text-muted hover:text-text shrink-0 transition-colors"
              >
                سياسة الحجز والإلغاء
              </button>
            </div>

            {/* Input Form */}
            <div className="border-t border-border bg-surface p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSendTrain()
                }}
                className="flex items-center gap-3"
              >
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="تحدث مع الوكيل... مثلاً: اسم شركتنا، خدماتنا، أوقات العمل، الأسعار، السياسات..."
                  disabled={busy}
                  className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  dir="auto"
                />
                <button
                  type="submit"
                  disabled={busy || !input.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs"
                  aria-label="إرسال"
                >
                  <Send size={18} className="rtl:rotate-180" />
                </button>
              </form>
            </div>
          </div>

          {/* Right Column: Readiness & Structured Knowledge Memory (5 cols) */}
          <div className="lg:col-span-5 space-y-6">
            {/* Readiness Card */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-text">جاهزية الوكيل للعمل</h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    تزداد الجاهزية تلقائياً كلما زودت الوكيل بمعلومات إضافية.
                  </p>
                </div>
                <div
                  className={`flex items-center justify-center px-3 py-1.5 rounded-xl border text-sm font-bold ${scoreColor}`}
                >
                  {readiness.score}%
                </div>
              </div>

              {/* Progress bar */}
              <div className="h-2.5 w-full rounded-full bg-border overflow-hidden">
                <div
                  className="h-full bg-primary rounded-full transition-all duration-500 ease-out"
                  style={{ width: `${readiness.score}%` }}
                />
              </div>

              <div className="flex items-center justify-between text-xs text-text-muted pt-1 border-t border-border">
                <span>المعلومات المسجلة: <strong>{readiness.summary.totalItems}</strong></span>
                <span>الأقسام المكتملة: <strong>{readiness.summary.categoriesCovered} / {readiness.summary.totalCategories}</strong></span>
              </div>
            </div>

            {/* Missing Info Recommendations */}
            {readiness.missingItems.length > 0 && (
              <div className="rounded-2xl border border-warning/30 bg-warning/5 p-5 shadow-sm space-y-3">
                <div className="flex items-center gap-2 text-warning-dark font-bold text-xs">
                  <AlertCircle size={15} />
                  <span>معلومات ناقصة يُنصح بإضافتها للوكيل:</span>
                </div>
                <div className="space-y-2">
                  {readiness.missingItems.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => handleSendTrain(item.promptHint)}
                      className="w-full text-start p-2.5 rounded-xl border border-border bg-surface hover:border-primary/50 hover:bg-primary-light/10 transition-all flex items-center justify-between text-xs text-text group"
                    >
                      <span>• {item.label}</span>
                      <span className="text-primary text-[11px] font-semibold opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1">
                        تزويد الوكيل
                        <ArrowRight size={12} className="rtl:rotate-180" />
                      </span>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Current Knowledge Base Accordion */}
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="text-sm font-bold text-text">ذاكرة ومعرفة الوكيل الحالية</h3>
                  <p className="text-xs text-text-muted mt-0.5">
                    المعلومات المنظمة التي يستخدمها الوكيل للرد على العملاء.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() =>
                    setEditingItem({
                      title: '',
                      content: '',
                      category: 'general',
                    })
                  }
                  className="flex items-center gap-1 text-xs font-semibold px-2.5 py-1.5 rounded-lg bg-primary text-white hover:bg-primary-dark transition-colors shadow-xs"
                >
                  <Plus size={14} />
                  <span>إضافة معلومة</span>
                </button>
              </div>

              {/* Categorized Knowledge List */}
              <div className="space-y-3 pt-2">
                {readiness.categories.map((cat) => {
                  const isExpanded = expandedCategory === cat.id
                  return (
                    <div
                      key={cat.id}
                      className="rounded-xl border border-border overflow-hidden bg-background/30"
                    >
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedCategory(isExpanded ? null : cat.id)
                        }
                        className="w-full px-4 py-3 flex items-center justify-between text-start text-xs font-bold text-text hover:bg-background/80 transition-colors"
                      >
                        <div className="flex items-center gap-2">
                          {cat.id === 'business_info' && <Building2 size={16} className="text-primary" />}
                          {cat.id === 'service_info' && <Briefcase size={16} className="text-primary" />}
                          {cat.id === 'pricing' && <Tag size={16} className="text-primary" />}
                          {cat.id === 'policy' && <ShieldCheck size={16} className="text-primary" />}
                          {cat.id === 'faq' && <HelpCircle size={16} className="text-primary" />}
                          <span>{cat.title}</span>
                          <span className="ms-1 px-2 py-0.5 rounded-full bg-surface text-[11px] text-text-muted border border-border">
                            {cat.items.length}
                          </span>
                        </div>
                        {isExpanded ? <ChevronUp size={16} /> : <ChevronDown size={16} />}
                      </button>

                      {isExpanded && (
                        <div className="p-3 border-t border-border bg-surface space-y-2">
                          {cat.items.length === 0 ? (
                            <p className="text-xs text-text-muted text-center py-3">
                              لا توجد معلومات مسجلة في هذا القسم بعد. تحدث مع الوكيل لإضافتها!
                            </p>
                          ) : (
                            cat.items.map((item) => (
                              <div
                                key={item.id}
                                className={`p-3 rounded-xl border ${
                                  item.isActive
                                    ? 'border-border bg-background/40'
                                    : 'border-border/50 bg-background/20 opacity-60'
                                } space-y-2`}
                              >
                                <div className="flex items-start justify-between gap-2">
                                  <h4 className="text-xs font-bold text-text">
                                    {item.title}
                                  </h4>
                                  <div className="flex items-center gap-1.5 shrink-0">
                                    <button
                                      type="button"
                                      onClick={() => handleToggleKnowledge(item.id, item.isActive)}
                                      className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors ${
                                        item.isActive
                                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300'
                                          : 'bg-stone-200 text-stone-600 dark:bg-stone-800 dark:text-stone-400'
                                      }`}
                                    >
                                      {item.isActive ? 'مفعّلة' : 'معطّلة'}
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() =>
                                        setEditingItem({
                                          id: item.id,
                                          title: item.title,
                                          content: item.content,
                                          category: item.category,
                                        })
                                      }
                                      className="p-1 rounded text-text-muted hover:text-text hover:bg-background"
                                      title="تعديل"
                                    >
                                      <Edit3 size={13} />
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteKnowledge(item.id)}
                                      className="p-1 rounded text-text-muted hover:text-error hover:bg-error/10"
                                      title="حذف"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                                <p className="text-xs text-text-muted leading-relaxed whitespace-pre-wrap">
                                  {item.content}
                                </p>
                              </div>
                            ))
                          )}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: TEST THE AGENT (AS A REAL CUSTOMER)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === 'test' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Simulated WhatsApp / Live Chat Container (8 cols) */}
          <div className="lg:col-span-8 flex flex-col h-[740px] rounded-2xl border border-border bg-surface shadow-2xs overflow-hidden">
            {/* Simulator Header - Brand Primary */}
            <div className="border-b border-white/10 bg-primary-dark text-white px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-white/15 text-white font-bold">
                  <Bot size={22} />
                </div>
                <div>
                  <h2 className="text-base font-bold flex items-center gap-2">
                    {consoleData.name || 'وكيل الاستقبال'} (تجربة عميل)
                  </h2>
                  <p className="text-xs text-white/80">
                    محاكاة حقيقية لرد الوكيل على استفسارات وحجوزات العملاء.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => {
                  setTestHistory([])
                  setTestMessages([
                    {
                      id: 'test-welcome',
                      role: 'assistant',
                      content: `مرحبًا بك في «${currentBusinessName}»! كيف يمكنني مساعدتك اليوم؟`,
                    },
                  ])
                }}
                className="flex items-center gap-1.5 text-xs bg-white/15 hover:bg-white/25 text-white px-3 py-1.5 rounded-lg transition-colors font-semibold"
              >
                <RotateCcw size={14} />
                <span>محادثة جديدة</span>
              </button>
            </div>

            {/* Messages Area - Warm Sand Background */}
            <div className="flex-1 overflow-y-auto p-5 space-y-4 bg-background">
              {testMessages.map((m) => (
                <div
                  key={m.id}
                  className={`flex gap-3 ${
                    m.role === 'user' ? 'justify-end' : 'justify-start'
                  }`}
                >
                  {m.role === 'assistant' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-primary-light/40 text-primary-dark mt-1">
                      <Bot size={17} />
                    </div>
                  )}

                  <div className="max-w-[80%] space-y-2">
                    <div
                      className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-2xs ${
                        m.role === 'user'
                          ? 'bg-primary text-white rounded-br-xs shadow-xs'
                          : 'border border-border bg-surface text-text rounded-bl-xs'
                      }`}
                    >
                      <p className="whitespace-pre-wrap">{m.content}</p>
                    </div>

                    {/* Tool execution indicator */}
                    {m.tools && m.tools.length > 0 && (
                      <div className="flex items-center gap-1.5 text-[11px] text-text-muted bg-surface/90 border border-border/60 rounded-md px-2 py-0.5 w-fit">
                        <Check size={11} className="text-primary-dark" />
                        <span>تم استخدام الأداة: <strong>{m.tools.join(', ')}</strong></span>
                      </div>
                    )}
                  </div>

                  {m.role === 'user' && (
                    <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-dark text-white mt-1">
                      <User size={16} />
                    </div>
                  )}
                </div>
              ))}

              {testBusy && (
                <div className="flex items-center gap-2 text-xs text-text-muted py-2 px-1">
                  <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary-light/40 text-primary-dark">
                    <Loader2 size={14} className="animate-spin" />
                  </div>
                  <span>الوكيل يبحث في المعرفة ويصيغ الرد الموثوق…</span>
                </div>
              )}

              {testError && (
                <div className="flex items-center gap-2 rounded-xl border border-error/40 bg-error/10 p-3 text-xs text-error">
                  <AlertCircle size={16} className="shrink-0" />
                  <span>
                    {testError === 'agent_preview_failed'
                      ? 'تعذّر إكمال استجابة الوكيل حالياً. تم تحديث الإعدادات، يرجى المحاولة مرة أخرى.'
                      : testError}
                  </span>
                </div>
              )}

              <div ref={testBottomRef} />
            </div>

            {/* Input Form */}
            <div className="border-t border-border bg-surface p-4">
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  handleSendTest()
                }}
                className="flex items-center gap-3"
              >
                <input
                  type="text"
                  value={testInput}
                  onChange={(e) => setTestInput(e.target.value)}
                  placeholder="اكتب استفسارك كعميل... مثلاً: كم السعر؟ هل لديكم مواعيد؟"
                  disabled={testBusy}
                  className="flex-1 rounded-xl border border-border bg-background px-4 py-3 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                  dir="auto"
                />
                <button
                  type="submit"
                  disabled={testBusy || !testInput.trim()}
                  className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary text-white hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors shadow-xs"
                  aria-label="إرسال"
                >
                  <Send size={18} className="rtl:rotate-180" />
                </button>
              </form>
            </div>
          </div>

          {/* Test Scenarios Sidebar (4 cols) */}
          <div className="lg:col-span-4 space-y-5">
            <div className="rounded-2xl border border-border bg-surface p-5 shadow-sm space-y-3">
              <div className="flex items-center gap-2 text-text font-bold text-sm">
                <MessageSquare size={17} className="text-primary-dark" />
                <span>سيناريوهات اختبار جاهزة:</span>
              </div>
              <p className="text-xs text-text-muted leading-relaxed">
                اضغط على أي سيناريو لاختبار طريقة تصرف الوكيل الذكي باستخدام بيانات شركتك الحقيقية:
              </p>

              <div className="space-y-2 pt-1">
                {TEST_PRESETS.map((p, idx) => (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => handleSendTest(p.text)}
                    className="w-full text-start p-3 rounded-xl border border-border bg-background hover:bg-surface hover:border-primary/50 transition-all text-xs space-y-1 group"
                  >
                    <div className="font-bold text-text group-hover:text-primary-dark transition-colors flex items-center justify-between">
                      <span>{p.label}</span>
                      <ArrowRight size={13} className="opacity-0 group-hover:opacity-100 transition-opacity rtl:rotate-180" />
                    </div>
                    <p className="text-text-muted truncate">«{p.text}»</p>
                  </button>
                ))}
              </div>
            </div>

            {/* Quality and Strict Policy Box */}
            <div className="rounded-2xl border border-border bg-background/50 p-5 space-y-2.5 text-xs text-text-muted leading-relaxed">
              <div className="flex items-center gap-2 font-bold text-text">
                <ShieldCheck size={16} className="text-primary-dark" />
                <span>قاعدة عدم اختراع المعلومات</span>
              </div>
              <p>
                الوكيل مدرب بصرامة على ألا يختلق أي معلومة غير موجودة في قاعدة المعرفة. إذا سأله العميل عن شيء غير معروف، سيعتذر بلطف ويقترح التحويل لموظف بشري.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: ADVANCED SETTINGS (PROMPT VERSIONS, PERMISSIONS)
         ───────────────────────────────────────────────────────────── */}
      {activeTab === 'settings' && (
        <div className="space-y-6">
          <AgentConsole data={consoleData} />
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          EDIT / ADD KNOWLEDGE MODAL
         ───────────────────────────────────────────────────────────── */}
      {editingItem && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-xs p-4">
          <div className="w-full max-w-lg rounded-2xl border border-border bg-surface p-6 shadow-xl space-y-5 animate-scale-in">
            <div className="flex items-center justify-between border-b border-border pb-3">
              <h3 className="text-base font-bold text-text">
                {editingItem.id ? 'تعديل معلومة في ذاكرة الوكيل' : 'إضافة معلومة جديدة لذاكرة الوكيل'}
              </h3>
              <button
                type="button"
                onClick={() => setEditingItem(null)}
                className="p-1 rounded-lg text-text-muted hover:text-text hover:bg-background"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveManualKnowledge} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-text mb-1.5">
                  عنوان المعلومة
                </label>
                <input
                  type="text"
                  value={editingItem.title}
                  onChange={(e) => setEditingItem({ ...editingItem, title: e.target.value })}
                  placeholder="مثلاً: أوقات العمل في رمضان، سياسة الاسترجاع..."
                  required
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1.5">
                  القسم والتصنيف
                </label>
                <select
                  value={editingItem.category}
                  onChange={(e) => setEditingItem({ ...editingItem, category: e.target.value })}
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
                >
                  <option value="business_info">معلومات ونشاط الشركة</option>
                  <option value="service_info">الخدمات والمنتجات</option>
                  <option value="pricing">الأسعار والعملات</option>
                  <option value="policy">السياسات وطرق الحجز</option>
                  <option value="faq">الأسئلة الشائعة</option>
                  <option value="general">عام</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-text mb-1.5">
                  شرح ومحتوى المعلومة بالتفصيل
                </label>
                <textarea
                  rows={4}
                  value={editingItem.content}
                  onChange={(e) => setEditingItem({ ...editingItem, content: e.target.value })}
                  placeholder="اكتب تفاصيل المعلومة التي سيعتمد عليها الوكيل عند الرد على العملاء..."
                  required
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-text placeholder:text-text-muted focus:border-primary focus:outline-none leading-relaxed"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-border">
                <button
                  type="button"
                  onClick={() => setEditingItem(null)}
                  className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-text-muted hover:text-text hover:bg-background"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={isPending}
                  className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary-dark disabled:opacity-50"
                >
                  {isPending && <Loader2 size={14} className="animate-spin" />}
                  <span>حفظ المعلومة</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          UPDATE BUSINESS TYPE, DATA & AGENT INSTRUCTIONS MODAL
         ───────────────────────────────────────────────────────────── */}
      {isProfileModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-xs p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-3xl border border-border bg-surface p-6 sm:p-8 shadow-2xl space-y-6 animate-scale-in my-8 max-h-[90vh] overflow-y-auto">
            <div className="flex items-start justify-between border-b border-border pb-4">
              <div>
                <h3 className="text-lg font-bold text-text flex items-center gap-2">
                  <Building2 size={22} className="text-primary" />
                  <span>تحديث نوع النشاط والبيانات وتعليمات الوكيل</span>
                </h3>
                <p className="text-xs text-text-muted mt-1">
                  اختر تصنيف شركتك واضبط البيانات الأساسية والتعليمات الموجهة للوكيل الذكي.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsProfileModalOpen(false)}
                className="p-1.5 rounded-xl text-text-muted hover:text-text hover:bg-background transition-colors"
              >
                <X size={20} />
              </button>
            </div>

            {profileError && (
              <div className="flex items-center gap-2 rounded-xl border border-error/40 bg-error/10 p-3.5 text-xs text-error">
                <AlertCircle size={16} className="shrink-0" />
                <span>{profileError}</span>
              </div>
            )}

            <form onSubmit={handleSaveProfileForm} className="space-y-6">
              {/* Section 1: Business Type Selection */}
              <div className="space-y-3">
                <label className="block text-xs font-bold text-text uppercase tracking-wide">
                  ١. نوع وفئة النشاط التجاري
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {BUSINESS_TYPE_OPTIONS.map((opt) => {
                    const isSelected = profileForm.businessTypeId === opt.id
                    return (
                      <button
                        key={opt.id}
                        type="button"
                        onClick={() =>
                          setProfileForm({ ...profileForm, businessTypeId: opt.id })
                        }
                        className={`text-start p-3.5 rounded-2xl border transition-all relative ${
                          isSelected
                            ? 'border-primary bg-primary/5 ring-2 ring-primary/20'
                            : 'border-border bg-background/50 hover:bg-background hover:border-border/80'
                        }`}
                      >
                        <div className="flex items-center justify-between">
                          <span className="text-xs font-bold text-text flex items-center gap-1.5">
                            {opt.label}
                            {opt.badge && (
                              <span className="px-2 py-0.5 rounded-full text-[10px] font-extrabold bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300">
                                {opt.badge}
                              </span>
                            )}
                          </span>
                          {isSelected && (
                            <CheckCircle2 size={16} className="text-primary shrink-0" />
                          )}
                        </div>
                        <p className="text-[11px] text-text-muted mt-1 leading-relaxed">
                          {opt.hint}
                        </p>
                      </button>
                    )
                  })}
                </div>
              </div>

              {/* Section 2: Business Data & Identity */}
              <div className="space-y-3 pt-2 border-t border-border">
                <label className="block text-xs font-bold text-text uppercase tracking-wide">
                  ٢. بيانات وهوية الشركة
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-text mb-1.5">
                      اسم الشركة أو النشاط
                    </label>
                    <input
                      type="text"
                      value={profileForm.businessName}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, businessName: e.target.value })
                      }
                      required
                      placeholder="اسم شركتك الرسمي"
                      className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-text mb-1.5">
                      رقم هاتف التواصل للعملاء
                    </label>
                    <input
                      type="text"
                      value={profileForm.publicPhoneNumber}
                      onChange={(e) =>
                        setProfileForm({ ...profileForm, publicPhoneNumber: e.target.value })
                      }
                      placeholder="+9665xxxxxxxx أو 05xxxxxxxx"
                      dir="ltr"
                      className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-text text-end focus:border-primary focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1.5">
                    المجال أو التخصص الرئيسي
                  </label>
                  <input
                    type="text"
                    value={profileForm.industry}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, industry: e.target.value })
                    }
                    placeholder="مثال: تطوير البرمجيات وحلول الذكاء الاصطناعي، الأمن السيبراني، الاستشارات التقنية"
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-text mb-1.5">
                    وصف النشاط وطبيعة العمل والخدمات
                  </label>
                  <textarea
                    rows={3}
                    value={profileForm.setupDescription}
                    onChange={(e) =>
                      setProfileForm({ ...profileForm, setupDescription: e.target.value })
                    }
                    placeholder="شرح موجز عن ما تقدمه شركتكم، الميزة التنافسية، ونوع العملاء المستهدفين..."
                    className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none leading-relaxed"
                  />
                </div>
              </div>

              {/* Section 3: Agent Instructions */}
              <div className="space-y-2 pt-2 border-t border-border">
                <div className="flex items-center justify-between">
                  <label className="block text-xs font-bold text-text uppercase tracking-wide">
                    ٣. تعليمات وتوجيهات الوكيل الذكي
                  </label>
                  <span className="text-[11px] text-text-muted">
                    توجه نبرة وأسلوب وسياسات الرد للوكيل
                  </span>
                </div>
                <textarea
                  rows={4}
                  value={profileForm.systemPromptAddition}
                  onChange={(e) =>
                    setProfileForm({ ...profileForm, systemPromptAddition: e.target.value })
                  }
                  placeholder="مثال: تحدث بلهجة ترحيبية ودودة ومحترفة، رحب بالعميل باسم الشركة، ركز على جمع متطلبات المشروع البرمجي قبل تحديد موعد الاستشارة التقنية، وإذا طلب العميل دعماً فنياً عاجلاً اطلب رقم التذكرة وحوله للفريق الهندسي."
                  className="w-full rounded-xl border border-border bg-background px-3.5 py-2.5 text-sm text-text focus:border-primary focus:outline-none leading-relaxed"
                />
              </div>

              {/* Modal Actions */}
              <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
                <button
                  type="button"
                  onClick={() => setIsProfileModalOpen(false)}
                  disabled={profileSaving}
                  className="px-5 py-2.5 rounded-xl border border-border text-sm font-semibold text-text-muted hover:text-text hover:bg-background transition-colors"
                >
                  إلغاء
                </button>
                <button
                  type="submit"
                  disabled={profileSaving}
                  className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary-dark disabled:opacity-50 transition-all shadow-sm"
                >
                  {profileSaving && <Loader2 size={15} className="animate-spin" />}
                  <span>حفظ وتحديث النشاط والوكيل</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
