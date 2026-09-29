'use client'

import { useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { CheckCircle2, Loader2, ArrowRight, ArrowLeft, ShieldCheck } from 'lucide-react'
import { advanceStep, submitSmokeTest, activateGoLive } from './actions'

const STEPS = [
  { id: 1, name: 'مرحباً (Welcome)' },
  { id: 2, name: 'نوع النشاط (Business Type)' },
  { id: 3, name: 'ملف الشركة (Company Profile)' },
  { id: 4, name: 'المواقع (Locations)' },
  { id: 5, name: 'أوقات العمل (Business Hours)' },
  { id: 6, name: 'الخدمات (Services/Catalog)' },
  { id: 7, name: 'قنوات الاتصال (Channels)' },
  { id: 8, name: 'هوية الذكاء الاصطناعي (AI Identity)' },
  { id: 9, name: 'مصادر المعرفة (Knowledge)' },
  { id: 10, name: 'اختبار (Smoke Test)' },
  { id: 11, name: 'تفعيل التشغيل (Go Live)' },
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
  const [currentStep, setCurrentStep] = useState(initialStep)
  const [pending, startTransition] = useTransition()
  const [error, setError] = useState<string | null>(null)

  const handleNext = () => {
    if (currentStep < 11) {
      setError(null)
      startTransition(async () => {
        try {
          await advanceStep(currentStep + 1, 'configuring')
          setCurrentStep(c => c + 1)
        } catch (err: any) {
          setError(err.message || 'حدث خطأ')
        }
      })
    }
  }

  const handlePrev = () => {
    if (currentStep > 1) {
      setCurrentStep(c => c - 1)
    }
  }

  const handleSmokeTest = () => {
    setError(null)
    startTransition(async () => {
      try {
        await advanceStep(10, 'ready_for_test')
        await submitSmokeTest()
        // refresh will be triggered by revalidatePath
      } catch (err: any) {
        setError(err.message || 'فشل الاختبار')
      }
    })
  }

  const handleGoLive = () => {
    setError(null)
    startTransition(async () => {
      try {
        await activateGoLive()
        router.push('/dashboard')
      } catch (err: any) {
        setError(err.message || 'فشل التفعيل')
      }
    })
  }

  return (
    <div className="flex flex-col md:flex-row gap-8">
      {/* Sidebar with Steps */}
      <div className="w-full md:w-1/3 shrink-0">
        <ul className="space-y-3 relative before:absolute before:inset-y-0 before:start-[11px] before:w-px before:bg-border">
          {STEPS.map((s) => {
            const isCompleted = s.id < currentStep || (s.id === 10 && smokeTestStatus === 'passed')
            const isCurrent = s.id === currentStep
            
            return (
              <li key={s.id} className="relative flex items-center gap-3">
                <div className={`z-10 flex h-6 w-6 shrink-0 items-center justify-center rounded-full border-2 
                  ${isCompleted ? 'border-primary-dark bg-primary-dark text-white' : 
                    isCurrent ? 'border-primary-dark bg-surface text-primary-dark' : 'border-border bg-surface text-text-muted'}`}
                >
                  {isCompleted ? <CheckCircle2 size={14} /> : <span className="text-[10px] font-bold">{s.id}</span>}
                </div>
                <span className={`text-sm font-medium ${isCurrent ? 'text-primary-dark' : 'text-text-muted'}`}>
                  {s.name}
                </span>
              </li>
            )
          })}
        </ul>
      </div>

      {/* Main Content Area */}
      <div className="w-full md:w-2/3 flex flex-col min-h-[300px]">
        {error && (
          <div className="mb-4 rounded-lg border border-error/40 bg-error/10 p-3 text-sm text-text">
            {error}
          </div>
        )}

        <div className="flex-1 bg-background border border-border rounded-xl p-6 shadow-sm">
          <h2 className="text-xl font-semibold mb-4 text-text">{STEPS.find(s => s.id === currentStep)?.name}</h2>
          
          <div className="text-text-muted text-sm leading-relaxed space-y-4">
            {currentStep === 10 ? (
              <div>
                <p>يجب إجراء اختبار للنظام قبل التفعيل الفعلي للتأكد من عمل القنوات وإعدادات الذكاء الاصطناعي.</p>
                <div className="mt-6 flex items-center gap-3">
                  <span className="font-semibold text-text">حالة الاختبار:</span>
                  <span className={`px-2 py-1 rounded text-xs font-medium ${
                    smokeTestStatus === 'passed' ? 'bg-success/15 text-success-dark' : 
                    smokeTestStatus === 'failed' ? 'bg-error/15 text-error-dark' : 'bg-warning/15 text-warning-dark'
                  }`}>
                    {smokeTestStatus === 'passed' ? 'ناجح' : smokeTestStatus === 'failed' ? 'فشل' : 'لم يتم'}
                  </span>
                </div>
              </div>
            ) : currentStep === 11 ? (
              <div>
                <p>تم استكمال جميع الخطوات واجتياز الاختبار بنجاح. النظام جاهز للعمل!</p>
              </div>
            ) : (
              <p>محتوى الخطوة {currentStep} يتم تحميله هنا...</p>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="mt-6 flex items-center justify-between border-t border-border pt-4">
          <button 
            type="button" 
            onClick={handlePrev}
            disabled={currentStep === 1 || pending}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-lg border border-border px-4 text-sm font-medium text-text transition-colors hover:bg-surface disabled:opacity-50"
          >
            <ArrowRight size={16} /> السابق
          </button>

          {currentStep === 10 ? (
            <button 
              type="button" 
              onClick={handleSmokeTest}
              disabled={pending || smokeTestStatus === 'passed'}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary-dark px-4 text-sm font-medium text-white transition-colors hover:bg-primary disabled:opacity-50"
            >
              {pending && <Loader2 className="animate-spin" size={16} />}
              إجراء الاختبار
            </button>
          ) : currentStep === 11 ? (
            <button 
              type="button" 
              onClick={handleGoLive}
              disabled={pending || smokeTestStatus !== 'passed'}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-success-dark px-4 text-sm font-medium text-white transition-colors hover:bg-success disabled:opacity-50"
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

          {currentStep === 10 && smokeTestStatus === 'passed' && (
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
      </div>
    </div>
  )
}
