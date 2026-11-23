import React from 'react';
import { Lock, ShieldCheck, KeyRound, Moon, Sun } from 'lucide-react';
import { apiFetch, setOwnerToken } from '../../lib/api';
import type { OwnerAdminProfile } from '../../types/owner';
import { inputClass, KayanLogoMark, primaryBtnClass } from '../ui/Primitives';
import { PWAInstallButton } from '../pwa/PWAInstallControls';

interface AuthStatus {
  needsFirstRunClaim: boolean;
  envPasscodeConfigured: boolean;
  defaultOwnerEmail: string;
  ownerExists: boolean;
}

export function OwnerAuthGate({
  onAuthenticated,
  darkMode,
  onToggleTheme,
}: {
  onAuthenticated: (admin: OwnerAdminProfile) => void;
  darkMode: boolean;
  onToggleTheme: () => void;
}) {
  const [status, setStatus] = React.useState<AuthStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = React.useState(true);
  const [email, setEmail] = React.useState('');
  const [fullName, setFullName] = React.useState('مالك منصة Kayan AI');
  const [password, setPassword] = React.useState('');
  const [confirmPassword, setConfirmPassword] = React.useState('');
  const [totpCode, setTotpCode] = React.useState('');
  const [requiresMfa, setRequiresMfa] = React.useState(false);
  const [submitting, setSubmitting] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    apiFetch<AuthStatus>('/api/owner/auth/status', { skipAuth: true })
      .then((res) => {
        setStatus(res);
        setEmail(res.defaultOwnerEmail);
      })
      .catch(() => {
        setError('تعذر الاتصال بخادم المصادقة.');
      })
      .finally(() => setLoadingStatus(false));
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (status?.needsFirstRunClaim) {
      if (password.length < 10) {
        setError('يجب أن تتكون كلمة مرور المالك من 10 أحرف على الأقل.');
        return;
      }
      if (password !== confirmPassword) {
        setError('تأكيد كلمة المرور غير متطابق.');
        return;
      }
    }

    setSubmitting(true);
    try {
      if (status?.needsFirstRunClaim) {
        const res = await apiFetch<{ token: string; admin: OwnerAdminProfile }>('/api/owner/auth/claim', {
          method: 'POST',
          skipAuth: true,
          body: { email, fullName, password },
        });
        setOwnerToken(res.token);
        onAuthenticated(res.admin);
      } else {
        const res = await apiFetch<{ token: string; admin: OwnerAdminProfile; requiresMfa?: boolean }>(
          '/api/owner/auth/login',
          {
            method: 'POST',
            skipAuth: true,
            body: { email, password, totpCode: totpCode || undefined },
          }
        );
        if (res.requiresMfa) {
          setRequiresMfa(true);
          return;
        }
        setOwnerToken(res.token);
        onAuthenticated(res.admin);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'فشلت عملية المصادقة.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="min-h-screen bg-[var(--k-canvas)] text-[var(--k-ink)] flex flex-col">
      <header className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 border-b border-[var(--k-line)] bg-[var(--k-surface)]">
        <div className="flex items-center gap-2.5 min-w-0">
          <KayanLogoMark className="w-8 h-8 shrink-0" />
          <span className="text-sm sm:text-base font-bold tracking-tight whitespace-nowrap" dir="ltr">
            <span className="sm:hidden">Kayan AI</span>
            <span className="hidden sm:inline">Kayan AI Owner Console</span>
          </span>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <PWAInstallButton variant="header" />
          <button
            type="button"
            onClick={onToggleTheme}
            aria-label={darkMode ? 'تفعيل الوضع الفاتح' : 'تفعيل الوضع الداكن'}
            className="min-h-[36px] min-w-[36px] inline-flex items-center justify-center p-2 rounded-lg border border-[var(--k-line)] hover:bg-[var(--k-surface-subtle)] text-[var(--k-ink-secondary)]"
          >
            {darkMode ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main className="flex-1 flex items-center justify-center p-6">
        <div className="w-full max-w-4xl grid grid-cols-1 lg:grid-cols-12 rounded-2xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-hidden">
          {/* Executive Brand Side Panel using #D8E2D0 pastel sage motif */}
          <section className="lg:col-span-5 p-8 flex flex-col justify-between bg-[#D8E2D0] text-[#1F3B22]">
            <div className="space-y-4">
              <div className="inline-flex items-center gap-2 text-xs font-semibold">
                <ShieldCheck className="w-4 h-4" />
                <span>Super Admin · Platform Owner</span>
              </div>
              <h1 className="text-2xl font-bold leading-snug">
                مركز التحكم الرئيسي والخاص بمالك منصة Kayan AI
              </h1>
              <p className="text-sm text-[#1F3B22]/85 leading-relaxed">
                بوابة مستقلة ومحمية بصلاحيات الخادم لإدارة المستخدمين، مساحات العمل، الباقات، الفوترة، الوكلاء الذكيين، واستهلاك الذكاء الاصطناعي مع سجل تدقيق غير قابل للتعديل.
              </p>
            </div>

            <div className="pt-8 mt-8 border-t border-[#1F3B22]/15 space-y-2 text-xs text-[#1F3B22]/85">
              <p className="font-semibold">ضوابط الحماية المطبّقة على الخادم:</p>
              <p>· تحقق مستقل من صلاحية المالك في كل طلب API</p>
              <p>· جلسات محمية بالذاكرة مع إمكانية الإبطال الفوري</p>
              <p>· دعم المصادقة الثنائية TOTP MFA وتشفير الأسرار</p>
              <p>· تسجيل جميع محاولات الدخول والعمليات الإدارية</p>
            </div>
          </section>

          {/* Form Section */}
          <section className="lg:col-span-7 p-8 flex flex-col justify-center">
            {loadingStatus ? (
              <div className="space-y-4 animate-pulse">
                <div className="h-6 w-48 rounded bg-[var(--k-surface-subtle)]" />
                <div className="h-10 w-full rounded bg-[var(--k-surface-subtle)]" />
                <div className="h-10 w-full rounded bg-[var(--k-surface-subtle)]" />
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-5">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 text-xs font-medium text-[var(--k-ink-muted)]">
                    <Lock className="w-3.5 h-3.5" />
                    <span>
                      {status?.needsFirstRunClaim
                        ? 'التهيئة الأولية لمرة واحدة فقط'
                        : 'تسجيل دخول مالك المنصة'}
                    </span>
                  </div>
                  <h2 className="text-xl font-bold text-[var(--k-ink)]">
                    {status?.needsFirstRunClaim
                      ? 'تفعيل حساب مالك المشروع (Platform Owner)'
                      : 'الدخول إلى مركز التحكم'}
                  </h2>
                  <p className="text-xs text-[var(--k-ink-muted)] leading-relaxed">
                    {status?.needsFirstRunClaim
                      ? 'قم بتعيين كلمة مرور قوية لحساب مالك المنصة. سيتم تجزئة كلمة المرور على الخادم وإغلاق مسار التهيئة فوراً بعد التفعيل.'
                      : 'هذه البوابة محصورة بمالك المشروع والمديرين المعتمدين، ولا تظهر للمستخدمين العاديين.'}
                  </p>
                </div>

                {error && (
                  <div
                    role="alert"
                    className="p-3 rounded-lg border border-[var(--k-danger)]/40 bg-[var(--k-danger-bg)] text-xs font-medium text-[var(--k-danger)]"
                  >
                    {error}
                  </div>
                )}

                {status?.needsFirstRunClaim && (
                  <div>
                    <label htmlFor="owner-fullname" className="block text-xs font-medium text-[var(--k-ink-secondary)] mb-1.5">
                      اسم مالك المشروع
                    </label>
                    <input
                      id="owner-fullname"
                      type="text"
                      required
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      className={inputClass}
                    />
                  </div>
                )}

                <div>
                  <label htmlFor="owner-email" className="block text-xs font-medium text-[var(--k-ink-secondary)] mb-1.5">
                    البريد الإلكتروني المعتمد للمالك
                  </label>
                  <input
                    id="owner-email"
                    type="email"
                    dir="ltr"
                    required
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className={`${inputClass} text-left font-mono`}
                  />
                </div>

                <div>
                  <label htmlFor="owner-password" className="block text-xs font-medium text-[var(--k-ink-secondary)] mb-1.5">
                    {status?.needsFirstRunClaim ? 'تعيين كلمة مرور المالك (10 أحرف على الأقل)' : 'كلمة المرور'}
                  </label>
                  <input
                    id="owner-password"
                    type="password"
                    dir="ltr"
                    required
                    minLength={status?.needsFirstRunClaim ? 10 : 1}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••••••"
                    className={`${inputClass} text-left font-mono`}
                  />
                </div>

                {status?.needsFirstRunClaim && (
                  <div>
                    <label htmlFor="owner-password-confirm" className="block text-xs font-medium text-[var(--k-ink-secondary)] mb-1.5">
                      تأكيد كلمة مرور المالك
                    </label>
                    <input
                      id="owner-password-confirm"
                      type="password"
                      dir="ltr"
                      required
                      minLength={10}
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      placeholder="••••••••••••"
                      className={`${inputClass} text-left font-mono`}
                    />
                  </div>
                )}

                {requiresMfa && (
                  <div>
                    <label htmlFor="owner-totp" className="block text-xs font-medium text-[var(--k-ink-secondary)] mb-1.5">
                      رمز المصادقة الثنائية (6 أرقام من تطبيق المصادقة)
                    </label>
                    <input
                      id="owner-totp"
                      type="text"
                      dir="ltr"
                      inputMode="numeric"
                      maxLength={6}
                      required
                      value={totpCode}
                      onChange={(e) => setTotpCode(e.target.value)}
                      placeholder="123456"
                      className={`${inputClass} text-left font-mono tracking-widest`}
                    />
                  </div>
                )}

                <button type="submit" disabled={submitting} className={`${primaryBtnClass} w-full py-2.5 text-sm`}>
                  <KeyRound className="w-4 h-4" />
                  <span>
                    {submitting
                      ? 'جاري التحقق...'
                      : status?.needsFirstRunClaim
                        ? 'تفعيل حساب المالك والدخول إلى المركز'
                        : requiresMfa
                          ? 'التحقق من الرمز والدخول'
                          : 'تسجيل الدخول الآمن'}
                  </span>
                </button>
              </form>
            )}
          </section>
        </div>
      </main>
    </div>
  );
}
