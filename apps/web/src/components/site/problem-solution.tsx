import { CheckCircle2, XCircle } from 'lucide-react'
import { Chip, Section, SectionHeading } from './section'

const PROBLEMS = [
  'مكالمات ورسائل لا يتم الرد عليها',
  'تأخّر الرد حتى يذهب العميل إلى منافس',
  'عملاء محتملون يُفقدون قبل تسجيل بياناتهم',
  'نسيان المتابعة بعد أول تواصل',
  'حجوزات وطلبات تضيع بين الملاحظات',
] as const

const SOLUTIONS = [
  'ردّ فوري على كل رسالة ومكالمة على القنوات المرتبطة بشركتك',
  'فهم طلب العميل والإجابة من معلومات شركتك وخدماتها فقط',
  'تسجيل العميل المحتمل بحالته واهتمامه وقيمته المتوقعة',
  'إنشاء الحجز وتأكيده داخل سجل العميل نفسه',
  'بقاء كل فرصة مسجّلة في لوحتك بحالة واضحة بدل أن تُنسى',
] as const

export function ProblemSolution() {
  return (
    <Section id="problem" tone="background" labelledBy="problem-title">
      <SectionHeading
        id="problem-title"
        eyebrow="المشكلة والحل"
        title="العميل لا ينتظر… والفرصة لا تعود"
        description="معظم الفرص المفقودة لا تُفقد بسبب السعر أو الخدمة، بل بسبب رد متأخر أو متابعة منسيّة أو رسالة لم يردّ عليها أحد."
      />

      <div className="mt-12 grid gap-6 lg:grid-cols-2">
        <article className="rounded-2xl border border-border bg-surface p-6 sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-text">قبل FrontDesk AI</h3>
            <Chip tone="neutral">ما يحدث اليوم</Chip>
          </div>
          <ul className="mt-6 space-y-4">
            {PROBLEMS.map((problem) => (
              <li key={problem} className="flex items-start gap-3 text-sm leading-7 text-text-muted">
                <XCircle size={18} aria-hidden="true" className="mt-1 shrink-0 text-error" />
                <span>{problem}</span>
              </li>
            ))}
          </ul>
        </article>

        <article className="rounded-2xl border border-primary-light bg-surface p-6 shadow-sm sm:p-8">
          <div className="flex items-center justify-between gap-3">
            <h3 className="text-lg font-bold text-text">مع FrontDesk AI</h3>
            <Chip tone="brand">نفس الشركة، نظام مختلف</Chip>
          </div>
          <ul className="mt-6 space-y-4">
            {SOLUTIONS.map((solution) => (
              <li key={solution} className="flex items-start gap-3 text-sm leading-7 text-text">
                <CheckCircle2 size={18} aria-hidden="true" className="mt-1 shrink-0 text-success" />
                <span>{solution}</span>
              </li>
            ))}
          </ul>
          <p className="mt-6 flex flex-wrap items-center gap-2 text-xs leading-6 text-text-muted">
            <Chip tone="soon">قريبًا</Chip>
            محرّك المتابعة التلقائي (مكالمة فائتة، عدم حضور، عميل جديد) ضمن المرحلة القادمة من
            الخطة.
          </p>
        </article>
      </div>
    </Section>
  )
}
