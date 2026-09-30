'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { CheckCircle2, Loader2, ArrowRight, ArrowLeft, ShieldCheck, ExternalLink } from 'lucide-react'
import { advanceStep, submitSmokeTest, activateGoLive } from './actions'

type StepDef = {
  id: number
  name: string
  title: string
  description: string
  href?: string
  hrefLabel?: string
  requiredHint?: string
}

const STEPS: StepDef[] = [
  {
    id: 1,
    name: 'مرحباً',
    title: 'مرحباً بك في FrontDesk AI',
    description:
      'سنرشدك خطوة بخطوة لإعداد مساحة العمل: نوع النشاط، الملف، الفروع، الساعات، الخدمات، القنوات، والوكيل الذكي. يمكنك العودة لاحقاً واستكمال الإعداد من حيث توقفت.',
  },
  {
    id: 2,
    name: 'نوع النشاط',
    title: 'اختر نوع النشاط',
    description:
      'نوع النشاط يحدد القدرات الافتراضية (حجوزات، مبيعات، خدمات منزلية، …). يمكنك تعديل القدرات لاحقاً من الإعدادات.',
    href: '/dashboard/settings',
    hrefLabel: 'فتح الإعدادات / نوع النشاط',
    requiredHint: 'يفضّل تحديد نوع النشاط قبل الاختبار النهائي.',
  },
  {
    id: 3,
    name: 'ملف الشركة',
    title: 'ملف الشركة',
    description:
      'اسم الشركة، المنطقة الزمنية، والعملة تؤثر على الحجوزات والرسائل والتحليلات. أكمل الملف من صفحة الإعدادات.',
    href: '/dashboard/settings',
    hrefLabel: 'تعديل ملف الشركة',
  },
  {
    id: 4,
    name: 'المواقع',
    title: 'الفروع والمواقع',
    description:
      'أضف فرعاً واحداً على الأقل إن كان نشاطك متعدد المواقع. القنوات والوكيل يرتبطان بالنشاط/الفرع.',
    href: '/dashboard/locations',
    hrefLabel: 'إدارة الفروع',
  },
  {
    id: 5,
    name: 'أوقات العمل',
    title: 'أوقات العمل',
    description: 'حدّد ساعات العمل الرسمية. تُستخدم لاحقاً لتوفر المواعيد وSLA وساعات الهدوء.',
    href: '/dashboard/hours',
    hrefLabel: 'تعديل أوقات العمل',
  },
  {
    id: 6,
    name: 'الخدمات',
    title: 'الخدمات / الكتالوج',
    description: 'أضف الخدمات أو المنتجات التي سيقدّمها الوكيل للعملاء (أسماء، مدة، أسعار عند الحاجة).',
    href: '/dashboard/services',
    hrefLabel: 'إدارة الخدمات',
  },
  {
    id: 7,
    name: 'القنوات',
    title: 'قنوات الاتصال',
    description:
      'اربط قناة واحدة على الأقل (هاتف عبر Vapi، WhatsApp، Instagram، أو SMS) وفعّلها. بدون قناة نشطة لن يمر الاختبار.',
    href: '/dashboard/channels',
    hrefLabel: 'ربط القنوات',
    requiredHint: 'مطلوب: قناة نشطة واحدة على الأقل قبل Go Live.',
  },
  {
    id: 8,
    name: 'الوكيل الذكي',
    title: 'هوية الذكاء الاصطناعي',
    description:
      'أنشئ أو فعّل وكيلاً (اسم، تعليمات، صوت العلامة). يجب أن يكون هناك وكيل بحالة active قبل التفعيل.',
    href: '/dashboard/agent',
    hrefLabel: 'إعداد الوكيل',
    requiredHint: 'مطلوب: وكيل AI نشط قبل Go Live.',
  },
  {
    id: 9,
    name: 'المعرفة',
    title: 'مصادر المعرفة',
    description: 'أضف مقالات أو سياسات تساعد الوكيل على الإجابة بدقة أكبر (اختياري لكنه مُستحسن).',
    href: '/dashboard/knowledge',
    hrefLabel: 'إدارة المعرفة',
  },
  {
    id: 10,
    name: 'اختبار',
    title: 'اختبار الجاهزية (Smoke Test)',
    description:
      'يتحقق الخادم من وجود ملف نشاط، نوع نشاط، منطقة زمنية، قناة نشطة، ووكيل نشط. لا يعتمد على واجهة فقط.',
  },
  {
    id: 11,
    name: 'تفعيل',
    title: 'التفعيل النهائي (Go Live)',
    description:
      'بعد نجاح الاختبار يُفعَّل النشاط. بعدها يُسمح لمسارات الوكيل بالعمل على القنوات المرتبطة.',
  },
]

export function Wizard({
  initialStep,
  activationState,
  smokeTestStatus,
}: {
  initialStep: number
  activationState: string
  smokeTestStatus: string
}) {
  const router = useRouter()
  const [currentStep, setCurrentStep] = useState(
    Math.min(11, Math.max(1, initialStep || 1))
  )
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)
  const [localSmoke, setLocalSmoke] = useState(smokeTestStatus)

  const step = STEPS.find((s) => s.id === currentStep) ?? STEPS[0]

  const handleNext = () => {
    if (currentStep >= 11) return
    setError(null)
    startTransition(async () => {
      try {
        const next = currentStep + 1
        // The server derives the activation state from the stored smoke-test status; the
        // wizard only chooses the step.
        await advanceStep(next)
        setCurrentStep(next)
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'حدث خطأ')
      }
    })
  }

  const handlePrev = () => {
    if (currentStep > 1) setCurrentStep((c) => c - 1)
  }

  const handleSmokeTest = () => {
    setError(null)
    startTransition(async () => {
      try {
        await advanceStep(10)
        await submitSmokeTest()
        setLocalSmoke('passed')
        router.refresh()
      } catch (err: unknown) {
        setLocalSmoke('failed')
        setError(err instanceof Error ? err.message : 'فشل الاختبار')
        router.refresh()
      }
    })
  }

  const handleGoLive = () => {
    setError(null)
    startTransition(async () => {
      try {
        await activateGoLive()
        router.push('/dashboard')
        router.refresh()
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : 'فشل التفعيل')
      }
    })
  }

  return (
    <div className="flex flex-col gap-8 md:flex-row">
      <div className="w-full shrink-0 md:w-1/3">
        <p className="mb-3 text-xs text-text-muted">
          الحالة: <span className="font-medium text-text">{activationState}</span>
        </p>
        <ul className="relative space-y-3 before:absolute before:inset-y-0 before:start-[11px] before:w-px before:bg-border">
          {STEPS.map((s) => {
            const isCompleted =
              s.id < currentStep || (s.id === 10 && localSmoke === 'passed') || activationState === 'active'
            const isCurrent = s.id === currentStep
            return (
              <li key={s.id} className="relative flex items-center gap-3">
                <div
                  className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 ${
                    isCompleted
                      ? 'border-primary-dark bg-primary-dark text-white'
                      : isCurrent
                        ? 'border-primary-dark bg-surface text-primary-dark'
                        : 'border-border bg-surface text-text-muted'
                  }`}
                >
                  {isCompleted ? (
                    <CheckCircle2 size={14} />
                  ) : (
                    <span className="text-[10px] font-bold">{s.id}</span>
                  )}
                </div>
                <span
                  className={`text-sm font-medium ${
                    isCurrent ? 'text-primary-dark' : 'text-text-muted'
                  }`}
                >
                  {s.name}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      <div className="flex min-h-[300px] w-full flex-col md:w-2/3">
        {error && (
          <div className="mb-4 rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-text">
            {error}
          </div>
        )}

        <div className="flex-1 rounded-xl border border-border bg-background p-6 shadow-sm">
          <h2 className="mb-2 text-xl font-semibold text-text">{step.title}</h2>
          <p className="text-sm leading-relaxed text-text-muted">{step.description}</p>

          {step.requiredHint && (
            <p className="mt-3 rounded-lg border border-warning/30 bg-warning/10 px-3 py-2 text-xs text-text">
              {step.requiredHint}
            </p>
          )}

          {step.href && (
            <Link
              href={step.href}
              className="mt-4 inline-flex h-10 items-center gap-2 rounded-lg border border-border bg-surface px-4 text-sm font-medium text-primary-dark transition-colors hover:bg-background"
            >
              {step.hrefLabel ?? 'فتح الصفحة'}
              <ExternalLink size={14} />
            </Link>
          )}

          {currentStep === 10 && (
            <div className="mt-6 flex flex-wrap items-center gap-3">
              <span className="text-sm font-semibold text-text">حالة الاختبار:</span>
              <span
                className={`rounded px-2 py-1 text-xs font-medium ${
                  localSmoke === 'passed'
                    ? 'bg-success/15 text-success'
                    : localSmoke === 'failed'
                      ? 'bg-error/15 text-error'
                      : 'bg-warning/15 text-warning'
                }`}
              >
                {localSmoke === 'passed' ? 'ناجح' : localSmoke === 'failed' ? 'فشل' : 'لم يُنفَّذ'}
              </span>
            </div>
          )}

          {currentStep === 11 && localSmoke !== 'passed' && (
            <p className="mt-4 text-sm text-error">
              لا يمكن التفعيل قبل نجاح اختبار الجاهزية.
            </p>
          )}
        </div>

        <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-border pt-4">
          <button
            type="button"
            onClick={handlePrev}
            disabled={currentStep === 1 || pending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-text transition-colors hover:bg-surface disabled:opacity-50"
          >
            <ArrowRight size={16} /> السابق
          </button>

          {currentStep === 10 ? (
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={handleSmokeTest}
                disabled={pending}
                className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary-dark px-4 text-sm font-medium text-white transition-colors hover:bg-primary disabled:opacity-50"
              >
                {pending && <Loader2 className="animate-spin" size={16} />}
                {localSmoke === 'passed' ? 'إعادة الاختبار' : 'إجراء الاختبار'}
              </button>
              {localSmoke === 'passed' && (
                <button
                  type="button"
                  onClick={handleNext}
                  disabled={pending}
                  className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-text transition-colors hover:bg-surface disabled:opacity-50"
                >
                  التالي <ArrowLeft size={16} />
                </button>
              )}
            </div>
          ) : currentStep === 11 ? (
            <button
              type="button"
              onClick={handleGoLive}
              disabled={pending || localSmoke !== 'passed'}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-success px-4 text-sm font-medium text-white transition-colors hover:opacity-90 disabled:opacity-50"
            >
              {pending && <Loader2 className="animate-spin" size={16} />}
              <ShieldCheck size={16} /> التفعيل النهائي
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={pending}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary-dark px-4 text-sm font-medium text-white transition-colors hover:bg-primary disabled:opacity-50"
            >
              {pending && <Loader2 className="animate-spin" size={16} />}
              التالي <ArrowLeft size={16} />
            </button>
          )}
        </div>
      </div>
    </div>
  )
}
