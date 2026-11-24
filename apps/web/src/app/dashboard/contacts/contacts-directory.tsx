'use client'

import { useMemo, useRef, useState } from 'react'
import { useHistoryDismiss } from '@/hooks/use-history-dismiss'
import { useModalFocus } from '@/hooks/use-modal-focus'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import {
  Search, Plus, X, Users, Phone, Mail, ChevronLeft, MessageCircle,
  BarChart3, UserRound, Loader2, CheckCircle2, Send,
} from 'lucide-react'
import { ContactForm } from './contact-form'
import { createCampaignAction } from '@/app/dashboard/campaigns/actions'
import { renderCampaignTemplate } from '@/lib/campaigns/template'

type ContactItem = {
  id: string
  fullName: string
  phone: string
  email: string
  createdLabel: string
}
type FilterId = 'all' | 'phone' | 'email' | 'incomplete'

export function ContactsDirectory({
  organizationId,
  canManage,
  contacts,
  error,
}: {
  organizationId: string
  canManage: boolean
  contacts: ContactItem[]
  error: string | null
}) {
  const [query, setQuery] = useState('')
  const [filter, setFilter] = useState<FilterId>('all')
  const [showDistribution, setShowDistribution] = useState(false)
  const [showAdd, setShowAdd] = useState(false)
  const [showBulk, setShowBulk] = useState(false)
  const phoneCount = contacts.filter((contact) => Boolean(contact.phone)).length
  const emailCount = contacts.filter((contact) => Boolean(contact.email)).length
  const incompleteCount = contacts.filter((contact) => !contact.phone && !contact.email).length
  const filters = [
    { id: 'all' as const, label: 'الكل', count: contacts.length },
    { id: 'phone' as const, label: 'لديهم هاتف', count: phoneCount },
    { id: 'email' as const, label: 'لديهم بريد', count: emailCount },
    { id: 'incomplete' as const, label: 'بيانات ناقصة', count: incompleteCount },
  ]

  const filtered = useMemo(() => {
    const term = query.trim().toLocaleLowerCase()
    return contacts.filter((contact) => {
      const matchesFilter =
        filter === 'all' ||
        (filter === 'phone' && Boolean(contact.phone)) ||
        (filter === 'email' && Boolean(contact.email)) ||
        (filter === 'incomplete' && !contact.phone && !contact.email)
      const searchable = [contact.fullName, contact.phone, contact.email].join(' ').toLocaleLowerCase()
      return matchesFilter && (!term || searchable.includes(term))
    })
  }, [contacts, filter, query])

  const firstRecipient = contacts.find((contact) => Boolean(contact.phone)) ?? contacts[0] ?? null

  return (
    <div className="space-y-4">
      <header className="space-y-1">
        <h1 className="text-xl font-extrabold text-text">جهات الاتصال</h1>
        <p className="text-xs leading-5 text-text-muted">ملف موحّد لعملائك ووسائل التواصل المتاحة لديهم.</p>
      </header>

      <section className="dashboard-card p-4">
        <div className="grid grid-cols-2 gap-3">
          <StatCell label="إجمالي الجهات" value={contacts.length} icon={<Users size={16} />} />
          <StatCell label="لديهم رقم هاتف" value={phoneCount} icon={<Phone size={16} />} />
          <StatCell label="لديهم بريد" value={emailCount} icon={<Mail size={16} />} />
          <StatCell label="بيانات ناقصة" value={incompleteCount} icon={<UserRound size={16} />} />
        </div>
        <button
          type="button"
          onClick={() => setShowDistribution((value) => !value)}
          aria-expanded={showDistribution}
          className="mt-4 flex min-h-11 w-full items-center justify-between border-t border-border pt-3 text-sm font-bold text-secondary"
        >
          <span className="flex items-center gap-2"><BarChart3 size={16} /> توزيع وسائل التواصل</span>
          <span>{showDistribution ? 'إخفاء' : 'عرض'}</span>
        </button>
        {showDistribution ? (
          <div className="mt-3 space-y-3">
            <DistributionRow label="رقم هاتف" count={phoneCount} total={contacts.length} />
            <DistributionRow label="بريد إلكتروني" count={emailCount} total={contacts.length} />
            <DistributionRow label="دون وسيلة تواصل" count={incompleteCount} total={contacts.length} />
          </div>
        ) : null}
      </section>

      <div className="grid grid-cols-2 gap-2.5">
        <button type="button" onClick={() => setShowAdd(true)} disabled={!canManage} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl bg-primary-dark px-3 text-sm font-bold text-primary disabled:opacity-50">
          <Plus size={17} /> إضافة عميل
        </button>
        <button type="button" onClick={() => setShowBulk(true)} disabled={!canManage || contacts.length === 0} className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-secondary/20 bg-primary-light/40 px-3 text-sm font-bold text-secondary disabled:opacity-50">
          <MessageCircle size={17} /> مراسلة جماعية
        </button>
      </div>

      <div className="relative">
        <Search size={17} className="pointer-events-none absolute start-3 top-1/2 -translate-y-1/2 text-text-muted" aria-hidden="true" />
        <input type="search" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="ابحث بالاسم أو الهاتف أو البريد" aria-label="البحث في جهات الاتصال" className="min-h-12 w-full rounded-2xl border border-border bg-surface ps-10 pe-4 text-sm text-text outline-none transition focus:border-secondary focus:ring-2 focus:ring-primary/40" />
      </div>

      <div className="no-scrollbar flex items-center gap-2 overflow-x-auto pb-1" aria-label="تصفية جهات الاتصال">
        {filters.map((item) => (
          <button key={item.id} type="button" onClick={() => setFilter(item.id)} aria-pressed={filter === item.id} className={'inline-flex min-h-9 shrink-0 items-center gap-1.5 rounded-full border px-3 text-xs font-bold transition ' + (filter === item.id ? 'border-secondary bg-primary-dark text-primary' : 'border-border bg-surface text-text-muted')}>
            {item.label}<span className="tabular-nums opacity-80">{item.count}</span>
          </button>
        ))}
      </div>

      {error ? <div role="alert" className="dashboard-card border-error/30 bg-error-soft/40 p-4 text-sm text-text">{error}</div> : null}

      <div className="flex items-center justify-between">
        <h2 className="text-sm font-extrabold text-text">قائمة العملاء</h2>
        <span className="text-[11px] text-text-muted">{filtered.length} نتيجة</span>
      </div>

      {filtered.length === 0 ? (
        <div className="dashboard-card px-5 py-10 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light text-secondary"><Users size={22} /></span>
          <h3 className="mt-3 text-sm font-bold text-text">{contacts.length === 0 ? 'لا توجد جهات اتصال بعد' : 'لا توجد نتائج مطابقة'}</h3>
          <p className="mt-1 text-xs leading-5 text-text-muted">{contacts.length === 0 ? 'أضف أول عميل لتبدأ في بناء قاعدة عملائك.' : 'غيّر عبارة البحث أو اختر تصفية أخرى.'}</p>
          {contacts.length === 0 && canManage ? <button type="button" onClick={() => setShowAdd(true)} className="mt-4 rounded-xl bg-primary-dark px-4 py-2.5 text-sm font-bold text-primary">إضافة أول عميل</button> : null}
        </div>
      ) : (
        <div className="space-y-2.5">
          {filtered.map((contact) => (
            <article key={contact.id} className="dashboard-contact-card">
              <div className="flex min-w-0 items-start gap-3">
                <span className="relative flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-primary-light text-sm font-extrabold text-primary-dark">
                  {contact.fullName.trim().slice(0, 1) || 'ع'}
                  <span className="absolute bottom-0 end-0 h-2.5 w-2.5 rounded-full border-2 border-surface bg-success" aria-label="جهة اتصال محفوظة" />
                </span>
                <div className="min-w-0 flex-1">
                  <h3 className="truncate text-sm font-extrabold text-text">{contact.fullName || 'عميل دون اسم'}</h3>
                  <p className="mt-1 truncate text-[11px] text-text-muted" dir="ltr">{contact.phone || contact.email || 'لا توجد وسيلة تواصل مسجلة'}</p>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {contact.phone ? <span className="dashboard-contact-tag"><Phone size={11} /> هاتف</span> : null}
                    {contact.email ? <span className="dashboard-contact-tag"><Mail size={11} /> بريد</span> : null}
                  </div>
                  <p className="mt-2 text-[10px] text-text-muted">أضيف في {contact.createdLabel}</p>
                </div>
                <Link href={'/dashboard/contacts/' + contact.id} aria-label={'عرض ملف ' + (contact.fullName || 'العميل')} className="dashboard-icon-button h-9 w-9 shrink-0">
                  <ChevronLeft size={18} aria-hidden="true" />
                </Link>
              </div>
            </article>
          ))}
        </div>
      )}

      {showAdd ? <Dialog title="إضافة جهة اتصال" onClose={() => setShowAdd(false)}><ContactForm organizationId={organizationId} /></Dialog> : null}
      {showBulk ? <BulkMessageDialog onClose={() => setShowBulk(false)} contacts={contacts} phoneCount={phoneCount} firstRecipient={firstRecipient} /> : null}
    </div>
  )
}

function StatCell({ label, value, icon }: { label: string; value: number; icon: React.ReactNode }) {
  return (
    <div className="rounded-2xl bg-surface-muted/70 p-3">
      <div className="flex items-center gap-1.5 text-[11px] font-medium text-text-muted">{icon}{label}</div>
      <strong className="mt-2 block text-xl font-extrabold tabular-nums text-text">{value.toLocaleString('ar')}</strong>
    </div>
  )
}

function DistributionRow({ label, count, total }: { label: string; count: number; total: number }) {
  const percent = total > 0 ? Math.round(count / total * 100) : 0
  return (
    <div>
      <div className="mb-1 flex justify-between text-[11px] text-text-muted"><span>{label}</span><span className="tabular-nums">{count} · {percent}%</span></div>
      <div className="h-2 overflow-hidden rounded-full bg-border"><div className="h-full rounded-full bg-primary-dark" style={{ width: percent + '%' }} /></div>
    </div>
  )
}

function Dialog({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  const ref = useRef<HTMLElement>(null)
  // Mounted only while open: Back closes it, focus is trapped and restored.
  useHistoryDismiss(true, onClose)
  useModalFocus(true, ref, onClose)
  return (
    <div className="fixed inset-0 z-[70] flex items-end justify-center bg-primary-dark/50 p-0 sm:items-center sm:p-4" onMouseDown={(event) => { if (event.target === event.currentTarget) onClose() }}>
      <section ref={ref} tabIndex={-1} role="dialog" aria-modal="true" aria-label={title} className="max-h-[90dvh] pb-[max(1.25rem,env(safe-area-inset-bottom))] w-full max-w-[480px] overflow-y-auto rounded-t-3xl border border-border bg-surface p-5 shadow-2xl sm:rounded-3xl">
        <div className="dashboard-sheet-handle mb-4" aria-hidden="true" />
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-text">{title}</h2>
          <button type="button" onClick={onClose} aria-label="إغلاق" className="dashboard-icon-button"><X size={18} /></button>
        </div>
        {children}
      </section>
    </div>
  )
}

function BulkMessageDialog({
  onClose,
  contacts,
  phoneCount,
  firstRecipient,
}: {
  onClose: () => void
  contacts: ContactItem[]
  phoneCount: number
  firstRecipient: ContactItem | null
}) {
  const router = useRouter()
  const [audience, setAudience] = useState<'all' | 'phone'>('phone')
  const [name, setName] = useState('حملة من جهات الاتصال')
  const [message, setMessage] = useState('مرحباً {customer_name}، يسعدنا تواصلك. كيف يمكننا خدمتك اليوم؟')
  const [pending, setPending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)
  const estimatedRecipients = audience === 'phone' ? phoneCount : contacts.length
  const preview = renderCampaignTemplate(message, firstRecipient?.fullName || 'عميلنا العزيز')

  async function saveDraft() {
    setPending(true)
    setError(null)
    const result = await createCampaignAction({
      name,
      channel: 'whatsapp',
      templateBody: message,
      audienceCriteria: audience === 'phone' ? { hasPhone: true } : {},
    })
    setPending(false)
    if (!result.ok) { setError(result.error); return }
    setSaved(true)
  }

  return (
    <Dialog title="إعداد رسالة جماعية" onClose={onClose}>
      {saved ? (
        <div className="space-y-4 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-primary-light text-primary-dark"><CheckCircle2 size={24} /></span>
          <h3 className="font-extrabold text-text">حُفظت الحملة كمسودة</h3>
          <p className="text-sm leading-6 text-text-muted">لم يبدأ الإرسال. راجع الجمهور والموافقات والقناة من صفحة الحملات قبل التشغيل.</p>
          <button type="button" onClick={() => router.push('/dashboard/campaigns')} className="min-h-11 w-full rounded-xl bg-primary-dark px-4 text-sm font-bold text-primary">متابعة إلى الحملات</button>
        </div>
      ) : (
        <div className="space-y-4">
          <div>
            <p className="mb-2 text-xs font-bold text-text">الجمهور المستهدف</p>
            <div className="grid grid-cols-2 gap-2">
              <AudienceButton active={audience === 'phone'} label="لديهم رقم هاتف" count={phoneCount} onClick={() => setAudience('phone')} />
              <AudienceButton active={audience === 'all'} label="كل الجهات" count={contacts.length} onClick={() => setAudience('all')} />
            </div>
            <p className="mt-2 text-[11px] leading-5 text-text-muted">الأعداد تقديرية. سيعيد النظام فحص الرقم والموافقة التسويقية عند تشغيل الحملة، وقد يستبعد بعض المستلمين.</p>
          </div>
          <label className="block"><span className="mb-1.5 block text-xs font-bold text-text">اسم الحملة</span><input value={name} onChange={(event) => setName(event.target.value)} maxLength={120} className="min-h-11 w-full rounded-xl border border-border bg-background px-3 text-sm text-text" /></label>
          <div>
            <div className="mb-1.5 flex items-center justify-between gap-2">
              <label htmlFor="bulk-message-body" className="text-xs font-bold text-text">نص الرسالة</label>
              <button type="button" onClick={() => setMessage((value) => value + ' {customer_name}')} className="rounded-lg bg-primary-light/60 px-2.5 py-1.5 text-[10px] font-bold text-secondary">إضافة اسم العميل</button>
            </div>
            <textarea id="bulk-message-body" value={message} onChange={(event) => setMessage(event.target.value)} rows={4} maxLength={4000} className="w-full rounded-xl border border-border bg-background p-3 text-sm leading-7 text-text outline-none focus:border-secondary" />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-xl bg-surface-muted p-3"><p className="text-[10px] text-text-muted">المستلمون المتوقعون</p><strong className="mt-1 block text-xl tabular-nums text-text">{estimatedRecipients.toLocaleString('ar')}</strong></div>
            <div className="rounded-xl bg-surface-muted p-3"><p className="text-[10px] text-text-muted">عدد الأحرف</p><strong className="mt-1 block text-xl tabular-nums text-text">{Array.from(message).length.toLocaleString('ar')}</strong></div>
          </div>
          <div className="rounded-2xl border border-border bg-background p-3">
            <p className="mb-2 text-[10px] font-bold text-text-muted">معاينة للمستلم الأول</p>
            <p className="rounded-2xl rounded-es-sm bg-primary-light/60 p-3 text-sm leading-7 text-text">{preview}</p>
            <p className="mt-2 text-[10px] text-text-muted">الرسائل المتوقعة: {estimatedRecipients.toLocaleString('ar')} · عبر WhatsApp</p>
          </div>
          {error ? <p role="alert" className="rounded-xl bg-error-soft/60 p-3 text-xs text-error">{error}</p> : null}
          <div className="flex gap-2">
            <button type="button" onClick={onClose} className="min-h-11 flex-1 rounded-xl border border-border bg-surface text-sm font-bold text-text">إلغاء</button>
            <button type="button" onClick={() => void saveDraft()} disabled={pending || !message.trim() || !name.trim()} className="inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl bg-primary-dark px-3 text-sm font-bold text-primary disabled:opacity-50">
              {pending ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />} حفظ كمسودة
            </button>
          </div>
        </div>
      )}
    </Dialog>
  )
}

function AudienceButton({ active, label, count, onClick }: { active: boolean; label: string; count: number; onClick: () => void }) {
  return (
    <button type="button" onClick={onClick} aria-pressed={active} className={'rounded-xl border px-2.5 py-3 text-start transition ' + (active ? 'border-secondary bg-primary-light/50' : 'border-border bg-surface')}>
      <span className="block text-xs font-bold text-text">{label}</span>
      <span className="mt-1 block text-sm font-extrabold tabular-nums text-secondary">{count.toLocaleString('ar')}</span>
    </button>
  )
}
