import Link from 'next/link'
import { AlertTriangle } from 'lucide-react'

/**
 * يُعرض في /login و/signup عندما لم تُضبط مفاتيح مزوّد الحسابات بعد.
 * نوضّح للمشغّل المفاتيح الناقصة بدل تقديم نموذج لا يمكن أن ينجح.
 */
export function AuthProviderNotice() {
  return (
    <div role="status" className="space-y-5">
      <div className="rounded-xl border border-warning/40 bg-warning/10 px-4 py-4">
        <div className="flex items-start gap-3">
          <AlertTriangle size={18} aria-hidden="true" className="mt-0.5 shrink-0 text-warning" />
          <div className="text-sm leading-7 text-text">
            <p className="font-semibold">لم يتم ربط مزوّد الحسابات بعد</p>
            <p className="mt-1 text-text-muted">
              صفحات الدخول والتسجيل جاهزة، لكن إنشاء الحسابات يحتاج مفتاحي مشروع Supabase. أضفهما
              إلى بيئة التشغيل ثم أعد تحميل الصفحة:
            </p>
            <ul className="mt-2 space-y-1 text-xs text-text-muted">
              <li>
                <code className="rounded bg-surface px-1.5 py-0.5">NEXT_PUBLIC_SUPABASE_URL</code>
              </li>
              <li>
                <code className="rounded bg-surface px-1.5 py-0.5">
                  NEXT_PUBLIC_SUPABASE_ANON_KEY
                </code>
              </li>
            </ul>
          </div>
        </div>
      </div>

      <Link
        href="/"
        className="inline-flex w-full items-center justify-center rounded-xl border border-border bg-surface px-4 py-3 text-sm font-semibold text-text transition-colors hover:border-primary-dark hover:text-primary-dark"
      >
        العودة إلى الصفحة الرئيسية
      </Link>
    </div>
  )
}
