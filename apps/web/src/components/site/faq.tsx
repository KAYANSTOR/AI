import { ChevronDown } from 'lucide-react'
import { Section, SectionHeading } from './section'
import { SecondaryCta } from './cta'

export const FAQ_ITEMS = [
  {
    q: 'ما هي FrontDesk AI؟',
    a: 'منصة SaaS تمنح شركتك وكيل استقبال بالذكاء الاصطناعي يستقبل العملاء على القنوات المرتبطة، يفهم الطلب، يجيب من معلومات شركتك، يسجّل الفرصة، ويحجز الموعد — مع لوحة واحدة لكل المحادثات والعملاء.',
  },
  {
    q: 'كيف تعمل مع شركتي؟',
    a: 'تنشئ حساب الشركة، تحدّد نوع النشاط، تربط قنوات التواصل، ثم تعرّف خدماتك ومدّتها وأسعارك. بعد ذلك يستقبل الوكيل عملاءك ويظهر كل شيء — المحادثة والعميل والموعد — في لوحة التحكم.',
  },
  {
    q: 'هل تناسب أكثر من نوع نشاط؟',
    a: 'نعم. المنصة نواة واحدة تُحمّل وحدات النشاط المختار: تنسيق الأعراس والفعاليات، المبيعات، الحجز والمواعيد، الخدمات المنزلية، أو فئة مخصّصة بوحدات عامة وحقول قابلة للتهيئة.',
  },
  {
    q: 'هل أحتاج إلى موظف؟',
    a: 'لا لتغطية الاستقبال والتأهيل والحجز الأساسي. وإذا طلب العميل التحدث مع إنسان، يحوّل الوكيل المحادثة إلى فريق شركتك بدل أن يتركه معلّقًا.',
  },
  {
    q: 'ما القنوات التي تدعمها؟',
    a: 'واتساب والهاتف متاحتان الآن ويمكن ربطهما بحساب الشركة واستقبال العملاء عليهما. قناة إنستغرام وبقية القنوات المخطّطة في المرحلة القادمة من الخطة.',
  },
  {
    q: 'كيف يتكيّف النظام مع نشاط الشركة؟',
    a: 'نوع النشاط يحدّد الوحدات التي تُفعَّل افتراضيًا في حسابك، والوحدات المفعّلة هي التي تحدّد أدوات الوكيل وما يظهر في لوحتك. يمكنك تفعيل أو تعطيل أي وحدة من إعدادات الشركة في أي وقت.',
  },
  {
    q: 'هل يمكنني إنشاء حساب لشركتي؟',
    a: 'نعم، من صفحة «إنشاء حساب للشركة» تختار اسم الشركة ونوع النشاط وبيانات الدخول، ويُنشأ الحساب ومساحة الشركة مباشرة، ثم تنتقل إلى إعداد الأعمال.',
  },
  {
    q: 'هل يمكنني تغيير إعدادات نشاط الشركة لاحقًا؟',
    a: 'نعم، من صفحة «إعداد الأعمال» في لوحة التحكم يمكنك تغيير نوع النشاط وإعادة تحميل وحداته الافتراضية، أو تعديل الوحدات المفعّلة وحدها من الإعدادات.',
  },
  {
    q: 'هل بيانات شركتي معزولة عن بيانات الشركات الأخرى؟',
    a: 'نعم. كل صف في قاعدة البيانات مرتبط بمعرّف الشركة، وسياسات الوصول على مستوى الصفوف (Row Level Security) تمنع أي مستخدم من الوصول إلى بيانات شركة لا ينتمي إليها.',
  },
] as const

export function Faq() {
  return (
    <Section id="faq" tone="surface" labelledBy="faq-title">
      <SectionHeading
        id="faq-title"
        eyebrow="الأسئلة الشائعة"
        title="أسئلة يطرحها أصحاب الشركات قبل البدء"
        description="إجابات مباشرة عن المنصة وقنواتها وطريقة تكيّفها مع نشاط شركتك."
      />

      <div className="mx-auto mt-12 max-w-3xl space-y-3">
        {FAQ_ITEMS.map((item) => (
          <details
            key={item.q}
            className="group rounded-2xl border border-border bg-background p-5 transition-colors open:border-primary-light"
          >
            <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-sm font-semibold text-text [&::-webkit-details-marker]:hidden">
              <span>{item.q}</span>
              <ChevronDown
                size={18}
                aria-hidden="true"
                className="shrink-0 text-primary-dark transition-transform group-open:rotate-180"
              />
            </summary>
            <p className="mt-3 text-sm leading-8 text-text-muted">{item.a}</p>
          </details>
        ))}
      </div>

      <div className="mt-10 flex flex-col items-center gap-3">
        <p className="text-sm text-text-muted">لديك سؤال آخر لم تجد إجابته هنا؟</p>
        <SecondaryCta href="/signup">أنشئ حساب شركتك وابدأ الإعداد</SecondaryCta>
      </div>
    </Section>
  )
}
