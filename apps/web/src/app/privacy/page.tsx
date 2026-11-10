import type { Metadata } from 'next'
import { SiteHeader } from '@/components/site/site-header'
import { SiteFooter } from '@/components/site/site-footer'

export const metadata: Metadata = {
  title: 'سياسة الخصوصية',
  alternates: { canonical: '/privacy' },
  description:
    'كيف تجمع KAYAN AI البيانات وتستخدمها وتحميها، بما في ذلك بيانات واتساب للأعمال وإنستغرام وحقوق حذف البيانات.',
}

/** Effective date shown on the page. Update it whenever the policy text changes. */
const EFFECTIVE_DATE = '11 نوفمبر 2026'

/** Optional public contact address for privacy requests, configured per deployment. */
const contactEmail = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim()

type PolicySection = { id: string; title: string; body: React.ReactNode }

const SECTIONS: PolicySection[] = [
  {
    id: 'scope',
    title: 'نطاق هذه السياسة',
    body: (
      <p>
        تشرح هذه السياسة كيف تتعامل منصة KAYAN AI («المنصة»، «نحن») مع البيانات عند استخدام موقعنا
        ولوحة التحكم، وعند ربط الشركات لقنواتها مثل واتساب للأعمال وإنستغرام والهاتف والرسائل النصية.
        تعمل المنصة لصالح الشركات المشتركة («العملاء»)، وتعالج بيانات عملائهم النهائيين نيابةً عنهم
        ووفق تعليماتهم.
      </p>
    ),
  },
  {
    id: 'data',
    title: 'البيانات التي نجمعها',
    body: (
      <ul>
        <li>
          <strong>بيانات الحساب:</strong> الاسم والبريد الإلكتروني وكلمة المرور (تُخزَّن مُجزّأة ولا
          نطّلع عليها) واسم الشركة وإعداداتها والمنطقة الزمنية.
        </li>
        <li>
          <strong>بيانات القنوات المرتبطة:</strong> عند ربط واتساب للأعمال عبر Meta نستلم معرّف حساب
          واتساب للأعمال ومعرّف رقم الهاتف ورمز الوصول اللازم لإرسال الرسائل واستقبالها. تُخزَّن رموز
          الوصول مشفّرة.
        </li>
        <li>
          <strong>محتوى المحادثات:</strong> الرسائل النصية والوسائط (الصور والمقاطع الصوتية والفيديو
          والمستندات) التي يرسلها العملاء النهائيون إلى قنوات الشركة، وأرقام هواتفهم وأسماء ملفاتهم
          التعريفية كما تصلنا من المنصة المعنية.
        </li>
        <li>
          <strong>بيانات التشغيل:</strong> المواعيد والطلبات وعروض الأسعار وجهات الاتصال التي تُنشأ
          أثناء استخدام المنصة.
        </li>
        <li>
          <strong>بيانات تقنية:</strong> سجلات الخادم وعنوان IP ونوع المتصفح، لأغراض الأمان ومنع إساءة
          الاستخدام.
        </li>
      </ul>
    ),
  },
  {
    id: 'use',
    title: 'كيف نستخدم البيانات',
    body: (
      <ul>
        <li>تقديم الخدمة: الرد على رسائل العملاء النهائيين، وحجز المواعيد، وإدارة المحادثات.</li>
        <li>توليد الردود الآلية بالذكاء الاصطناعي بناءً على معلومات الشركة ومحتوى المحادثة.</li>
        <li>إرسال إشعارات الخدمة الضرورية مثل تأكيد المواعيد والتذكير بها.</li>
        <li>حماية المنصة واكتشاف الاحتيال وإساءة الاستخدام والامتثال للالتزامات القانونية.</li>
      </ul>
    ),
  },
  {
    id: 'no-sale',
    title: 'ما لا نفعله بالبيانات',
    body: (
      <p>
        لا نبيع البيانات الشخصية، ولا نستخدم بيانات واتساب أو إنستغرام للإعلانات أو لبناء ملفات
        تسويقية، ولا نشاركها مع أطراف ثالثة إلا بالقدر اللازم لتقديم الخدمة كما هو موضّح أدناه.
      </p>
    ),
  },
  {
    id: 'processors',
    title: 'مقدّمو الخدمات',
    body: (
      <>
        <p>نعتمد على مزوّدين موثوقين لتشغيل المنصة، ويقتصر ما يصلهم على ما تحتاجه وظيفتهم:</p>
        <ul>
          <li>
            <strong>Meta Platforms:</strong> لإرسال رسائل واتساب وإنستغرام واستقبالها.
          </li>
          <li>
            <strong>Google (Gemini):</strong> لمعالجة نص المحادثة وتوليد الردود الآلية.
          </li>
          <li>
            <strong>Railway:</strong> لاستضافة التطبيق وقاعدة البيانات.
          </li>
          <li>
            <strong>Vapi وTwilio:</strong> للمكالمات الهاتفية والرسائل النصية عند تفعيل هذه القنوات.
          </li>
          <li>
            <strong>Stripe:</strong> لمعالجة المدفوعات عند الاشتراك. لا نخزّن بيانات البطاقات.
          </li>
        </ul>
      </>
    ),
  },
  {
    id: 'security',
    title: 'حماية البيانات',
    body: (
      <p>
        نستخدم اتصالات مشفّرة (HTTPS)، ونشفّر رموز الوصول الخاصة بالقنوات، ونعزل بيانات كل شركة على
        مستوى قاعدة البيانات، ونتحقق من توقيع الرسائل الواردة من Meta، ونقصر الوصول على الأعضاء المصرّح
        لهم في كل شركة.
      </p>
    ),
  },
  {
    id: 'retention',
    title: 'مدة الاحتفاظ',
    body: (
      <p>
        نحتفظ بالبيانات طوال مدة اشتراك الشركة لتقديم الخدمة. عند إلغاء الحساب أو طلب الحذف نحذف
        البيانات أو نجعلها مجهولة الهوية خلال 30 يوماً، ما لم يُلزمنا القانون بالاحتفاظ بها مدة أطول.
      </p>
    ),
  },
  {
    id: 'deletion',
    title: 'حقوقك وطلب حذف البيانات',
    body: (
      <>
        <p>
          يحق لك طلب الاطلاع على بياناتك أو تصحيحها أو حذفها. يمكن للشركة فصل قناة واتساب أو إنستغرام
          في أي وقت من لوحة التحكم، فيتوقف استلام الرسائل الجديدة فوراً. ويمكن أيضاً إزالة صلاحيات
          التطبيق من إعدادات Meta Business.
        </p>
        <p>
          إذا كنت عميلاً نهائياً راسلت شركة تستخدم المنصة، فتواصل مع تلك الشركة أولاً، فهي المسؤولة عن
          بياناتك، وسنساعدها في تنفيذ طلبك.
        </p>
        <p>
          لطلب حذف بيانات حسابك بالكامل
          {contactEmail ? (
            <>
              {' '}
              راسلنا على{' '}
              <a href={`mailto:${contactEmail}`} dir="ltr">
                {contactEmail}
              </a>{' '}
              من البريد المسجّل في الحساب
            </>
          ) : (
            ' أرسل الطلب من البريد المسجّل في الحساب عبر قنوات الدعم المتاحة في لوحة التحكم'
          )}
          ، وسنؤكد التنفيذ خلال 30 يوماً.
        </p>
      </>
    ),
  },
  {
    id: 'changes',
    title: 'التعديلات على السياسة',
    body: (
      <p>
        قد نحدّث هذه السياسة عند تغيّر الخدمة أو المتطلبات القانونية. ننشر النسخة المحدّثة هنا مع
        تاريخ السريان، ونُخطر الشركات المشتركة بالتغييرات الجوهرية.
      </p>
    ),
  },
]

export default function PrivacyPage() {
  return (
    <>
      <SiteHeader />
      <main className="flex-1">
        <div className="mx-auto w-full max-w-6xl px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
          <header className="max-w-3xl border-b border-border pb-8">
            <p className="text-xs font-semibold tracking-[0.16em] text-accent-text">قانوني</p>
            <h1 className="mt-3 text-3xl font-bold text-text sm:text-4xl">سياسة الخصوصية</h1>
            <p className="mt-4 text-sm text-text-muted">تاريخ السريان: {EFFECTIVE_DATE}</p>
          </header>

          <div className="mt-10 grid gap-10 lg:grid-cols-[14rem_minmax(0,1fr)]">
            <nav aria-label="محتويات السياسة" className="hidden lg:block">
              <ol className="sticky top-24 space-y-2 border-s border-border ps-4 text-sm">
                {SECTIONS.map((section) => (
                  <li key={section.id}>
                    <a href={`#${section.id}`} className="text-text-muted transition-colors hover:text-secondary">
                      {section.title}
                    </a>
                  </li>
                ))}
              </ol>
            </nav>

            <div className="max-w-3xl space-y-10">
              {SECTIONS.map((section, index) => (
                <section key={section.id} id={section.id} className="scroll-mt-24">
                  <h2 className="flex items-baseline gap-3 text-xl font-bold text-text">
                    <span className="text-sm tabular-nums text-accent-text">{String(index + 1).padStart(2, '0')}</span>
                    {section.title}
                  </h2>
                  <div className="mt-4 space-y-4 text-base leading-8 text-text-muted [&_a]:font-medium [&_a]:text-secondary [&_a]:underline [&_li]:ps-1 [&_strong]:text-text [&_ul]:list-disc [&_ul]:space-y-2 [&_ul]:ps-5">
                    {section.body}
                  </div>
                </section>
              ))}
            </div>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
