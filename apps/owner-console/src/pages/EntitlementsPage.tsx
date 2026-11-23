import React from 'react';
import { ShieldAlert } from 'lucide-react';
import { apiFetch, formatDateTime, formatNumber } from '../lib/api';
import {
  inputClass,
  ModalDialog,
  PageHeader,
  primaryBtnClass,
  secondaryBtnClass,
  StatusText,
  TableSkeleton,
} from '../components/ui/Primitives';

interface FeatureFlagRow {
  id: string;
  key: string;
  name: string;
  description: string;
  category: string;
  tier_type: 'free' | 'trial' | 'paid' | 'beta';
  platform_enabled: number;
  allowed_plan_codes: string[];
  default_quota: number | null;
  active_users_estimate: number;
  granted_overrides: number;
  revoked_overrides: number;
}

export function EntitlementsPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [data, setData] = React.useState<{
    flags: FeatureFlagRow[];
    userOverrides: Array<Record<string, unknown>>;
    activations: Array<Record<string, unknown>>;
    history: Array<Record<string, unknown>>;
  } | null>(null);
  const [users, setUsers] = React.useState<Array<{ id: string; full_name: string }>>([]);
  const [loading, setLoading] = React.useState(true);
  const [overrideModal, setOverrideModal] = React.useState(false);

  const [ovUserId, setOvUserId] = React.useState('');
  const [ovFeatureKey, setOvFeatureKey] = React.useState('vapi_voice_agent');
  const [ovState, setOvState] = React.useState<'granted' | 'revoked'>('granted');
  const [ovLimit, setOvLimit] = React.useState('');
  const [ovReason, setOvReason] = React.useState('');

  const load = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch<NonNullable<typeof data>>('/api/owner/entitlements'),
      apiFetch<{ items: Array<{ id: string; full_name: string }> }>('/api/owner/users?pageSize=100'),
    ])
      .then(([ent, u]) => {
        setData(ent);
        setUsers(u.items);
        if (!ovUserId && u.items[0]) setOvUserId(u.items[0].id);
      })
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل التفعيلات والمزايا.'))
      .finally(() => setLoading(false));
  }, [ovUserId, onNotify]);

  React.useEffect(() => {
    load();
  }, [load]);

  async function togglePlatformFlag(flag: FeatureFlagRow) {
    try {
      await apiFetch(`/api/owner/entitlements/flags/${encodeURIComponent(flag.key)}`, {
        method: 'PATCH',
        body: {
          platformEnabled: flag.platform_enabled !== 1,
          reason: flag.platform_enabled === 1 ? 'تعطيل على مستوى المنصة' : 'تفعيل على مستوى المنصة',
        },
      });
      onNotify('success', `تم ${flag.platform_enabled === 1 ? 'تعطيل' : 'تفعيل'} ميزة "${flag.name}" على الخادم.`);
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحديث الميزة.');
    }
  }

  async function togglePlanForFlag(flag: FeatureFlagRow, planCode: string) {
    const exists = flag.allowed_plan_codes.includes(planCode);
    const nextPlans = exists
      ? flag.allowed_plan_codes.filter((c) => c !== planCode)
      : [...flag.allowed_plan_codes, planCode];
    try {
      await apiFetch(`/api/owner/entitlements/flags/${encodeURIComponent(flag.key)}`, {
        method: 'PATCH',
        body: { allowedPlanCodes: nextPlans, reason: `تحديث الباقات المتاحة للميزة ${flag.key}` },
      });
      onNotify('success', `تم تحديث باقات ميزة "${flag.name}".`);
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تحديث باقات الميزة.');
    }
  }

  async function submitOverride(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/api/owner/entitlements/overrides', {
        method: 'POST',
        body: {
          userId: ovUserId,
          featureKey: ovFeatureKey,
          overrideState: ovState,
          customLimit: ovLimit ? Number(ovLimit) : null,
          reason: ovReason,
        },
      });
      onNotify('success', 'تم تطبيق صلاحية المستخدم المخصصة وتسجيلها في سجل التغييرات.');
      setOverrideModal(false);
      setOvReason('');
      setOvLimit('');
      load();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر حفظ الصلاحية.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="مركز إدارة التفعيلات والصلاحيات والمزايا"
        subtitle="المرجع المركزي على الخادم (Server-Side Entitlements & Feature Flags) للتحكم في جميع مزايا Kayan AI على مستوى المنصة والباقات والمستخدمين."
        action={
          <button type="button" onClick={() => setOverrideModal(true)} className={primaryBtnClass}>
            <ShieldAlert className="w-4 h-4" />
            <span>منح / سحب ميزة لمستخدم</span>
          </button>
        }
      />

      {loading || !data ? (
        <TableSkeleton rows={6} />
      ) : (
        <>
          {/* Central Feature Flags Table */}
          <section className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                  <th className="px-4 py-3 text-start font-semibold">الميزة</th>
                  <th className="px-4 py-3 text-start font-semibold">التصنيف / النوع</th>
                  <th className="px-4 py-3 text-start font-semibold">الباقات المتاحة لها</th>
                  <th className="px-4 py-3 text-start font-semibold">المستخدمون المستفيدون</th>
                  <th className="px-4 py-3 text-start font-semibold">الحالة على المنصة</th>
                  <th className="px-4 py-3 text-end font-semibold">التحكم الفوري</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[var(--k-line)]">
                {data.flags.map((f) => (
                  <tr key={f.id} className="hover:bg-[var(--k-surface-subtle)]/60">
                    <td className="px-4 py-3">
                      <div className="font-semibold text-[var(--k-ink)]">{f.name}</div>
                      <div className="text-[11px] text-[var(--k-ink-muted)]">
                        <span className="font-mono">{f.key}</span> · {f.description}
                      </div>
                    </td>
                    <td className="px-4 py-3 whitespace-nowrap">
                      <span className="font-mono">{f.category}</span> ·{' '}
                      {f.tier_type === 'free'
                        ? 'مجانية'
                        : f.tier_type === 'beta'
                          ? 'تجريبية'
                          : 'مدفوعة'}
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {(['trial', 'starter', 'growth', 'pro'] as const).map((code) => {
                          const on = f.allowed_plan_codes.includes(code);
                          return (
                            <button
                              key={code}
                              type="button"
                              onClick={() => togglePlanForFlag(f, code)}
                              className={`px-2 py-0.5 text-[11px] font-mono rounded border transition-colors ${
                                on
                                  ? 'border-[var(--k-brand-forest)] bg-[var(--k-sage-tint)] text-[var(--k-ink)] font-semibold'
                                  : 'border-[var(--k-line)] text-[var(--k-ink-muted)]'
                              }`}
                            >
                              {code}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                    <td className="px-4 py-3 font-mono tabular-nums">
                      {formatNumber(f.active_users_estimate)}
                      {(f.granted_overrides > 0 || f.revoked_overrides > 0) && (
                        <span className="text-[11px] text-[var(--k-ink-muted)]">
                          {' '}
                          (+{f.granted_overrides} / -{f.revoked_overrides})
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3">
                      <StatusText
                        status={f.platform_enabled === 1 ? 'ok' : 'error'}
                        label={f.platform_enabled === 1 ? 'مفعلة' : 'معطلة عالمياً'}
                      />
                    </td>
                    <td className="px-4 py-3 text-end">
                      <button
                        type="button"
                        onClick={() => togglePlatformFlag(f)}
                        className={secondaryBtnClass}
                      >
                        {f.platform_enabled === 1 ? 'تعطيل الميزة' : 'تفعيل الميزة'}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>

          {/* Per-User Overrides & History */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-5">
            <section className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
              <h2 className="text-sm font-bold text-[var(--k-ink)]">
                استثناءات وصلاحيات المستخدمين المخصصة ({data.userOverrides.length})
              </h2>
              {data.userOverrides.length === 0 ? (
                <p className="text-xs text-[var(--k-ink-muted)]">لا توجد استثناءات مخصصة لمستخدمين حالياً.</p>
              ) : (
                <div className="divide-y divide-[var(--k-line)] text-xs">
                  {data.userOverrides.map((ov) => (
                    <div key={String(ov.id)} className="py-2.5 flex items-center justify-between gap-2">
                      <div>
                        <div className="font-semibold">
                          {String(ov.user_name)} — {String(ov.feature_name)}
                        </div>
                        <div className="text-[11px] text-[var(--k-ink-muted)]">
                          السبب: {String(ov.reason || '—')} · بواسطة {String(ov.updated_by)}
                        </div>
                      </div>
                      <StatusText
                        status={ov.override_state === 'granted' ? 'ok' : 'error'}
                        label={ov.override_state === 'granted' ? 'ممنوحة' : 'مسحوبة'}
                      />
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] space-y-3">
              <h2 className="text-sm font-bold text-[var(--k-ink)]">
                سجل تغييرات التفعيل والمزايا ({data.history.length})
              </h2>
              {data.history.length === 0 ? (
                <p className="text-xs text-[var(--k-ink-muted)]">لم يتم تسجيل تغييرات على المزايا بعد.</p>
              ) : (
                <div className="max-h-72 overflow-y-auto divide-y divide-[var(--k-line)] text-xs">
                  {data.history.map((h) => (
                    <div key={String(h.id)} className="py-2.5 space-y-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-mono font-semibold">{String(h.feature_key || h.target_type)}</span>
                        <span className="text-[11px] text-[var(--k-ink-muted)]">
                          {formatDateTime(String(h.created_at))}
                        </span>
                      </div>
                      <div className="text-[11px] text-[var(--k-ink-secondary)]">
                        المنفذ: {String(h.actor_email)} · {String(h.reason)}
                      </div>
                      <div className="text-[11px] font-mono text-[var(--k-ink-muted)] truncate" dir="ltr">
                        {String(h.previous_value || '—')} → {String(h.new_value || '—')}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>
          </div>
        </>
      )}

      <ModalDialog
        open={overrideModal}
        title="منح أو سحب ميزة لمستخدم محدد"
        onClose={() => setOverrideModal(false)}
      >
        <form onSubmit={submitOverride} className="space-y-4">
          <div>
            <label className="block text-xs font-medium mb-1">المستخدم *</label>
            <select required value={ovUserId} onChange={(e) => setOvUserId(e.target.value)} className={inputClass}>
              {users.length === 0 ? (
                <option value="">أنشئ مستخدماً أولاً</option>
              ) : (
                users.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.full_name}
                  </option>
                ))
              )}
            </select>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">الميزة *</label>
              <select value={ovFeatureKey} onChange={(e) => setOvFeatureKey(e.target.value)} className={inputClass}>
                {(data?.flags || []).map((f) => (
                  <option key={f.key} value={f.key}>
                    {f.name}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">الإجراء *</label>
              <select
                value={ovState}
                onChange={(e) => setOvState(e.target.value as 'granted' | 'revoked')}
                className={inputClass}
              >
                <option value="granted">منح الميزة للمستخدم</option>
                <option value="revoked">سحب الميزة من المستخدم</option>
              </select>
            </div>
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">حد استخدام مخصص (اختياري)</label>
            <input
              type="number"
              min={0}
              value={ovLimit}
              onChange={(e) => setOvLimit(e.target.value)}
              placeholder="اتركه فارغاً لاستخدام الحد الافتراضي"
              className={`${inputClass} font-mono`}
            />
          </div>
          <div>
            <label className="block text-xs font-medium mb-1">السبب الإداري *</label>
            <input
              required
              value={ovReason}
              onChange={(e) => setOvReason(e.target.value)}
              placeholder="مثال: ترقية تجريبية بناءً على اتفاق العميل"
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setOverrideModal(false)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" disabled={!ovUserId} className={primaryBtnClass}>تطبيق الصلاحية</button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}
