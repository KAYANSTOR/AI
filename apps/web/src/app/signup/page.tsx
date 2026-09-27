import type { Metadata } from 'next'
import { AuthShell } from '@/components/auth/auth-shell'
import { isSupabaseConfigured } from '@/lib/supabase/env'
import { SignupForm } from './signup-form'

export const metadata: Metadata = {
  title: 'إنشاء حساب للشركة',
  description:
    'أنشئ حساب شركتك في FrontDesk AI، اختر نوع نشاطها، وابدأ إعداد الخدمات والقنوات وتفعيل الوكيل الذكي.',
}

const ONBOARDING_STEPS = [
  'بيانات حسابك وشركتك ونوع نشاطها',
  'تأكيد البريد الإلكتروني',
  'إعداد الأعمال: الخدمات والوحدات المفعّلة',
  'ربط قنوات التواصل وتشغيل الوكيل',
] as const

export default function SignupPage() {
  // يُقرأ وقت الطلب من بيئة التشغيل، لا وقت البناء.
  const authConfigured = isSupabaseConfigured()

  return (
    <AuthShell
      title="إنشاء حساب للشركة"
      subtitle="أدخل بيانات شركتك واختر نوع نشاطها، ويُنشأ الحساب ومساحة الشركة مباشرة مع الوحدات المناسبة."
      footer={
        <div className="rounded-2xl border border-border bg-surface p-5">
          <h2 className="text-sm font-semibold text-text">مسار الإعداد</h2>
          <ol className="mt-3 space-y-2">
            {ONBOARDING_STEPS.map((step, index) => (
              <li key={step} className="flex items-start gap-3 text-xs leading-6 text-text-muted">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary-light/40 text-[11px] font-bold text-primary-dark">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </div>
      }
    >
      <SignupForm authConfigured={authConfigured} />
    </AuthShell>
  )
}
