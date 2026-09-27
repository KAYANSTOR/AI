import { Database, FileClock, KeyRound, ShieldCheck, UserCog } from 'lucide-react'
import { Section, SectionHeading } from './section'

const PRINCIPLES = [
  {
    icon: Database,
    title: 'عزل بيانات الشركات',
    body: 'كل جدول مرتبط بمعرّف الشركة، وسياسات Row Level Security في قاعدة البيانات تمنع أي وصول خارج نطاق عضويتها.',
  },
  {
    icon: KeyRound,
    title: 'حماية الحسابات',
    body: 'الدخول عبر مصادقة Supabase بجلسات محمية، ولوحة التحكم لا تُفتح إلا لمستخدم مسجّل.',
  },
  {
    icon: UserCog,
    title: 'إدارة الصلاحيات',
    body: 'أدوار واضحة (مالك / مدير / عضو)، والعمليات الحسّاسة — مثل تغيير إعدادات الشركة — مقصورة على المالك والمدير.',
  },
  {
    icon: FileClock,
    title: 'معالجة منظّمة للأحداث',
    body: 'كل حدث وارد من القنوات يُسجَّل بمعرّف فريد مع حالته، ويُمنع تنفيذ نفس الحدث مرّتين.',
  },
  {
    icon: ShieldCheck,
    title: 'بياناتك داخل حسابك',
    body: 'الرسائل والعملاء والمواعيد وحالات الفرص محفوظة داخل مساحة شركتك ويمكن الرجوع إليها في أي وقت.',
  },
] as const

export function Trust() {
  return (
    <Section id="trust" tone="surface" labelledBy="trust-title">
      <SectionHeading
        id="trust-title"
        eyebrow="الثقة والخصوصية"
        title="مبادئ واضحة لحماية بيانات شركتك وعملائك"
        description="هذه مبادئ منفّذة داخل قاعدة البيانات وتطبيق الويب — بلا شهادات أو معايير غير مطبّقة فعليًا."
      />

      <ul className="mt-12 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {PRINCIPLES.map((principle) => (
          <li key={principle.title} className="rounded-2xl border border-border bg-background p-6">
            <span className="inline-flex h-11 w-11 items-center justify-center rounded-xl bg-primary-light/35 text-primary-dark">
              <principle.icon size={22} aria-hidden="true" />
            </span>
            <h3 className="mt-4 text-base font-semibold text-text">{principle.title}</h3>
            <p className="mt-2 text-sm leading-7 text-text-muted">{principle.body}</p>
          </li>
        ))}
      </ul>
    </Section>
  )
}
