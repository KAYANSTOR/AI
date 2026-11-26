import type { Metadata } from 'next'
import Link from 'next/link'
import { SiteHeader } from '@/components/site/site-header'
import { SiteFooter } from '@/components/site/site-footer'

export const metadata: Metadata = {
  title: 'طلب حذف البيانات | KAYAN AI',
  description: 'تعليمات طلب حذف بيانات حساب KAYAN AI والبيانات المستلمة من Meta والقنوات المرتبطة.',
  alternates: { canonical: '/data-deletion' },
}

const contactEmail = process.env.NEXT_PUBLIC_PRIVACY_CONTACT_EMAIL?.trim()

export default function DataDeletionPage() {
  return (
    <>
      <SiteHeader />
      <main dir="rtl" className="flex-1">
        <div className="mx-auto w-full max-w-3xl px-4 py-12 sm:px-6 lg:py-16">
          <header className="border-b border-border pb-8">
            <p className="text-xs font-semibold text-accent-text">الخصوصية وحقوق البيانات</p>
            <h1 className="mt-3 text-3xl font-bold text-text sm:text-4xl">طلب حذف البيانات</h1>
            <p className="mt-4 text-base leading-8 text-text-muted">
              يمكنك طلب حذف بيانات حسابك في KAYAN AI، بما في ذلك البيانات التي حصلت عليها
              المنصة من خدمات Meta عند ربط قنوات المراسلة.
            </p>
          </header>
          <div className="mt-8 space-y-8 text-base leading-8 text-text-muted">
            <section aria-labelledby="account-deletion">
              <h2 id="account-deletion" className="text-xl font-bold text-text">إذا كنت صاحب حساب أو مسؤول شركة</h2>
              <ol className="mt-4 list-decimal space-y-3 ps-6">
                <li>إذا أردت إيقاف وصول المنصة إلى بيانات جديدة، افصل القناة من لوحة التحكم وأزل أذونات التطبيق من إعدادات Meta عند الحاجة.</li>
                <li>تواصل مع فريق الدعم من بريدك الإلكتروني المسجل في KAYAN AI، واذكر أنك تطلب حذف البيانات.</li>
                <li>حدد نطاق الطلب: حسابك الشخصي، بيانات الشركة التي تديرها، أو البيانات المستلمة من قناة Meta محددة. أرفق اسم الشركة أو معرّف الحساب عند توفره، ولا ترسل كلمات المرور أو رموز الوصول.</li>
                <li>يتحقق الفريق من هويتك وصلاحيتك على البيانات قبل تنفيذ الطلب. لا يُعد فصل القناة أو إزالة أذونات Meta طلب حذف للبيانات المخزنة مسبقاً.</li>
              </ol>
            </section>
            <section aria-labelledby="customer-deletion">
              <h2 id="customer-deletion" className="text-xl font-bold text-text">إذا كنت عميلاً لشركة تستخدم المنصة</h2>
              <p className="mt-3">
                تواصل مع الشركة التي راسلتها واطلب حذف بياناتك ومحادثاتك. تعالج KAYAN AI هذه
                البيانات نيابة عن الشركة وتساعدها في تنفيذ طلبات الحذف. إذا تعذر التواصل معها،
                يمكنك التواصل مع فريق الدعم وذكر اسم الشركة والقناة المعنية دون إرسال محتوى حساس.
              </p>
            </section>
            <section aria-labelledby="scope-deletion">
              <h2 id="scope-deletion" className="text-xl font-bold text-text">ما الذي يشمله الطلب؟</h2>
              <p className="mt-3">
                بحسب نطاق الطلب والصلاحيات، قد يشمل بيانات الملف الشخصي ومعرّفات القنوات
                وبيانات الاعتماد المخزنة ومحتوى المحادثات والبيانات التشغيلية المرتبطة.
                لا يؤدي حذف بيانات المنصة إلى حذف حسابك لدى Meta أو البيانات التي تحتفظ بها Meta أو جهات أخرى بصورة مستقلة.
              </p>
              <p className="mt-3">
                وفق سياسة الخصوصية، تُحذف البيانات أو تُجعل مجهولة الهوية خلال 30 يوماً عند
                قبول طلب الحذف، ما لم يلزم الاحتفاظ بها مدة أطول بموجب القانون.
              </p>
            </section>
            <section aria-labelledby="request-deletion" className="rounded-2xl border border-border bg-surface p-6">
              <h2 id="request-deletion" className="text-xl font-bold text-text">إرسال طلب الحذف</h2>
              <p className="mt-3">
                {contactEmail ? 'راسل فريق الخصوصية من بريدك المسجل.' : 'استخدم قناة التواصل العامة مع فريق كيان سوفت الموضحة في صفحة الدعم؛ لا تحتاج إلى تسجيل الدخول للوصول إليها.'}
              </p>
              {contactEmail ? (
                <a href={'mailto:' + contactEmail + '?subject=' + encodeURIComponent('KAYAN AI - طلب حذف البيانات')} className="mt-4 inline-flex font-semibold text-secondary underline underline-offset-4" dir="ltr">{contactEmail}</a>
              ) : (
                <Link href="/contact" className="mt-4 inline-flex font-semibold text-secondary underline underline-offset-4">التواصل مع الدعم لطلب حذف البيانات</Link>
              )}
              <p className="mt-4 text-sm">هذه الصفحة تعرض تعليمات تقديم الطلب، ولا تنفذ حذفاً تلقائياً.</p>
            </section>
            <p><Link href="/privacy" className="font-semibold text-secondary underline underline-offset-4">قراءة سياسة الخصوصية كاملة</Link></p>
          </div>
        </div>
      </main>
      <SiteFooter />
    </>
  )
}
