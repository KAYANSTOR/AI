import type { Metadata } from 'next'
import Link from 'next/link'
import { ArrowLeft, MessageCircle, ShieldCheck } from 'lucide-react'
import { SiteHeader } from '@/components/site/site-header'
import { SiteFooter } from '@/components/site/site-footer'
import { Section } from '@/components/site/section'

export const metadata: Metadata = {
  title: 'التواصل والدعم | KAYAN AI',
  alternates: { canonical: '/contact' },
  description: 'تواصل مع فريق KAYAN AI حول الحساب، الإعداد، القنوات، والشراكات.',
}

export default function ContactPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <Section tone="background" className="border-b border-border py-12 lg:py-16">
          <div className="mx-auto max-w-3xl space-y-4 text-center">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary-light/40 px-3.5 py-1 text-xs font-bold text-secondary">
              <MessageCircle size={14} aria-hidden="true" />
              <span>نحن هنا لمساعدتك</span>
            </div>
            <h1 className="text-3xl font-extrabold tracking-tight text-text sm:text-4xl lg:text-5xl">
              ابدأ محادثة حول نشاطك
            </h1>
            <p className="text-base leading-relaxed text-text-muted sm:text-lg">
              إذا كنت تريد معرفة القنوات المناسبة أو تحتاج مساعدة في الإعداد، ابدأ بإنشاء حساب أو تواصل مع شركة كيان سوفت عبر موقعها الرسمي.
            </p>
          </div>
        </Section>

        <Section tone="surface">
          <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
            <div className="rounded-2xl border border-border bg-background p-6 shadow-[var(--shadow-card)]">
              <MessageCircle className="text-secondary" size={22} aria-hidden="true" />
              <h2 className="mt-5 text-lg font-bold text-text">للمستخدمين الجدد</h2>
              <p className="mt-2 text-sm leading-7 text-text-muted">
                أنشئ حساب شركتك وانتقل مباشرة إلى إعداد النشاط والوكيل خطوة بخطوة.
              </p>
              <Link href="/signup" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-secondary hover:text-secondary">
                إنشاء حساب <ArrowLeft size={15} aria-hidden="true" />
              </Link>
            </div>
            <div className="rounded-2xl border border-border bg-background p-6 shadow-[var(--shadow-card)]">
              <ShieldCheck className="text-secondary" size={22} aria-hidden="true" />
              <h2 className="mt-5 text-lg font-bold text-text">للدعم والشراكات</h2>
              <p className="mt-2 text-sm leading-7 text-text-muted">
                لطلبات الدعم أو الشراكات أو الاستفسارات التجارية، انتقل إلى الموقع الرسمي لشركة كيان سوفت.
              </p>
              <a href="https://kayan-soft.online" target="_blank" rel="noopener noreferrer" className="mt-6 inline-flex items-center gap-2 text-sm font-semibold text-secondary hover:text-secondary">
                موقع كيان سوفت <ArrowLeft size={15} aria-hidden="true" />
              </a>
            </div>
          </div>
        </Section>
      </main>
      <SiteFooter />
    </>
  )
}
