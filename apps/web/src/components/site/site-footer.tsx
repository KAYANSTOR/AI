import Link from 'next/link'
import { BrandLockup } from './brand'
import { SITE_NAV } from './nav'

const ACCOUNT_LINKS = [
  { label: 'تسجيل الدخول', href: '/login' },
  { label: 'إنشاء حساب للشركة', href: '/signup' },
] as const

export function SiteFooter() {
  return (
    <footer className="border-t border-border bg-surface">
      <div className="mx-auto w-full max-w-6xl px-4 py-14 sm:px-6 lg:px-8">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-4">
            <BrandLockup />
            <p className="max-w-sm text-sm leading-7 text-text-muted">
              منصة واحدة يستقبل بها الذكاء الاصطناعي عملاء الشركات على الهاتف وواتساب، ويسجّل كل
              محادثة وعميل وموعد في مكان واحد.
            </p>
          </div>

          <nav aria-label="روابط المنصة">
            <h2 className="text-sm font-semibold text-text">المنصة</h2>
            <ul className="mt-4 space-y-3">
              {SITE_NAV.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-text-muted transition-colors hover:text-primary-dark"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          <nav aria-label="روابط الحساب">
            <h2 className="text-sm font-semibold text-text">الحساب</h2>
            <ul className="mt-4 space-y-3">
              {ACCOUNT_LINKS.map((item) => (
                <li key={item.href}>
                  <Link
                    href={item.href}
                    className="text-sm text-text-muted transition-colors hover:text-primary-dark"
                  >
                    {item.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
        </div>

        <div className="mt-12 flex flex-col gap-3 border-t border-border pt-6 text-xs text-text-muted sm:flex-row sm:items-center sm:justify-between">
          <p>© {new Date().getFullYear()} FrontDesk AI — جميع الحقوق محفوظة.</p>
          <p>منصة عربية أولًا (RTL) · قنوات اليوم: الهاتف وواتساب</p>
        </div>
      </div>
    </footer>
  )
}
