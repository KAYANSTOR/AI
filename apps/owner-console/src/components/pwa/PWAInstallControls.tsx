import React from 'react';
import { Download, Share, Smartphone, WifiOff, X } from 'lucide-react';
import { usePWAInstall } from '../../hooks/usePWAInstall';
import { useOnlineStatus } from '../../hooks/useOnlineStatus';

export function PWAInstallButton({
  variant = 'header',
  onInstalled,
}: {
  variant?: 'header' | 'sidebar';
  onInstalled?: () => void;
}) {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [guideOpen, setGuideOpen] = React.useState(false);

  React.useEffect(() => {
    if (!guideOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setGuideOpen(false);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [guideOpen]);

  // Automatically suppress install button when already running as a standalone installed app
  if (isInstalled) {
    return null;
  }

  async function handleClick() {
    if (isInstallable) {
      const accepted = await install();
      if (accepted && onInstalled) {
        onInstalled();
      }
      return;
    }
    setGuideOpen(true);
  }

  const buttonClass =
    variant === 'sidebar'
      ? 'w-full flex items-center justify-center gap-2 px-3 py-2.5 rounded-lg text-xs font-semibold border border-[var(--k-brand-forest)]/30 bg-[var(--k-sage-tint)] text-[var(--k-ink)] hover:border-[var(--k-brand-forest)] transition-colors whitespace-nowrap'
      : 'inline-flex items-center gap-1.5 min-h-[36px] px-3 py-1.5 rounded-lg text-xs font-semibold border border-[var(--k-brand-forest)]/30 bg-[var(--k-sage-tint)] text-[var(--k-ink)] hover:border-[var(--k-brand-forest)] transition-colors whitespace-nowrap shrink-0';

  return (
    <>
      <button
        type="button"
        onClick={handleClick}
        aria-label="تثبيت مركز تحكم Kayan AI كتطبيق"
        className={buttonClass}
      >
        <Download className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
        <span>{variant === 'header' ? 'تثبيت التطبيق' : 'تثبيت اللوحة كتطبيق'}</span>
      </button>

      {guideOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4"
          role="dialog"
          aria-modal="true"
          aria-labelledby="pwa-install-guide-title"
          onClick={() => setGuideOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl border border-[var(--k-line-strong)] bg-[var(--k-surface)] p-5 shadow-2xl space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-lg bg-[var(--k-sage-tint)] border border-[var(--k-line)] flex items-center justify-center shrink-0">
                  {isIOS ? (
                    <Share className="w-4 h-4 text-[var(--k-brand-forest)]" aria-hidden="true" />
                  ) : (
                    <Smartphone className="w-4 h-4 text-[var(--k-brand-forest)]" aria-hidden="true" />
                  )}
                </div>
                <div>
                  <h3 id="pwa-install-guide-title" className="text-sm font-bold text-[var(--k-ink)]">
                    تثبيت Kayan AI Owner Console كتطبيق
                  </h3>
                  <p className="text-xs text-[var(--k-ink-muted)]">
                    يعمل كتطبيق مستقل بملء الشاشة على الجوال وسطح المكتب
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                aria-label="إغلاق دليل التثبيت"
                className="p-1.5 rounded-lg text-[var(--k-ink-muted)] hover:bg-[var(--k-surface-subtle)]"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {isIOS ? (
              <ol className="space-y-2.5 text-xs text-[var(--k-ink-secondary)] leading-relaxed list-decimal list-inside">
                <li>
                  افتح الرابط في متصفح <strong className="text-[var(--k-ink)]">Safari</strong> على جهاز iPhone أو iPad.
                </li>
                <li>
                  اضغط على زر <strong className="text-[var(--k-ink)]">المشاركة (Share)</strong> في شريط الأدوات السفلي.
                </li>
                <li>
                  مرّر للأسفل واختر <strong className="text-[var(--k-ink)]">إضافة إلى الشاشة الرئيسية (Add to Home Screen)</strong> ثم اضغط <strong className="text-[var(--k-ink)]">إضافة</strong>.
                </li>
              </ol>
            ) : (
              <div className="space-y-3 text-xs text-[var(--k-ink-secondary)] leading-relaxed">
                <p>
                  تم تفعيل معايير تطبيق الويب التقدمي (PWA Manifest وService Worker) بالكامل. للتثبيت الفوري:
                </p>
                <ol className="space-y-2 list-decimal list-inside">
                  <li>
                    افتح التطبيق مباشرة في نافذة متصفح مستقلة (Chrome أو Edge أو Android).
                  </li>
                  <li>
                    اضغط على أيقونة <strong className="text-[var(--k-ink)]">تثبيت التطبيق</strong> في شريط العنوان أو قائمة المتصفح (⋮ ← تثبيت التطبيق).
                  </li>
                </ol>
                <p className="text-[11px] text-[var(--k-ink-muted)] border-t border-[var(--k-line)] pt-2">
                  ملاحظة: عند فتح المعاينة داخل إطار مدمج (iframe)، يمنع المتصفح نافذة التثبيت التلقائية حتى يُفتح الرابط مباشرة في تبويب مستقل.
                </p>
              </div>
            )}

            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={() => setGuideOpen(false)}
                className="px-4 py-2 rounded-lg text-xs font-semibold bg-[var(--k-accent)] text-[var(--k-accent-ink)] hover:opacity-90 transition-opacity"
              >
                حسناً، فهمت
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export function OfflineIndicator() {
  const isOnline = useOnlineStatus();

  if (isOnline) {
    return null;
  }

  return (
    <div
      role="status"
      aria-live="assertive"
      className="fixed bottom-20 lg:bottom-5 start-1/2 -translate-x-1/2 z-50 flex items-center gap-2 rounded-lg border border-[var(--k-warning)]/40 bg-[var(--k-warning-bg)] px-3.5 py-2 text-xs font-semibold text-[var(--k-warning)] shadow-lg whitespace-nowrap"
    >
      <WifiOff className="w-3.5 h-3.5 shrink-0" aria-hidden="true" />
      <span>وضع عدم الاتصال — تعذر الوصول إلى الخادم، يتم عرض واجهة التطبيق المخزّنة.</span>
    </div>
  );
}
