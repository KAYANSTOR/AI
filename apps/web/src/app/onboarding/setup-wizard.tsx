'use client'

import { KayanSelect } from '@/components/ui/kayan-select'
import { SectorPickerField } from '@/components/ui/sector-picker'
import { useState, useTransition, type FormEvent } from 'react'
import { useRouter } from 'next/navigation'
import { Check, Loader2 } from 'lucide-react'
import { DEFAULT_BUSINESS_TYPE } from '@/lib/capabilities/business-types'
import { saveBasicsAction, saveOnboardingStepAction } from './actions'
import { createServiceAction } from '@/app/dashboard/services/actions'
import { saveLocationAction } from '@/app/dashboard/locations/actions'
import { saveWeeklyHoursAction, type DayInput } from '@/app/dashboard/hours/actions'

type SetupData = {
  organizationName: string
  businessName: string
  businessTypeId: string
  city: string
  websiteUrl: string
  service: { name: string; category: string; duration: number; price: number | null } | null
  location: { id: string; name: string; address: string; phone: string } | null
  days: DayInput[]
  timezone: string
  canManage: boolean
}

const titles = ['معلومات النشاط', 'خدماتك الأساسية', 'فروع النشاط', 'ساعات العمل']
const inputClass = 'min-h-12 w-full rounded-xl border border-border bg-surface px-3.5 py-2.5 text-sm text-text outline-none transition placeholder:text-text-muted/60 focus:border-primary focus:ring-2 focus:ring-primary/15'
const weekdays = ['الأحد', 'الاثنين', 'الثلاثاء', 'الأربعاء', 'الخميس', 'الجمعة', 'السبت']

export function SetupWizard({ step, data }: { step: 1 | 2 | 3 | 4; data: SetupData }) {
  const router = useRouter()
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [days, setDays] = useState(() => data.days.filter((day) => !day.isClosed).map((day) => day.dayOfWeek))
  const [openTime, setOpenTime] = useState(data.days.find((day) => !day.isClosed)?.openTime ?? '09:00')
  const [closeTime, setCloseTime] = useState(data.days.find((day) => !day.isClosed)?.closeTime ?? '17:00')
  const [timezone, setTimezone] = useState(data.timezone || 'Asia/Aden')

  function run(
    work: () => Promise<{ ok: boolean; error?: string }>,
    next?: 1 | 2 | 3 | 4,
    returnLater = false
  ) {
    setError(null)
    startTransition(async () => {
      const result = await work()
      if (!result.ok) {
        setError(result.error ?? 'تعذّر حفظ البيانات. حاول مرة أخرى.')
        return
      }
      if (returnLater) {
        const progress = await saveOnboardingStepAction(step)
        if (!progress.ok) {
          setError(progress.error ?? 'تعذّر حفظ تقدم الإعداد.')
          return
        }
        router.replace('/dashboard')
        router.refresh()
        return
      }
      if (next) {
        const progress = await saveOnboardingStepAction(next)
        if (!progress.ok) {
          setError(progress.error ?? 'تعذّر حفظ تقدم الإعداد.')
          return
        }
        router.refresh()
      } else {
        const progress = await saveOnboardingStepAction(4)
        if (!progress.ok) {
          setError(progress.error ?? 'تعذّر حفظ تقدم الإعداد.')
          return
        }
        router.replace('/dashboard')
        router.refresh()
      }
    })
  }

  function isSaveAndReturn(event: FormEvent<HTMLFormElement>) {
    const submitter = (event.nativeEvent as SubmitEvent).submitter
    return submitter instanceof HTMLButtonElement && submitter.value === 'save-exit'
  }

  function submitBasics(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const saveLater = isSaveAndReturn(event)
    run(() => saveBasicsAction({
      name: String(fields.get('name') ?? ''),
      businessTypeId: String(fields.get('businessTypeId') ?? ''),
      city: String(fields.get('city') ?? ''),
      websiteUrl: String(fields.get('websiteUrl') ?? ''),
      timezone,
    }), saveLater ? undefined : 2, saveLater)
  }

  function submitService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const saveLater = isSaveAndReturn(event)
    if (data.service) {
      run(() => Promise.resolve({ ok: true }), saveLater ? undefined : 3, saveLater)
      return
    }
    const price = String(fields.get('price') ?? '').trim()
    run(() => createServiceAction({
      name: String(fields.get('name') ?? ''),
      category: String(fields.get('category') ?? ''),
      description: '',
      duration_minutes: Number(fields.get('duration') ?? 30),
      price_amount: price ? Number(price) : null,
      price_currency: 'USD',
    }), saveLater ? undefined : 3, saveLater)
  }

  function submitLocation(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const fields = new FormData(event.currentTarget)
    const city = String(fields.get('city') ?? '').trim()
    const address = String(fields.get('address') ?? '').trim()
    const fullAddress = [address, city].filter(Boolean).join('، ')
    const saveLater = isSaveAndReturn(event)
    run(() => saveLocationAction({
      id: data.location?.id,
      name: String(fields.get('name') ?? ''),
      address: fullAddress,
      phone: String(fields.get('phone') ?? ''),
      timezone,
    }), saveLater ? undefined : 4, saveLater)
  }

  function submitHours(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const schedule: DayInput[] = Array.from({ length: 7 }, (_, dayOfWeek) => ({
      dayOfWeek,
      openTime,
      closeTime,
      isClosed: !days.includes(dayOfWeek),
    }))
    if (days.length === 0) {
      setError('اختر يوم عمل واحداً على الأقل.')
      return
    }
    const saveLater = isSaveAndReturn(event)
    run(() => saveWeeklyHoursAction(schedule).then((result) => ({ ok: result.ok, error: result.error })), undefined, saveLater)
  }

  const onSubmit = [submitBasics, submitService, submitLocation, submitHours][step - 1]

  return (
    <section className="mx-auto w-full max-w-2xl rounded-3xl border border-border bg-surface p-5 shadow-sm sm:p-8">
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs font-semibold text-text-muted">الخطوة {step} من 4</span>
        <span className="text-xs font-semibold text-primary">{titles[step - 1]}</span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-background" aria-hidden="true">
        <div className="h-full rounded-full bg-primary transition-[width]" style={{ width: `${step * 25}%` }} />
      </div>
      <h1 className="mt-7 text-2xl font-bold tracking-tight text-text">{titles[step - 1]}</h1>
      <p className="mt-2 text-sm leading-6 text-text-muted">{[
        'أخبرنا عن نشاطك لنجهّز مساحة العمل بما يناسبه.',
        'أضف خدمة واحدة على الأقل ليتمكن العملاء من اختيارها.',
        'أضف موقعاً واحداً ليستطيع العملاء معرفة مكان نشاطك.',
        'حدد أيام وساعات استقبال العملاء والحجوزات.',
      ][step - 1]}</p>

      {!data.canManage ? <p className="mt-5 rounded-xl border border-warning/40 bg-warning/10 p-3 text-sm text-text">إكمال الإعداد متاح لمالك النشاط أو المسؤول فقط.</p> : null}
      {error ? <p role="alert" className="mt-5 rounded-xl border border-error/30 bg-error/10 px-4 py-3 text-sm text-error">{error}</p> : null}

      <form id="setup-step-form" onSubmit={onSubmit} className="mt-6 space-y-4" key={step}>
        {step === 1 ? <>
          <Field label="اسم النشاط" required><input name="name" required minLength={2} maxLength={120} defaultValue={data.businessName || data.organizationName} className={inputClass} placeholder="اسم النشاط التجاري" /></Field>
          <div className="space-y-1.5 text-sm font-medium text-text"><p>نوع النشاط<span className="ms-1 text-error" aria-hidden="true">*</span></p><SectorPickerField name="businessTypeId" defaultValue={data.businessTypeId || DEFAULT_BUSINESS_TYPE} /></div>
          <Field label="المدينة"><input name="city" maxLength={120} defaultValue={data.city} className={inputClass} placeholder="المدينة أو المنطقة" /></Field>
          <Field label="رابط الموقع"><input name="websiteUrl" type="url" dir="ltr" defaultValue={data.websiteUrl} className={`${inputClass} text-start`} placeholder="https://" /></Field>
          <Field label="المنطقة الزمنية"><input dir="ltr" value={timezone} onChange={(event) => setTimezone(event.target.value)} className={`${inputClass} text-start`} placeholder="Asia/Aden" /></Field>
        </> : null}

        {step === 2 ? data.service ? <div className="rounded-2xl border border-success/30 bg-success/5 p-4"><div className="flex items-center gap-2 text-sm font-semibold text-text"><Check size={17} className="text-success" aria-hidden="true" />تم حفظ خدمة في مساحة عملك</div><p className="mt-2 text-sm text-text-muted">{data.service.name} · {data.service.duration} دقيقة{data.service.price !== null ? ` · ${data.service.price} USD` : ''}</p><p className="mt-3 text-xs text-text-muted">يمكنك إضافة خدمات أخرى أو تعديلها لاحقاً من صفحة الخدمات.</p></div> : <>
          <Field label="اسم الخدمة" required><input name="name" required maxLength={255} className={inputClass} placeholder="مثال: استشارة أولية" /></Field>
          <Field label="الفئة" required><KayanSelect name="category" required className={inputClass} placeholder="اختر فئة الخدمة" title="فئة الخدمة"><option value="">اختر فئة الخدمة</option><option value="appointments">استشارات ومواعيد</option><option value="wellness">الصحة والعافية</option><option value="consulting">خدمات استشارية</option><option value="other">أخرى</option></KayanSelect></Field>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="المدة" required><KayanSelect name="duration" defaultValue="30" className={inputClass} title="المدة"><option value="30">30 دقيقة</option><option value="45">45 دقيقة</option><option value="60">60 دقيقة</option><option value="90">90 دقيقة</option></KayanSelect></Field><Field label="السعر (USD)"><input name="price" type="number" min="0" step="0.01" dir="ltr" className={`${inputClass} text-start`} placeholder="0.00" /></Field></div>
        </> : null}

        {step === 3 ? <>
          <Field label="اسم الفرع" required><input name="name" required maxLength={255} defaultValue={data.location?.name ?? ''} className={inputClass} placeholder="الفرع الرئيسي" /></Field>
          <Field label="العنوان"><input name="address" maxLength={300} defaultValue={data.location?.address ?? ''} className={inputClass} placeholder="أدخل العنوان" /></Field>
          <Field label="رقم التواصل"><input name="phone" type="tel" dir="ltr" defaultValue={data.location?.phone ?? ''} className={`${inputClass} text-start`} placeholder="+967..." /></Field>
          <Field label="المدينة"><input name="city" maxLength={120} defaultValue={data.city} className={inputClass} placeholder="اختر المدينة" /></Field>
        </> : null}

        {step === 4 ? <>
          <fieldset><legend className="mb-2 text-sm font-semibold text-text">أيام العمل <span className="text-error">*</span></legend><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{weekdays.map((day, index) => <label key={day} className="flex min-h-11 items-center gap-2 rounded-xl border border-border px-3 text-sm text-text"><input type="checkbox" checked={days.includes(index)} onChange={(event) => setDays((current) => event.target.checked ? [...current, index].sort() : current.filter((item) => item !== index))} className="h-4 w-4 accent-primary" />{day}</label>)}</div></fieldset>
          <div className="grid gap-4 sm:grid-cols-2"><Field label="بداية الدوام" required><input type="time" value={openTime} onChange={(event) => setOpenTime(event.target.value)} required className={inputClass} /></Field><Field label="نهاية الدوام" required><input type="time" value={closeTime} onChange={(event) => setCloseTime(event.target.value)} required className={inputClass} /></Field></div>
          <Field label="المنطقة الزمنية" required><input dir="ltr" value={timezone} onChange={(event) => setTimezone(event.target.value)} className={`${inputClass} text-start`} placeholder="Asia/Aden" /></Field>
        </> : null}

        {data.canManage ? <button type="submit" disabled={pending} className="mt-2 inline-flex min-h-12 w-full items-center justify-center gap-2 rounded-xl bg-primary px-5 text-sm font-semibold text-primary-foreground transition hover:bg-primary-dark focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:opacity-60">{pending ? <Loader2 size={17} className="animate-spin" aria-hidden="true" /> : null}{step === 4 ? 'إكمال الإعداد' : 'متابعة'}</button> : null}
      </form>
      <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
        {step > 1 && data.canManage ? <button type="button" onClick={() => run(() => saveOnboardingStepAction((step - 1) as 1 | 2 | 3 | 4), (step - 1) as 1 | 2 | 3 | 4)} disabled={pending} className="min-h-10 rounded-lg px-3 text-sm font-semibold text-text-muted hover:bg-background">الخطوة السابقة</button> : <span />}
        <button type="submit" form="setup-step-form" formNoValidate value="save-exit" disabled={pending} className="min-h-10 rounded-lg px-3 py-2 text-sm font-semibold text-text-muted hover:bg-background disabled:opacity-60">حفظ والعودة لاحقاً</button>
      </div>
      <p className="mt-2 text-center text-xs text-text-muted">تُحفظ بيانات كل خطوة عند المتابعة.</p>
    </section>
  )
}

function Field({ label, required = false, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return <label className="block space-y-1.5 text-sm font-medium text-text">{label}{required ? <span className="ms-1 text-error" aria-hidden="true">*</span> : null}{children}</label>
}
