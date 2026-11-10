import { Database, FileClock, KeyRound, ShieldCheck, UserCog } from 'lucide-react'
import { Section, SectionHeading } from './section'

const PRINCIPLES = [
  {
    icon: Database,
    title: 'عزل بيانات الشركات',
    body: 'كل سجل مرتبط بشركته، وسياسات أمان على مستوى الصفوف في قاعدة البيانات تمنع أي وصول خارج نطاق العضوية.',
  },
  {
    icon: KeyRound,
    title: 'حماية الحسابات',
    body: 'كلمات مرور مشفّرة بخوارزمية bcrypt، وجلسات موقّعة تنتهي تلقائيًا وتُلغى عند تغيير كلمة المرور.',
  },
  {
    icon: UserCog,
    title: 'صلاحيات حسب الدور',
    body: 'أدوار واضحة للمالك والمدير والعضو، والعمليات الحساسة مقصورة على المالك والمدير.',
  },
  {
    icon: FileClock,
    title: 'معالجة موثوقة للأحداث',
    body: 'كل حدث وارد من القنوات يُسجّل بمعرّف فريد مع حالته، ولا يُنفّذ الحدث نفسه مرتين.',
  },
  {
    icon: ShieldCheck,
    title: 'مفاتيح الربط مشفّرة',
    body: 'بيانات اعتماد القنوات ومزودي الخدمة تُحفظ مشفّرة، ولا تظهر كاملة في أي واجهة.',
  },
] as const

export function Trust() {
  return (
    <Section id="trust" tone="surface" labelledBy="trust-title">
      <SectionHeading
        id="trust-title"
        eyebrow="الأمان والخصوصية"
        title="بيانات عملائك محمية بضوابط مطبّقة فعليًا"
        description="ضوابط تقنية تعمل داخل قاعدة البيانات والتطبيق، وليست وعودًا تسويقية."
      />

      <ul className="mt-12 grid gap-px overflow-hidden rounded-2xl border border-border bg-border sm:grid-cols-2 lg:grid-cols-3">
        {PRINCIPLES.map((principle) => (
          <li key={principle.title} className="bg-surface p-6 sm:p-7">
            <principle.icon size={20} aria-hidden="true" className="text-secondary" />
            <h3 className="mt-4 text-base font-semibold text-text">{principle.title}</h3>
            <p className="mt-2 text-sm leading-7 text-text-muted">{principle.body}</p>
          </li>
        ))}
        <li className="flex flex-col justify-center bg-primary-light/40 p-6 sm:p-7">
          <p className="text-sm font-medium leading-7 text-secondary">
            كل إجراء حساس يمر عبر الخادم وحده، ولا يصل المتصفح إلى قاعدة البيانات مباشرة.
          </p>
        </li>
      </ul>
    </Section>
  )
}
