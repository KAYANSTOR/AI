'use client'

import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Brain, CheckCircle2, ClipboardList, Link2, MessageCircle, Mic, OctagonX, Paperclip, Play, Plug, Send, ShieldCheck, Smartphone, Square, XCircle } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Dialog } from '@/components/ui/overlay'
import { TabsList, TabsTrigger } from '@/components/ui/navigation'
import { cx } from '@/components/ui/cx'
import { PersonalAssistantMemoryPanel } from '@/components/dashboard/personal-assistant-memory-panel'
import { TrainerPanel } from '@/components/dashboard/trainer/trainer-panel'
import { ToolsPanel } from '@/components/dashboard/personal-executive/tools-panel'

export type AssistantTab = 'chat' | 'tasks' | 'memory' | 'tools'

type ThreadMessage = { id: string; direction: 'inbound' | 'outbound'; source: 'web' | 'whatsapp' | 'system'; message_type: string; content: string; created_at: string }
type MediaLimits = { audioMaxSeconds: number; mediaMaxBytes: number; documents: boolean; maxInputChars: number }
const UPLOAD_ACCEPT = 'image/jpeg,image/png,image/webp,application/pdf,text/plain,text/csv,audio/ogg,audio/mpeg,audio/mp4,audio/webm,audio/wav,audio/aac'
const RECORDER_TYPES = ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4']

function mediaErrorMessage(status: number, data: { reply?: string | null; error?: string } | null, limits: MediaLimits | null): string {
  if (data?.reply) return data.reply
  if (status === 413) return `حجم الملف أكبر من المسموح (${Math.round((limits?.mediaMaxBytes ?? 5242880) / 1048576)} ميجابايت).`
  if (status === 429) return 'وصلت إلى حد باقتك أو أرسلت رسائل كثيرة خلال دقيقة. انتظر قليلاً.'
  return 'تعذّر إرسال المرفق. حاول مرة أخرى.'
}

type LinkStatus = { configured: boolean; linked: boolean; phoneMasked: string | null; killSwitchActive: boolean }
type AgentTask = { id: string; goal: string; state: string; risk_level: string; last_error: string | null; created_at: string }
type Approval = { id: string; task_id: string; summary_ar: string; payload_hash: string; expires_at: string }
type Receipt = { id: string; task_id: string; summary_ar: string; untouched_scope_note: string; created_at: string }
type AgentData = { tasks: AgentTask[]; approvals: Approval[]; receipts: Receipt[]; killSwitchActive: boolean }

const TAB_LABELS: { id: AssistantTab; label: string; icon: typeof MessageCircle }[] = [
  { id: 'chat', label: 'المحادثة', icon: MessageCircle },
  { id: 'tasks', label: 'المهام والمحاضر', icon: ClipboardList },
  { id: 'memory', label: 'الذاكرة', icon: Brain },
  { id: 'tools', label: 'الموصلات والخزنة', icon: Plug },
]

const STATE_LABEL: Record<string, string> = {
  pending: 'بانتظار البدء', planning: 'قيد التخطيط', awaiting_approval: 'بانتظار موافقتك', running: 'قيد التنفيذ',
  verifying: 'قيد التحقق', done: 'تمت', failed: 'تعذّرت', cancelled: 'أُلغيت',
}
const ACTIVE = new Set(['pending', 'planning', 'awaiting_approval', 'running', 'verifying'])
const POLL_MS = 5000

const timeFormat = new Intl.DateTimeFormat('ar', { hour: '2-digit', minute: '2-digit', day: 'numeric', month: 'short' })
function formatTime(value: string) {
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? '' : timeFormat.format(date)
}

async function getJson<T>(url: string): Promise<T> {
  const response = await fetch(url, { cache: 'no-store' })
  if (!response.ok) throw new Error(String(response.status))
  return response.json() as Promise<T>
}

async function postJson<T>(url: string, body?: unknown): Promise<{ ok: boolean; status: number; data: T }> {
  const response = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body) })
  const data = await response.json().catch(() => ({})) as T
  return { ok: response.ok, status: response.status, data }
}

/** Polls while the page is visible; stops in background tabs to save battery and quota. */
function useVisiblePolling(callback: () => void, enabled: boolean) {
  const ref = useRef(callback)
  useEffect(() => { ref.current = callback }, [callback])
  useEffect(() => {
    if (!enabled) return
    const tick = () => { if (document.visibilityState === 'visible') ref.current() }
    const timer = window.setInterval(tick, POLL_MS)
    document.addEventListener('visibilitychange', tick)
    return () => { window.clearInterval(timer); document.removeEventListener('visibilitychange', tick) }
  }, [enabled])
}

export function PersonalExecutiveApp({ initialTab, showTrainer = false, personal = true }: { initialTab: AssistantTab; showTrainer?: boolean; personal?: boolean }) {
  const router = useRouter()
  const [tab, setTab] = useState<AssistantTab>(initialTab)
  const [agent, setAgent] = useState<AgentData | null>(null)
  const [killDialog, setKillDialog] = useState(false)
  const [killBusy, setKillBusy] = useState(false)

  const loadAgent = useCallback(async () => {
    try { setAgent(await getJson<AgentData>('/api/assistant/agent')) } catch { /* keep the last state */ }
  }, [])

  useEffect(() => {
    // Initial data loading is an external synchronization.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAgent()
  }, [loadAgent])
  useVisiblePolling(loadAgent, true)

  function selectTab(next: AssistantTab) {
    setTab(next)
    router.replace(next === 'chat' ? '/dashboard/assistant' : `/dashboard/assistant?tab=${next}`, { scroll: false })
  }

  const killActive = agent?.killSwitchActive === true
  async function toggleKill() {
    setKillBusy(true)
    await postJson('/api/assistant/agent', { type: 'kill_switch', active: !killActive })
    setKillBusy(false)
    setKillDialog(false)
    await loadAgent()
  }

  const pendingCount = agent?.approvals.length ?? 0

  return (
    <div dir="rtl" className="space-y-4 pb-28">
      <section
        aria-live="polite"
        className={cx(
          'sticky top-0 z-30 flex items-center justify-between gap-3 rounded-2xl border p-3 shadow-card',
          killActive ? 'border-error bg-error-soft text-text' : 'border-border bg-primary-dark text-primary'
        )}
      >
        <div className="flex min-w-0 items-center gap-2.5">
          <span className={cx('grid h-10 w-10 shrink-0 place-items-center rounded-xl', killActive ? 'bg-error text-error-foreground' : 'bg-primary text-primary-dark')}>
            {killActive ? <OctagonX size={20} aria-hidden /> : <ShieldCheck size={20} aria-hidden />}
          </span>
          <div className="min-w-0">
            <p className="text-sm font-extrabold">{killActive ? 'الإيقاف الفوري مفعّل' : 'Kayan AI يعمل'}</p>
            <p className={cx('truncate text-xs', killActive ? 'text-text-muted' : 'text-primary/80')}>
              {killActive ? 'لن تُنفذ أي مهمة حتى تعيد التشغيل.' : 'يمكنك إيقاف كل المهام فوراً من هنا أو بإرسال «إيقاف فوري».'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setKillDialog(true)}
          className={cx(
            'inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-extrabold transition focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus',
            killActive ? 'bg-primary-dark text-primary' : 'bg-accent text-primary-dark'
          )}
        >
          {killActive ? <><Play size={16} aria-hidden /> استئناف</> : <><OctagonX size={16} aria-hidden /> إيقاف فوري</>}
        </button>
      </section>

      <TabsList className={cx('grid w-full', personal ? 'grid-cols-4' : 'grid-cols-2')}>
        {TAB_LABELS.filter(({ id }) => personal || id === 'chat' || id === 'tasks').map(({ id, label, icon: Icon }) => (
          <TabsTrigger key={id} active={tab === id} onClick={() => selectTab(id)} aria-controls={`pa-panel-${id}`} id={`pa-tab-${id}`} className="inline-flex items-center justify-center gap-1.5 text-xs sm:text-sm">
            <Icon size={15} aria-hidden />
            <span>{label}</span>
            {id === 'tasks' && pendingCount > 0 ? <span className="rounded-full bg-accent px-1.5 text-[10px] font-extrabold text-primary-dark">{pendingCount}</span> : null}
          </TabsTrigger>
        ))}
      </TabsList>

      <div role="tabpanel" id={`pa-panel-${tab}`} aria-labelledby={`pa-tab-${tab}`}>
        {tab === 'chat' ? <ChatTab personal={personal} /> : null}
        {tab === 'tasks' ? <TasksTab data={agent} onChanged={loadAgent} /> : null}
        {personal && tab === 'memory' ? <div className="space-y-4">{showTrainer ? <TrainerPanel /> : null}<PersonalAssistantMemoryPanel /></div> : null}
        {personal && tab === 'tools' ? <ToolsPanel /> : null}
      </div>

      <Dialog
        open={killDialog}
        onOpenChange={setKillDialog}
        className="z-50"
        title={killActive ? 'استئناف تنفيذ المهام؟' : 'إيقاف فوري لكل المهام؟'}
        description={killActive ? 'سيتمكن Kayan AI من تنفيذ المهام من جديد، مع بقاء الموافقة مطلوبة للإجراءات الحساسة.' : 'ستُلغى كل المهام الجارية وطلبات الموافقة فوراً، ولن تبدأ مهام جديدة حتى تستأنف.'}
        footer={<>
          <Button variant="outline" onClick={() => setKillDialog(false)} disabled={killBusy}>تراجع</Button>
          <Button variant={killActive ? 'primary' : 'danger'} loading={killBusy} onClick={() => void toggleKill()}>{killActive ? 'استئناف' : 'إيقاف الآن'}</Button>
        </>}
      >
        <p className="text-sm leading-6 text-text-muted">يُطبّق القرار على الموقع وواتساب معاً.</p>
      </Dialog>
    </div>
  )
}

function WhatsAppLinkCard() {
  const [status, setStatus] = useState<LinkStatus | null>(null)
  const [link, setLink] = useState<{ waLink: string; code: string; expiresAt: string } | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const load = useCallback(async () => {
    try { setStatus(await getJson<LinkStatus>('/api/assistant/link')) } catch { setError('تعذّر تحميل حالة الربط.') }
  }, [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])
  useVisiblePolling(load, Boolean(link) && !status?.linked)

  async function generate() {
    setBusy(true)
    setError(null)
    const result = await postJson<{ waLink?: string; code?: string; expiresAt?: string; error?: string }>('/api/assistant/link')
    setBusy(false)
    if (!result.ok || !result.data.waLink || !result.data.code) { setError(result.status === 503 ? 'رقم Kayan AI المركزي غير مهيأ بعد.' : 'تعذّر إنشاء رمز التفعيل.'); return }
    setLink({ waLink: result.data.waLink, code: result.data.code, expiresAt: result.data.expiresAt ?? '' })
  }

  async function unlink() {
    setBusy(true)
    await fetch('/api/assistant/link', { method: 'DELETE' })
    setBusy(false)
    setLink(null)
    await load()
  }

  if (!status) return null
  if (status.linked) {
    return (
      <div className="flex items-center gap-3 rounded-2xl border border-border bg-surface p-3">
        <span className="grid h-10 w-10 place-items-center rounded-xl bg-primary text-primary-dark"><CheckCircle2 size={20} aria-hidden /></span>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-extrabold text-text">واتساب مرتبط</p>
          <p className="text-xs text-text-muted" dir="ltr">{status.phoneMasked}</p>
        </div>
        <Button size="sm" variant="ghost" loading={busy} onClick={() => void unlink()}>إلغاء الربط</Button>
      </div>
    )
  }
  return (
    <div className="rounded-2xl border border-border bg-surface p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-whatsapp/15 text-whatsapp"><Smartphone size={20} aria-hidden /></span>
        <div className="min-w-0">
          <h2 className="text-sm font-extrabold text-text">اربط واتساب بلمسة واحدة</h2>
          <p className="mt-0.5 text-xs leading-5 text-text-muted">تحدث مع Kayan AI من واتساب وتظهر الرسائل هنا مباشرة.</p>
        </div>
      </div>
      {error ? <p role="alert" className="mt-3 rounded-xl bg-error-soft p-2.5 text-xs text-error">{error}</p> : null}
      {link ? (
        <div className="mt-3 space-y-2">
          <a href={link.waLink} target="_blank" rel="noopener noreferrer" className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-whatsapp px-4 text-sm font-extrabold text-white focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-focus">
            <Link2 size={16} aria-hidden /> افتح واتساب وأرسل رمز التفعيل
          </a>
          <p className="text-center text-xs text-text-muted">الرمز <span className="font-mono font-bold text-text" dir="ltr">تفعيل_{link.code}</span> صالح 15 دقيقة.</p>
        </div>
      ) : (
        <Button className="mt-3" fullWidth loading={busy} disabled={!status.configured} onClick={() => void generate()}>
          {status.configured ? 'إنشاء رابط التفعيل' : 'الرقم المركزي قيد التهيئة'}
        </Button>
      )}
    </div>
  )
}

function ChatTab({ personal }: { personal: boolean }) {
  const [messages, setMessages] = useState<ThreadMessage[]>([])
  const [text, setText] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [limits, setLimits] = useState<MediaLimits | null>(null)
  const [uploading, setUploading] = useState(false)
  const [recordingSeconds, setRecordingSeconds] = useState<number | null>(null)
  const endRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const recorderRef = useRef<{ recorder: MediaRecorder; timer: ReturnType<typeof setInterval>; stream: MediaStream } | null>(null)

  const load = useCallback(async () => {
    try {
      const result = await getJson<{ messages: ThreadMessage[]; limits?: MediaLimits | null }>('/api/assistant/chat')
      setMessages(result.messages)
      if (result.limits) setLimits(result.limits)
    } catch { setError('تعذّر تحميل المحادثة.') }
  }, [])

  async function uploadMedia(file: File, voice: boolean) {
    const maxBytes = limits?.mediaMaxBytes ?? 5 * 1024 * 1024
    if (file.size > maxBytes) { setError(mediaErrorMessage(413, null, limits)); return }
    setUploading(true)
    setError(null)
    const form = new FormData()
    form.append('file', file)
    if (voice) form.append('voice', '1')
    const caption = text.trim()
    if (caption && !voice) form.append('caption', caption.slice(0, 500))
    try {
      const response = await fetch('/api/assistant/chat/media', { method: 'POST', body: form, credentials: 'same-origin' })
      const data = await response.json().catch(() => null) as { reply?: string | null; error?: string } | null
      if (!response.ok) setError(mediaErrorMessage(response.status, data, limits))
      else if (caption && !voice) setText('')
    } catch {
      setError('تعذّر إرسال المرفق. تحقق من الاتصال.')
    } finally {
      setUploading(false)
      await load()
    }
  }

  function stopRecording() {
    const active = recorderRef.current
    if (!active) return
    clearInterval(active.timer)
    if (active.recorder.state !== 'inactive') active.recorder.stop()
  }

  async function toggleRecording() {
    if (recorderRef.current) { stopRecording(); return }
    if (typeof MediaRecorder === 'undefined' || !navigator.mediaDevices?.getUserMedia) {
      setError('متصفحك لا يدعم التسجيل الصوتي. يمكنك رفع ملف صوتي بدلاً من ذلك.')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true })
      const mimeType = RECORDER_TYPES.find((type) => MediaRecorder.isTypeSupported(type)) ?? ''
      const recorder = new MediaRecorder(stream, mimeType ? { mimeType, audioBitsPerSecond: 32000 } : { audioBitsPerSecond: 32000 })
      const chunks: Blob[] = []
      const maxSeconds = limits?.audioMaxSeconds ?? 30
      let elapsed = 0
      recorder.ondataavailable = (event) => { if (event.data.size) chunks.push(event.data) }
      recorder.onstop = () => {
        stream.getTracks().forEach((track) => track.stop())
        recorderRef.current = null
        setRecordingSeconds(null)
        const type = (recorder.mimeType || mimeType || 'audio/webm').split(';')[0] ?? 'audio/webm'
        const extension = type.includes('ogg') ? 'ogg' : type.includes('mp4') ? 'm4a' : 'webm'
        if (chunks.length && elapsed >= 1) void uploadMedia(new File(chunks, `voice.${extension}`, { type }), true)
      }
      const timer = setInterval(() => {
        elapsed += 1
        setRecordingSeconds(elapsed)
        if (elapsed >= maxSeconds) stopRecording()
      }, 1000)
      recorderRef.current = { recorder, timer, stream }
      setRecordingSeconds(0)
      setError(null)
      recorder.start()
    } catch {
      setError('لم نتمكن من الوصول إلى الميكروفون. اسمح بالإذن ثم حاول مجدداً.')
    }
  }

  useEffect(() => () => stopRecording(), [])
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load()
  }, [load])
  useVisiblePolling(load, true)
  useEffect(() => { endRef.current?.scrollIntoView({ block: 'end' }) }, [messages.length])

  async function send(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const value = text.trim()
    if (!value || sending) return
    setSending(true)
    setError(null)
    const result = await postJson<{ reply?: string; error?: string }>('/api/assistant/chat', { text: value })
    setSending(false)
    if (!result.ok) { setError(result.status === 429 ? ((result.data as { reply?: string | null } | null)?.reply || 'وصلت إلى حد باقتك أو أرسلت رسائل كثيرة خلال دقيقة.') : 'تعذّر الإرسال. حاول مرة أخرى.'); return }
    setText('')
    await load()
  }

  return (
    <div className="space-y-3">
      {personal ? <WhatsAppLinkCard /> : null}
      <section aria-label="المحادثة الموحدة" className="rounded-2xl border border-border bg-surface">
        <div className="max-h-[55dvh] min-h-56 space-y-2 overflow-y-auto overscroll-contain p-3" aria-live="polite">
          {messages.length === 0 ? <p className="py-10 text-center text-sm text-text-muted">ابدأ بطلب مثل: «ذكّرني بدفع الإيجار يوم الخميس».</p> : null}
          {messages.map((message) => {
            const mine = message.direction === 'inbound'
            const system = message.source === 'system'
            return (
              <div key={message.id} className={cx('flex', mine ? 'justify-start' : 'justify-end')}>
                <div className={cx(
                  'max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6',
                  mine ? 'bg-primary-dark text-primary' : system ? 'border border-accent bg-accent-light text-text' : 'bg-surface-muted text-text'
                )}>
                  {message.content}
                  <span className={cx('mt-1 block text-[10px]', mine ? 'text-primary/70' : 'text-text-muted')}>
                    {message.source === 'whatsapp' ? 'واتساب · ' : message.source === 'system' ? 'تنبيه · ' : ''}{formatTime(message.created_at)}
                  </span>
                </div>
              </div>
            )
          })}
          <div ref={endRef} />
        </div>
        {error ? <p role="alert" className="mx-3 mb-2 rounded-xl bg-error-soft p-2 text-xs text-error">{error}</p> : null}
        {recordingSeconds !== null ? (
          <p role="status" className="mx-3 mb-2 flex items-center gap-2 rounded-xl bg-primary-light px-3 py-2 text-xs font-semibold text-secondary">
            <span className="h-2 w-2 animate-pulse rounded-full bg-error" aria-hidden />
            جارٍ التسجيل {recordingSeconds} / {limits?.audioMaxSeconds ?? 30} ث — اضغط الإيقاف للإرسال
          </p>
        ) : null}
        <form onSubmit={send} className="flex items-end gap-2 border-t border-border p-3">
          <input
            ref={fileRef}
            type="file"
            accept={UPLOAD_ACCEPT}
            className="sr-only"
            tabIndex={-1}
            aria-hidden
            onChange={(event) => {
              const file = event.target.files?.[0]
              event.target.value = ''
              if (file) void uploadMedia(file, file.type.startsWith('audio/'))
            }}
          />
          <Button type="button" size="icon" variant="ghost" aria-label="إرفاق صورة أو ملف" loading={uploading} disabled={uploading || recordingSeconds !== null} onClick={() => fileRef.current?.click()}>
            <Paperclip size={18} aria-hidden />
          </Button>
          <Button type="button" size="icon" variant={recordingSeconds !== null ? 'primary' : 'ghost'} aria-label={recordingSeconds !== null ? 'إيقاف التسجيل وإرسال' : 'تسجيل رسالة صوتية'} aria-pressed={recordingSeconds !== null} disabled={uploading} onClick={() => void toggleRecording()}>
            {recordingSeconds !== null ? <Square size={16} aria-hidden /> : <Mic size={18} aria-hidden />}
          </Button>
          <label htmlFor="pa-composer" className="sr-only">اكتب طلبك</label>
          <textarea
            id="pa-composer"
            value={text}
            onChange={(event) => setText(event.target.value)}
            maxLength={limits?.maxInputChars ?? 2000}
            rows={1}
            placeholder="اكتب طلبك…"
            className="min-h-11 min-w-0 flex-1 resize-none rounded-xl border border-border bg-surface px-3 py-2.5 text-sm text-text outline-none focus:border-primary-dark focus:ring-2 focus:ring-focus"
          />
          <Button type="submit" size="icon" aria-label="إرسال" loading={sending} disabled={!text.trim()}><Send size={18} aria-hidden /></Button>
        </form>
      </section>
    </div>
  )
}

function TasksTab({ data, onChanged }: { data: AgentData | null; onChanged: () => Promise<void> }) {
  const [pending, setPending] = useState<{ approval: Approval; decision: 'approve' | 'reject' } | null>(null)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState<string | null>(null)

  async function decide() {
    if (!pending) return
    setBusy(true)
    const result = await postJson<{ status?: string; reason?: string }>('/api/assistant/agent', {
      type: 'approval', approvalId: pending.approval.id, decision: pending.decision, hash: pending.approval.payload_hash,
    })
    setBusy(false)
    setPending(null)
    const status = result.data.status
    setNotice(status === 'approved' ? 'تم التأكيد وبدأ التنفيذ.' : status === 'expired' ? 'انتهت صلاحية الطلب؛ لم يُنفذ شيء.' : result.data.reason === 'hash_mismatch' ? 'رُفض تلقائياً لأن المحتوى تغيّر.' : 'تم الرفض؛ لم يُنفذ شيء.')
    await onChanged()
  }

  if (!data) return <p className="py-10 text-center text-sm text-text-muted">جارٍ التحميل…</p>
  const active = data.tasks.filter((task) => ACTIVE.has(task.state) && task.state !== 'awaiting_approval')

  return (
    <div className="space-y-4">
      {notice ? <p role="status" className="rounded-xl border border-border bg-surface-muted p-3 text-sm text-text">{notice}</p> : null}

      <section aria-labelledby="pa-approvals" className="space-y-2">
        <h2 id="pa-approvals" className="text-sm font-extrabold text-text">بانتظار موافقتك ({data.approvals.length})</h2>
        {data.approvals.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-text-muted">لا توجد طلبات موافقة.</p> : null}
        {data.approvals.map((approval) => (
          <article key={approval.id} className="rounded-2xl border-2 border-accent bg-surface p-4">
            <p className="text-sm leading-6 text-text">{approval.summary_ar}</p>
            <p className="mt-2 text-[11px] text-text-muted">
              بصمة SHA-256: <span className="font-mono" dir="ltr">{approval.payload_hash.slice(0, 12)}…</span> · تنتهي {formatTime(approval.expires_at)}
            </p>
            <div className="mt-3 grid grid-cols-2 gap-2">
              <Button onClick={() => setPending({ approval, decision: 'approve' })} leadingIcon={<CheckCircle2 size={16} aria-hidden />}>تأكيد التنفيذ</Button>
              <Button variant="outline" onClick={() => setPending({ approval, decision: 'reject' })} leadingIcon={<XCircle size={16} aria-hidden />}>رفض</Button>
            </div>
          </article>
        ))}
      </section>

      <section aria-labelledby="pa-active" className="space-y-2">
        <h2 id="pa-active" className="text-sm font-extrabold text-text">مهام جارية ({active.length})</h2>
        {active.map((task) => (
          <article key={task.id} className="flex items-center justify-between gap-3 rounded-2xl border border-border bg-surface p-3">
            <p className="min-w-0 truncate text-sm text-text">{task.goal}</p>
            <span className="shrink-0 rounded-full bg-surface-muted px-2.5 py-1 text-[11px] font-bold text-text">{STATE_LABEL[task.state] ?? task.state}</span>
          </article>
        ))}
      </section>

      <section aria-labelledby="pa-receipts" className="space-y-2">
        <h2 id="pa-receipts" className="text-sm font-extrabold text-text">محاضر الأعمال</h2>
        {data.receipts.length === 0 ? <p className="rounded-2xl border border-dashed border-border p-4 text-center text-xs text-text-muted">ستظهر هنا محاضر المهام المنفذة.</p> : null}
        {data.receipts.map((receipt) => (
          <article key={receipt.id} className="rounded-2xl border border-border bg-surface p-3">
            <p className="text-sm font-bold leading-6 text-text">{receipt.summary_ar}</p>
            <p className="mt-1 text-xs leading-5 text-text-muted">لم يُمس: {receipt.untouched_scope_note}</p>
            <p className="mt-1 text-[11px] text-text-muted">المرجع <span className="font-mono" dir="ltr">{receipt.task_id.slice(0, 8)}</span> · {formatTime(receipt.created_at)}</p>
          </article>
        ))}
      </section>

      <Dialog
        open={pending !== null}
        onOpenChange={(open) => { if (!open) setPending(null) }}
        className="z-50"
        title={pending?.decision === 'approve' ? 'تأكيد التنفيذ' : 'رفض الطلب'}
        description={pending?.decision === 'approve' ? 'سيُنفذ هذا الإجراء بالمحتوى المعروض فقط؛ أي تغيير فيه يُرفض تلقائياً.' : 'لن يُنفذ أي شيء وستُلغى المهمة.'}
        footer={<>
          <Button variant="outline" onClick={() => setPending(null)} disabled={busy}>تراجع</Button>
          <Button variant={pending?.decision === 'approve' ? 'primary' : 'danger'} loading={busy} onClick={() => void decide()}>{pending?.decision === 'approve' ? 'تأكيد التنفيذ' : 'رفض'}</Button>
        </>}
      >
        <p className="whitespace-pre-wrap text-sm leading-6 text-text">{pending?.approval.summary_ar}</p>
      </Dialog>
    </div>
  )
}
