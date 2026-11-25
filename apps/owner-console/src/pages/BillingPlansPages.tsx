import React from 'react';
import { Plus, Edit3, Archive, Receipt } from 'lucide-react';
import { apiFetch, formatCurrency, formatDateTime, formatNumber } from '../lib/api';
import {
  ConfirmActionModal,
  dangerBtnClass,
  EmptyState,
  inputClass,
  MetricTile,
  ModalDialog,
  PageHeader,
  primaryBtnClass,
  secondaryBtnClass,
  StatusText,
  TableSkeleton,
} from '../components/ui/Primitives';

interface PlanRow {
  id: string;
  code: string;
  name: string;
  name_en: string;
  description: string;
  price_monthly: number;
  price_yearly: number | null;
  currency: string;
  billing_cycle: string;
  trial_days: number | null;
  max_users: number | null;
  max_agents: number | null;
  max_messages: number | null;
  token_quota: number | null;
  max_channels: number | null;
  voice_minutes: number | null;
  automation_runs: number | null;
  campaign_sends: number | null;
  storage_mb: number | null;
  ai_messages_daily?: number | null;
  media_monthly?: number | null;
  media_max_mb?: number | null;
  audio_max_seconds?: number | null;
  document_analysis?: number | null;
  max_input_chars?: number | null;
  max_output_tokens?: number | null;
  flood_per_minute?: number | null;
  allowed_models: string[];
  allowed_channels: string[];
  enabled_features: string[];
  status: string;
  active_subscribers: number;
  editable?: boolean;
}

export function PlansSubscriptionsPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [tab, setTab] = React.useState<'plans' | 'subscriptions'>('subscriptions');
  const [plans, setPlans] = React.useState<PlanRow[]>([]);
  const [subs, setSubs] = React.useState<Array<Record<string, unknown>>>([]);
  const [subSummary, setSubSummary] = React.useState<Record<string, number>>({});
  const [subFilter, setSubFilter] = React.useState('all');
  const [loading, setLoading] = React.useState(true);

  const [editPlanOpen, setEditPlanOpen] = React.useState(false);
  const [editingPlanId, setEditingPlanId] = React.useState<string | null>(null);
  const [form, setForm] = React.useState({
    code: '',
    name: '',
    nameEn: '',
    description: '',
    priceMonthly: '29',
    priceYearly: '290',
    currency: 'USD',
    trialDays: '7',
    maxUsers: '10',
    maxAgents: '5',
    maxMessages: '5000',
    tokenQuota: '5000000',
    maxChannels: '5',
    storageMb: '2048',
    aiMessagesDaily: '',
    mediaMonthly: '',
    mediaMaxMb: '',
    audioMaxSeconds: '',
    documentAnalysis: '',
    maxInputChars: '',
    maxOutputTokens: '',
    floodPerMinute: '',
    status: 'active' as 'active' | 'archived' | 'draft',
  });

  const loadAll = React.useCallback(() => {
    setLoading(true);
    Promise.all([
      apiFetch<{ items: PlanRow[] }>('/api/owner/plans'),
      apiFetch<{ items: Array<Record<string, unknown>>; summary: Record<string, number> }>(
        `/api/owner/subscriptions?status=${encodeURIComponent(subFilter)}`
      ),
    ])
      .then(([pRes, sRes]) => {
        setPlans(pRes.items);
        setSubs(sRes.items);
        setSubSummary(sRes.summary || {});
      })
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل الباقات والاشتراكات.'))
      .finally(() => setLoading(false));
  }, [subFilter, onNotify]);

  React.useEffect(() => {
    loadAll();
  }, [loadAll]);

  function openNewPlan() {
    setEditingPlanId(null);
    setForm({
      code: '',
      name: '',
      nameEn: '',
      description: '',
      priceMonthly: '49',
      priceYearly: '490',
      currency: 'USD',
      trialDays: '7',
      maxUsers: '15',
      maxAgents: '8',
      maxMessages: '10000',
      tokenQuota: '10000000',
      maxChannels: '6',
      storageMb: '4096',
      aiMessagesDaily: '',
      mediaMonthly: '',
      mediaMaxMb: '',
      audioMaxSeconds: '',
      documentAnalysis: '',
      maxInputChars: '',
      maxOutputTokens: '',
      floodPerMinute: '',
      status: 'active',
    });
    setEditPlanOpen(true);
  }

  function openEditPlan(p: PlanRow) {
    setEditingPlanId(p.id);
    setForm({
      code: p.code,
      name: p.name,
      nameEn: p.name_en,
      description: p.description,
      priceMonthly: String(p.price_monthly ?? 0),
      priceYearly: p.price_yearly == null ? '' : String(p.price_yearly),
      currency: p.currency,
      trialDays: p.trial_days == null ? '' : String(p.trial_days),
      maxUsers: p.max_users == null ? '' : String(p.max_users),
      maxAgents: p.max_agents == null ? '' : String(p.max_agents),
      maxMessages: p.max_messages == null ? '' : String(p.max_messages),
      tokenQuota: p.token_quota == null ? '' : String(p.token_quota),
      maxChannels: p.max_channels == null ? '' : String(p.max_channels),
      storageMb: p.storage_mb == null ? '' : String(p.storage_mb),
      aiMessagesDaily: p.ai_messages_daily == null ? '' : String(p.ai_messages_daily),
      mediaMonthly: p.media_monthly == null ? '' : String(p.media_monthly),
      mediaMaxMb: p.media_max_mb == null ? '' : String(p.media_max_mb),
      audioMaxSeconds: p.audio_max_seconds == null ? '' : String(p.audio_max_seconds),
      documentAnalysis: p.document_analysis == null ? '' : String(p.document_analysis),
      maxInputChars: p.max_input_chars == null ? '' : String(p.max_input_chars),
      maxOutputTokens: p.max_output_tokens == null ? '' : String(p.max_output_tokens),
      floodPerMinute: p.flood_per_minute == null ? '' : String(p.flood_per_minute),
      status: (p.status as 'active' | 'archived' | 'draft') || 'active',
    });
    setEditPlanOpen(true);
  }

  async function savePlanSubmit(e: React.FormEvent) {
    e.preventDefault();
    try {
      const endpoint = editingPlanId ? `/api/owner/plans/${encodeURIComponent(editingPlanId)}` : '/api/owner/plans';
      await apiFetch(endpoint, {
        method: editingPlanId ? 'PUT' : 'POST',
        body: {
          code: form.code,
          name: form.name,
          nameEn: form.nameEn,
          description: form.description,
          priceMonthly: Number(form.priceMonthly),
          priceYearly: Number(form.priceYearly),
          currency: form.currency,
          trialDays: Number(form.trialDays),
          maxUsers: Number(form.maxUsers),
          maxAgents: Number(form.maxAgents),
          maxMessages: Number(form.maxMessages),
          tokenQuota: Number(form.tokenQuota),
          maxChannels: Number(form.maxChannels),
          storageMb: Number(form.storageMb),
          aiMessagesDaily: form.aiMessagesDaily,
          mediaMonthly: form.mediaMonthly,
          mediaMaxMb: form.mediaMaxMb,
          audioMaxSeconds: form.audioMaxSeconds,
          documentAnalysis: form.documentAnalysis,
          maxInputChars: form.maxInputChars,
          maxOutputTokens: form.maxOutputTokens,
          floodPerMinute: form.floodPerMinute,
          status: form.status,
        },
      });
      onNotify('success', editingPlanId ? 'تم تحديث الباقة وتوثيق التغيير.' : 'تم إنشاء الباقة الجديدة.');
      setEditPlanOpen(false);
      loadAll();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر حفظ الباقة.');
    }
  }

  async function runSubAction(subId: string, action: string, extra: Record<string, unknown> = {}) {
    try {
      await apiFetch(`/api/owner/subscriptions/${encodeURIComponent(subId)}/actions`, {
        method: 'POST',
        body: { action, ...extra },
      });
      onNotify('success', 'تم تحديث حالة الاشتراك بنجاح.');
      loadAll();
    } catch (err) {
      onNotify('error', err instanceof Error ? err.message : 'تعذر تنفيذ إجراء الاشتراك.');
    }
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="إدارة الاشتراكات والباقات"
        subtitle="عرض كتالوج الباقات المسجل فعلياً في PostgreSQL ومتابعة الاشتراكات وحالاتها."
      />

      <div className="flex items-center gap-1 p-1 rounded-lg bg-[var(--k-surface-subtle)] border border-[var(--k-line)] w-fit">
        <button
          type="button"
          onClick={() => setTab('plans')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md ${
            tab === 'plans' ? 'bg-[var(--k-surface)] text-[var(--k-ink)] font-semibold' : 'text-[var(--k-ink-muted)]'
          }`}
        >
          كتالوج الباقات ({plans.length})
        </button>
        <button
          type="button"
          onClick={() => setTab('subscriptions')}
          className={`px-4 py-1.5 text-xs font-medium rounded-md ${
            tab === 'subscriptions' ? 'bg-[var(--k-surface)] text-[var(--k-ink)] font-semibold' : 'text-[var(--k-ink-muted)]'
          }`}
        >
          الاشتراكات ({subSummary.total || 0})
        </button>
      </div>

      {loading ? (
        <TableSkeleton rows={5} />
      ) : tab === 'plans' ? (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {plans.length === 0 && (
            <div className="md:col-span-2 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] p-5 text-sm text-[var(--k-ink-secondary)]">
              لا توجد باقات مسجلة في جدول plans بقاعدة المنصة.
            </div>
          )}
          {plans.map((p) => (
            <div
              key={p.id}
              className="p-5 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] flex flex-col justify-between gap-4"
            >
              <div className="space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <div className="flex items-center gap-2">
                      <h2 className="text-base font-bold text-[var(--k-ink)]">{p.name}</h2>
                      <span className="text-xs font-mono text-[var(--k-ink-muted)]">({p.code})</span>
                    </div>
                    <p className="text-xs text-[var(--k-ink-muted)] mt-1">{p.description}</p>
                  </div>
                  <StatusText
                    status={p.status === 'active' ? 'ok' : p.status === 'archived' ? 'muted' : 'warn'}
                    label={p.status === 'active' ? 'نشطة' : p.status === 'archived' ? 'مؤرشفة' : 'مسودة'}
                  />
                </div>

                <div className="flex items-baseline gap-4 py-2 border-y border-[var(--k-line)]">
                  <div>
                    <span className="text-2xl font-bold font-mono tabular-nums text-[var(--k-ink)]">
                      {formatCurrency(p.price_monthly, p.currency)}
                    </span>
                    <span className="text-xs text-[var(--k-ink-muted)]"> / شهرياً</span>
                  </div>
                  <span className="text-xs font-mono text-[var(--k-ink-muted)]">
                    السنوي: {p.price_yearly === null ? 'غير محدد' : formatCurrency(p.price_yearly, p.currency)} · التجربة: {p.trial_days === null ? 'غير محددة' : `${p.trial_days} يوم`}
                  </span>
                </div>

                <dl className="grid grid-cols-2 sm:grid-cols-3 gap-2.5 text-xs">
                  <div>
                    <dt className="text-[var(--k-ink-muted)]">المستخدمون</dt>
                    <dd className="font-mono tabular-nums font-semibold">{p.max_users === null ? 'غير محدد' : formatNumber(p.max_users)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--k-ink-muted)]">الوكلاء</dt>
                    <dd className="font-mono tabular-nums font-semibold">{p.max_agents === null ? 'غير محدد' : formatNumber(p.max_agents)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--k-ink-muted)]">القنوات</dt>
                    <dd className="font-mono tabular-nums font-semibold">{p.max_channels === null ? 'غير محدد' : formatNumber(p.max_channels)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--k-ink-muted)]">الرسائل</dt>
                    <dd className="font-mono tabular-nums font-semibold">{p.max_messages === null ? 'غير محدد' : formatNumber(p.max_messages)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--k-ink-muted)]">حصة Tokens</dt>
                    <dd className="font-mono tabular-nums font-semibold">{p.token_quota === null ? 'غير محدد' : formatNumber(p.token_quota)}</dd>
                  </div>
                  <div>
                    <dt className="text-[var(--k-ink-muted)]">التخزين</dt>
                    <dd className="font-mono tabular-nums font-semibold">{p.storage_mb === null ? 'غير محدد' : `${formatNumber(p.storage_mb)} MB`}</dd>
                  </div>
                </dl>

                <div className="text-[11px] text-[var(--k-ink-muted)] space-y-1">
                  <div>
                    <span className="font-semibold text-[var(--k-ink-secondary)]">النماذج المتاحة: </span>
                    <span className="font-mono">{p.allowed_models.join(' · ') || '—'}</span>
                  </div>
                  <div>
                    <span className="font-semibold text-[var(--k-ink-secondary)]">المشتركون النشطون: </span>
                    <span className="font-mono tabular-nums font-semibold text-[var(--k-ink)]">
                      {formatNumber(p.active_subscribers)}
                    </span>
                  </div>
                </div>
              </div>

           </div>
          ))}
        </div>
      ) : (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
            <MetricTile label="النشطة" value={formatNumber(subSummary.active)} tone="success" />
            <MetricTile label="التجريبية" value={formatNumber(subSummary.trial)} />
            <MetricTile label="متأخرة الدفع" value={formatNumber(subSummary.past_due)} tone="danger" />
            <MetricTile label="المنتهية" value={formatNumber(subSummary.expired)} />
            <MetricTile label="الملغاة" value={formatNumber(subSummary.cancelled)} />
          </div>

          <div className="flex items-center gap-2">
            {(['all', 'active', 'trial', 'past_due', 'expired', 'cancelled'] as const).map((st) => (
              <button
                key={st}
                type="button"
                onClick={() => setSubFilter(st)}
                className={`px-3 py-1.5 text-xs rounded-lg border ${
                  subFilter === st
                    ? 'border-[var(--k-brand-forest)] bg-[var(--k-sage-tint)] font-semibold'
                    : 'border-[var(--k-line)] bg-[var(--k-surface)] text-[var(--k-ink-muted)]'
                }`}
              >
                {st === 'all'
                  ? 'الكل'
                  : st === 'active'
                    ? 'نشط'
                    : st === 'trial'
                      ? 'تجريبي'
                      : st === 'past_due'
                        ? 'متأخر'
                        : st === 'expired'
                          ? 'منتهي'
                          : 'ملغى'}
              </button>
            ))}
          </div>

          {subs.length === 0 ? (
            <EmptyState
              title="لا توجد اشتراكات مطابقة"
              description="تظهر هنا اشتراكات العملاء بمجرد إنشاء مستخدمين أو ربط اشتراكات جديدة."
            />
          ) : (
            <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="border-b border-[var(--k-line)] bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                    <th className="px-4 py-3 text-start font-semibold">المستخدم</th>
                    <th className="px-4 py-3 text-start font-semibold">الباقة</th>
                    <th className="px-4 py-3 text-start font-semibold">الحالة</th>
                    <th className="px-4 py-3 text-start font-semibold">تاريخ الانتهاء</th>
                    <th className="px-4 py-3 text-end font-semibold">التحكم</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-[var(--k-line)]">
                  {subs.map((s) => (
                    <tr key={String(s.id)} className="hover:bg-[var(--k-surface-subtle)]/60">
                      <td className="px-4 py-3">
                        <div className="font-semibold">{String(s.user_name)}</div>
                        <div className="text-[11px] font-mono text-[var(--k-ink-muted)]">{String(s.user_email)}</div>
                      </td>
                      <td className="px-4 py-3 font-medium">{String(s.plan_name)}</td>
                      <td className="px-4 py-3">
                        <StatusText
                          status={s.status === 'active' ? 'ok' : s.status === 'past_due' ? 'error' : 'info'}
                          label={String(s.status)}
                        />
                      </td>
                                            <td className="px-4 py-3 font-mono tabular-nums">{String(s.current_period_end).slice(0, 10)}</td>
                      <td className="px-4 py-3 text-end">
                        <div className="inline-flex items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => runSubAction(String(s.id), 'extend', { days: 30 })}
                            className={secondaryBtnClass}
                          >
                            +30 يوم
                          </button>
                          {s.status === 'cancelled' ? (
                            <button
                              type="button"
                              onClick={() => runSubAction(String(s.id), 'reactivate')}
                              className={primaryBtnClass}
                            >
                              إعادة تفعيل
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={() => runSubAction(String(s.id), 'cancel')}
                              className={secondaryBtnClass}
                            >
                              إلغاء
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      <BillingOperationsPanel onNotify={onNotify} />
      <UsageCreditsPanel onNotify={onNotify} />
      <FreeQuotaExemptionsPanel onNotify={onNotify} />

      <ModalDialog
        open={editPlanOpen}
        title={editingPlanId ? 'تعديل تفاصيل الباقة' : 'إنشاء باقة جديدة'}
        onClose={() => setEditPlanOpen(false)}
        maxWidth="max-w-2xl"
      >
        <form onSubmit={savePlanSubmit} className="space-y-4">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">الرمز البرمجي للباقة (Code) *</label>
              <input
                required
                disabled={Boolean(editingPlanId)}
                dir="ltr"
                value={form.code}
                onChange={(e) => setForm({ ...form, code: e.target.value })}
                className={`${inputClass} text-left font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">اسم الباقة بالعربية *</label>
              <input
                required
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                className={inputClass}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">السعر الشهري ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.priceMonthly}
                onChange={(e) => setForm({ ...form, priceMonthly: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">السعر السنوي ($)</label>
              <input
                type="number"
                min={0}
                step="0.01"
                value={form.priceYearly}
                onChange={(e) => setForm({ ...form, priceYearly: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">أيام التجربة</label>
              <input
                type="number"
                min={0}
                value={form.trialDays}
                onChange={(e) => setForm({ ...form, trialDays: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">حالة الباقة</label>
              <select
                value={form.status}
                onChange={(e) => setForm({ ...form, status: e.target.value as 'active' | 'archived' | 'draft' })}
                className={inputClass}
              >
                <option value="active">نشطة</option>
                <option value="draft">مسودة</option>
                <option value="archived">مؤرشفة</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">المستخدمون المسموحون</label>
              <input
                type="number"
                min={1}
                value={form.maxUsers}
                onChange={(e) => setForm({ ...form, maxUsers: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">عدد الوكلاء</label>
              <input
                type="number"
                min={1}
                value={form.maxAgents}
                onChange={(e) => setForm({ ...form, maxAgents: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">حصة الرسائل الشهرية</label>
              <input
                type="number"
                min={0}
                value={form.maxMessages}
                onChange={(e) => setForm({ ...form, maxMessages: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">حصة Tokens</label>
              <input
                type="number"
                min={0}
                value={form.tokenQuota}
                onChange={(e) => setForm({ ...form, tokenQuota: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
          </div>
          <fieldset className="rounded-lg border border-[var(--k-line)] p-3">
            <legend className="px-1 text-xs font-semibold">حدود الوسائط والحماية من الإغراق</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-medium mb-1">الحد اليومي للردود الذكية</label>
              <input
                type="number"
                min={0}
                placeholder="بدون حد"
                value={form.aiMessagesDaily}
                onChange={(e) => setForm({ ...form, aiMessagesDaily: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">وسائط شهرياً (صور/صوت)</label>
              <input
                type="number"
                min={0}
                placeholder="بدون حد"
                value={form.mediaMonthly}
                onChange={(e) => setForm({ ...form, mediaMonthly: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">أقصى حجم للوسائط (MB)</label>
              <input
                type="number"
                min={0}
                placeholder="بدون حد"
                value={form.mediaMaxMb}
                onChange={(e) => setForm({ ...form, mediaMaxMb: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">أقصى مدة صوت (ثانية)</label>
              <input
                type="number"
                min={0}
                placeholder="بدون حد"
                value={form.audioMaxSeconds}
                onChange={(e) => setForm({ ...form, audioMaxSeconds: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">تحليل المستندات (1 مفعل / 0 معطل)</label>
              <input
                type="number"
                min={0}
                placeholder="بدون حد"
                value={form.documentAnalysis}
                onChange={(e) => setForm({ ...form, documentAnalysis: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">أقصى طول للمدخل (حرف)</label>
              <input
                type="number"
                min={0}
                placeholder="بدون حد"
                value={form.maxInputChars}
                onChange={(e) => setForm({ ...form, maxInputChars: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">أقصى Tokens للرد</label>
              <input
                type="number"
                min={0}
                placeholder="بدون حد"
                value={form.maxOutputTokens}
                onChange={(e) => setForm({ ...form, maxOutputTokens: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            <div>
              <label className="block text-xs font-medium mb-1">حد الرسائل لكل جهة اتصال/دقيقة</label>
              <input
                type="number"
                min={0}
                placeholder="بدون حد"
                value={form.floodPerMinute}
                onChange={(e) => setForm({ ...form, floodPerMinute: e.target.value })}
                className={`${inputClass} font-mono`}
              />
            </div>
            </div>
          </fieldset>
          <div>
            <label className="block text-xs font-medium mb-1">وصف الباقة</label>
            <textarea
              rows={2}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              className={inputClass}
            />
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setEditPlanOpen(false)} className={secondaryBtnClass}>
              إلغاء
            </button>
            <button type="submit" className={primaryBtnClass}>
              حفظ الباقة
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}

// =========================================================================
// INVOICES, PAYMENTS & OPERATING EXPENSES PAGE
// =========================================================================
export function InvoicesPaymentsPage({
  onNotify,
}: {
  onNotify: (type: 'success' | 'error' | 'info', text: string) => void;
}) {
  const [data,setData]=React.useState<{
    invoices:Array<Record<string,unknown>>;
    expenses:Array<Record<string,unknown>>;
    paymentIntents:Array<Record<string,unknown>>;
    manualWalletRequests:Array<Record<string,unknown>>;
    wallets:Array<Record<string,unknown>>;
    ledgerEntries:Array<Record<string,unknown>>;
    dataLimitations?:{invoices?:string;expenses?:string;refunds?:string};
    gateways:Array<{code:string;name:string;configured:boolean;webhookConfigured:boolean;supportsRefund:boolean}>;
    summary:{
      collectedRevenueUsd:number;unpaidInvoicesUsd:number;refundedUsd:number;estimatedMrrUsd:number;
      recordedExpensesUsd:number;verifiedPayments?:number;pendingPayments?:number;wrongAmountPayments?:number;
      manualPendingPayments?:number;manualApprovedPayments?:number;closedPaymentIntents?:number;
    };
  }|null>(null);
  const [loading,setLoading]=React.useState(true);
  const [reviewTarget,setReviewTarget]=React.useState<{id:string;action:'approve'|'reject'}|null>(null);
  const [reviewNote,setReviewNote]=React.useState('');
  const [reviewBusy,setReviewBusy]=React.useState(false);

  const load=React.useCallback(()=>{
    setLoading(true);
    apiFetch<NonNullable<typeof data>>('/api/owner/billing')
      .then(setData)
      .catch(err=>onNotify('error',err instanceof Error?err.message:'تعذر تحميل سجل الفوترة الحقيقي.'))
      .finally(()=>setLoading(false));
  },[onNotify]);

  React.useEffect(()=>{load();},[load]);

  async function submitReview(e:React.FormEvent) {
    e.preventDefault();
    if(!reviewTarget)return;
    if(reviewTarget.action==='reject'&&reviewNote.trim().length<5){
      onNotify('error','سبب رفض التحويل مطلوب (5 أحرف على الأقل).');
      return;
    }
    setReviewBusy(true);
    try{
      const result=await apiFetch<{id:string;status:string}>(`/api/owner/billing/manual-wallet-requests/${encodeURIComponent(reviewTarget.id)}/review`,{
        method:'POST',body:{action:reviewTarget.action,note:reviewNote}
      });
      onNotify('success',result.status==='approved'?'تم اعتماد التحويل وتفعيل الاشتراك وتسجيل القيد المالي.':'تم رفض طلب الدفع وإشعار المؤسسة.');
      setReviewTarget(null);
      setReviewNote('');
      load();
    }catch(err){
      onNotify('error',err instanceof Error?err.message:'تعذرت مراجعة طلب الدفع.');
    }finally{setReviewBusy(false);}
  }

  const statusLabel=(value:unknown)=>{
    const v=String(value??'');
    if(v==='approved'||v==='verified'||v==='paid')return 'معتمد';
    if(v==='rejected'||v==='failed'||v==='expired'||v==='cancelled')return 'مرفوض / متوقف';
    if(v==='pending'||v==='wrong_amount')return v==='wrong_amount'?'مبلغ غير مطابق':'قيد المراجعة';
    return v||'غير محدد';
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title="الفوترة والمحافظ ودفتر القيود"
        subtitle="إدارة طلبات التحويل الفعلية للمحافظ اليمنية، إيصالاتها، واعتماد الاشتراكات مع سجل مالي من PostgreSQL. لا تُنشأ فواتير أو مصروفات وهمية."
        action={<button type="button" onClick={load} disabled={loading} className={secondaryBtnClass}>تحديث البيانات</button>}
      />
      {loading||!data?(
        <TableSkeleton rows={6}/>
      ):(
        <>
          <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
            <MetricTile label="الإيرادات المحصلة" value={formatCurrency(Number(data.summary?.collectedRevenueUsd??0))} subtext={`طلبات موثقة: ${Number(data.summary?.verifiedPayments??0)+Number(data.summary?.manualApprovedPayments??0)}`} tone="sage"/>
            <MetricTile label="طلبات الدفع المعلقة" value={formatCurrency(Number(data.summary?.unpaidInvoicesUsd??0))} subtext={`محافظ: ${Number(data.summary?.manualPendingPayments??0)} · بوابات: ${Number(data.summary?.pendingPayments??0)}`} tone={Number(data.summary?.unpaidInvoicesUsd??0)>0?'warning':'default'}/>
            <MetricTile label="MRR شهري" value={formatCurrency(Number(data.summary?.estimatedMrrUsd??0))} subtext="الاشتراكات الشهرية النشطة"/>
            <MetricTile label="دفتر القيود" value={formatNumber(data.ledgerEntries?.length??0)} subtext="التحويلات المعتمدة"/>
            <MetricTile label="المصروفات" value="غير متاح" subtext="لا يوجد جدول مصروفات في قاعدة المنصة"/>
          </div>

          <section className="space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h2 className="text-sm font-bold text-[var(--k-ink)]">طلبات تحويل المحافظ اليمنية ({data.manualWalletRequests?.length??0})</h2>
              <span className="text-xs text-[var(--k-ink-muted)]">الاعتماد يحدّث الاشتراك والقيود المالية عبر معاملة PostgreSQL ذرّية</span>
            </div>
            {!data.manualWalletRequests?.length?(
              <EmptyState title="لا توجد طلبات تحويل للمراجعة" description="ستظهر هنا طلبات الدفع المرسلة من المؤسسات مع المحفظة والمبلغ والإيصال."/>
            ):(
              <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                    <th className="px-3 py-3 text-start">المستخدم / المؤسسة</th>
                    <th className="px-3 py-3 text-start">المحفظة والتحويل</th>
                    <th className="px-3 py-3 text-start">الباقة</th>
                    <th className="px-3 py-3 text-start">المبلغ</th>
                    <th className="px-3 py-3 text-start">الحالة</th>
                    <th className="px-3 py-3 text-start">الإيصال</th>
                    <th className="px-3 py-3 text-end">الإجراء</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--k-line)]">
                    {data.manualWalletRequests.map(r=>(
                      <tr key={String(r.id)} className="align-top hover:bg-[var(--k-surface-subtle)]/60">
                        <td className="px-3 py-3 min-w-40">
                          <div className="font-semibold">{String(r.user_name??'—')}</div>
                          <div className="text-[11px] text-[var(--k-ink-muted)]">{String(r.user_email??r.workspace_name??'—')}</div>
                          <div className="text-[11px] text-[var(--k-ink-muted)]">{String(r.workspace_name??'')}</div>
                        </td>
                        <td className="px-3 py-3 min-w-36">
                          <div className="font-semibold">{String(r.wallet_name??r.provider_code??'—')}</div>
                          <div className="font-mono text-[11px] text-[var(--k-ink-muted)]" dir="ltr">{String(r.transfer_reference??'—')}</div>
                          <div className="text-[11px] text-[var(--k-ink-muted)]">{String(r.sender_name??'—')}</div>
                        </td>
                        <td className="px-3 py-3">{String(r.plan_name??r.plan_code??'—')}<div className="text-[11px] text-[var(--k-ink-muted)]">{String(r.billing_cycle??'')}</div></td>
                        <td className="px-3 py-3 font-mono whitespace-nowrap">
                          <div>{formatNumber(Number(r.amount_yer??0))} ر.ي</div>
                          <div className="text-[11px] text-[var(--k-ink-muted)]">{formatCurrency(Number(r.amount_usd??0),'USD')}</div>
                        </td>
                        <td className="px-3 py-3">
                          <StatusText status={r.status==='approved'?'ok':r.status==='rejected'?'error':'warn'} label={statusLabel(r.status)}/>
                          {r.review_note? <div className="mt-1 max-w-40 break-words text-[11px] text-[var(--k-ink-muted)]">{String(r.review_note)}</div>:null}
                        </td>
                        <td className="px-3 py-3">
                          {r.has_receipt?(
                            <a className="inline-flex min-h-[44px] items-center text-[var(--k-info)] underline" href={`/api/owner/billing/manual-wallet-requests/${encodeURIComponent(String(r.id))}/receipt`} target="_blank" rel="noreferrer">فتح الإيصال</a>
                          ):'—'}
                        </td>
                        <td className="px-3 py-3 text-end">
                          {r.status==='pending'?(
                            <div className="flex flex-wrap justify-end gap-1.5">
                              <button type="button" onClick={()=>{setReviewTarget({id:String(r.id),action:'approve'});setReviewNote('');}} className={primaryBtnClass}>اعتماد</button>
                              <button type="button" onClick={()=>{setReviewTarget({id:String(r.id),action:'reject'});setReviewNote('');}} className={dangerBtnClass}>رفض</button>
                            </div>
                          ):<span className="text-[11px] text-[var(--k-ink-muted)]">{String(r.reviewed_by??'')}</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-[var(--k-ink)]">المحافظ المعرفة ({data.wallets?.length??0})</h2>
            {!data.wallets?.length?(
              <EmptyState title="لا توجد محافظ معرفة" description="تُدار حسابات المحافظ من لوحة الإدارة المركزية؛ هذه القائمة للقراءة والتحقق فقط."/>
            ):(
              <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3">
                {data.wallets.map(w=>(
                  <div key={String(w.id)} className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] p-4 space-y-1">
                    <div className="flex justify-between gap-2"><strong className="text-sm">{String(w.display_name??'—')}</strong><StatusText status={w.is_active?'ok':'muted'} label={w.is_active?'نشطة':'متوقفة'}/></div>
                    <div className="text-xs text-[var(--k-ink-muted)]">{String(w.account_name??'—')}</div>
                    <div className="font-mono text-sm" dir="ltr">{String(w.account_number??'—')}</div>
                    <div className="text-[11px] text-[var(--k-ink-muted)]">{String(w.provider_code??'')}</div>
                  </div>
                ))}
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-[var(--k-ink)]">دفتر القيود المالية ({data.ledgerEntries?.length??0})</h2>
            {!data.ledgerEntries?.length?(
              <EmptyState title="لا توجد قيود مالية معتمدة" description="يُضاف القيد تلقائياً عند اعتماد طلب تحويل محفظة."/>
            ):(
              <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                    <th className="px-3 py-3 text-start">التاريخ</th><th className="px-3 py-3 text-start">المؤسسة</th>
                    <th className="px-3 py-3 text-start">المحفظة</th><th className="px-3 py-3 text-start">المرجع</th>
                    <th className="px-3 py-3 text-start">المبلغ (YER)</th><th className="px-3 py-3 text-start">المبلغ (USD)</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--k-line)]">
                    {data.ledgerEntries.map(l=>(
                      <tr key={String(l.id)}>
                        <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(String(l.recorded_at??''))}</td>
                        <td className="px-3 py-3">{String(l.workspace_name??'—')}</td>
                        <td className="px-3 py-3">{String(l.provider_code??'—')}</td>
                        <td className="px-3 py-3 font-mono">{String(l.transfer_reference??'—')}</td>
                        <td className="px-3 py-3 font-mono">{formatNumber(Number(l.amount_yer??0))}</td>
                        <td className="px-3 py-3 font-mono">{formatCurrency(Number(l.amount_usd??0),'USD')}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <section className="space-y-3">
            <h2 className="text-sm font-bold text-[var(--k-ink)]">طلبات الدفع من البوابات ({data.paymentIntents?.length??0})</h2>
            {!data.paymentIntents?.length?(
              <EmptyState title="لا توجد طلبات بوابات دفع" description="سجلات الدفع الرقمية والتحقق منها تظهر هنا من قاعدة المنصة."/>
            ):(
              <div className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] overflow-x-auto">
                <table className="w-full text-xs">
                  <thead><tr className="bg-[var(--k-surface-subtle)] text-[var(--k-ink-muted)]">
                    <th className="px-3 py-3 text-start">رقم الطلب</th><th className="px-3 py-3 text-start">المستخدم / المؤسسة</th>
                    <th className="px-3 py-3 text-start">الباقة</th><th className="px-3 py-3 text-start">المبلغ</th>
                    <th className="px-3 py-3 text-start">المرجع</th><th className="px-3 py-3 text-start">الحالة</th><th className="px-3 py-3 text-start">التاريخ</th>
                  </tr></thead>
                  <tbody className="divide-y divide-[var(--k-line)]">
                    {data.paymentIntents.map(p=>(
                      <tr key={String(p.id)}>
                        <td className="px-3 py-3 font-mono">{String(p.external_order_id??p.id)}</td>
                        <td className="px-3 py-3">{String(p.user_name??'—')}<div className="text-[11px] text-[var(--k-ink-muted)]">{String(p.workspace_name??'')}</div></td>
                        <td className="px-3 py-3">{String(p.plan_name??p.plan_code??'—')}</td>
                        <td className="px-3 py-3 font-mono">{formatCurrency(Number(p.amount_usd??0),'USD')}<div className="text-[11px] text-[var(--k-ink-muted)]">{formatNumber(Number(p.amount_yer??0))} ر.ي</div></td>
                        <td className="px-3 py-3 font-mono">{String(p.payment_reference??p.provider_payment_id??'—')}</td>
                        <td className="px-3 py-3"><StatusText status={p.status==='verified'?'ok':p.status==='failed'?'error':'warn'} label={statusLabel(p.status)}/></td>
                        <td className="px-3 py-3 whitespace-nowrap">{formatDateTime(String(p.created_at??''))}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </section>

          <div role="note" className="rounded-xl border border-[var(--k-line)] bg-[var(--k-surface-subtle)] px-4 py-3 text-xs leading-6 text-[var(--k-ink-secondary)]">
            <strong className="text-[var(--k-ink)]">حدود المخطط المالي:</strong>
            {' '}{data.dataLimitations?.invoices??'لا يوجد دفتر فواتير منفصل.'} {' '}
            {data.dataLimitations?.expenses??'لا يوجد دفتر مصروفات تشغيلية.'} {' '}
            {data.dataLimitations?.refunds??'لا يدعم التدفق الحالي الاسترداد البرمجي.'}
          </div>
        </>
      )}

      <ModalDialog open={Boolean(reviewTarget)} title={reviewTarget?.action==='approve'?'اعتماد تحويل المحفظة':'رفض طلب تحويل المحفظة'} onClose={()=>!reviewBusy&&setReviewTarget(null)}>
        <form onSubmit={submitReview} className="space-y-4">
          <p className="text-sm text-[var(--k-ink-secondary)]">
            {reviewTarget?.action==='approve'
              ?'سيؤدي الاعتماد إلى تفعيل الاشتراك وتسجيل القيد المالي وإشعار المؤسسة.'
              :'سيُرفض الطلب مع حفظ السبب وإشعار المؤسسة.'}
          </p>
          <div>
            <label className="mb-1 block text-xs font-medium">ملاحظة المراجعة {reviewTarget?.action==='reject'?'(مطلوبة)':'(اختيارية)'}</label>
            <textarea value={reviewNote} onChange={e=>setReviewNote(e.target.value)} rows={3} className={inputClass}
              placeholder="اكتب ملاحظة المراجعة أو سبب الرفض..."/>
          </div>
          <div className="sticky bottom-0 flex justify-end gap-2 border-t border-[var(--k-line)] bg-[var(--k-surface)] pt-3">
            <button type="button" disabled={reviewBusy} onClick={()=>setReviewTarget(null)} className={secondaryBtnClass}>إلغاء</button>
            <button type="submit" disabled={reviewBusy||(reviewTarget?.action==='reject'&&reviewNote.trim().length<5)}
              className={reviewTarget?.action==='approve'?primaryBtnClass:dangerBtnClass}>
              {reviewBusy?'جارٍ التنفيذ...':reviewTarget?.action==='approve'?'اعتماد وتفعيل الاشتراك':'تأكيد الرفض'}
            </button>
          </div>
        </form>
      </ModalDialog>
    </div>
  );
}


function BillingOperationsPanel({ onNotify }: { onNotify: (type: 'success' | 'error' | 'info', text: string) => void }) {
  const [data, setData] = React.useState<{ prices: Array<Record<string, unknown>>; wallets: Array<Record<string, unknown>>; requests: Array<Record<string, unknown>>; yerPerUsd?: number | null } | null>(null);
  const [yerRate, setYerRate] = React.useState('');
  const [wallet, setWallet] = React.useState({ id: '', provider_code: 'jawali', display_name: '', account_name: '', account_number: '', instructions: '', is_active: true, sort_order: '100' });
  const [price, setPrice] = React.useState({ planCode: 'starter', billingCycle: 'monthly', currency: 'YER', amount: '', exchangeRateToUsd: '' });
  const load = React.useCallback(() => { apiFetch<typeof data>('/api/owner/billing/catalog').then((next) => { setData(next); setYerRate(next?.yerPerUsd ? String(next.yerPerUsd) : ''); }).catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل إعدادات الدفع.')); }, [onNotify]);
  React.useEffect(() => { load(); }, [load]);
  async function saveWallet(e: React.FormEvent) { e.preventDefault(); try { await apiFetch('/api/owner/billing/wallets', { method: 'POST', body: wallet }); onNotify('success', 'تم حفظ المحفظة اليمنية.'); setWallet({ ...wallet, id: '', display_name: '', account_name: '', account_number: '', instructions: '', sort_order: '100' }); load(); } catch (err) { onNotify('error', err instanceof Error ? err.message : 'تعذر حفظ المحفظة.'); } }
  async function saveYerRate(e: React.FormEvent) { e.preventDefault(); const rate = Number(yerRate); if (!Number.isFinite(rate) || rate <= 0) { onNotify('error', 'أدخل سعر صرف صحيحاً أكبر من صفر.'); return; } try { await apiFetch('/api/owner/settings/billing.yer_per_usd', { method: 'PATCH', body: { value: { value: rate, category: 'billing', description: 'سعر صرف الدولار بالريال اليمني لحساب مبلغ التحويل اليدوي' } } }); onNotify('success', 'تم حفظ سعر الصرف.'); load(); } catch (err) { onNotify('error', err instanceof Error ? err.message : 'تعذر حفظ سعر الصرف.'); } }
  function editWallet(w: Record<string, unknown>) { setWallet({ id: String(w.id ?? ''), provider_code: String(w.provider_code ?? 'other'), display_name: String(w.display_name ?? ''), account_name: String(w.account_name ?? ''), account_number: String(w.account_number ?? '').startsWith('PENDING') ? '' : String(w.account_number ?? ''), instructions: String(w.instructions ?? ''), is_active: w.is_active !== false, sort_order: String(w.sort_order ?? '100') }); }
  async function savePrice(e: React.FormEvent) { e.preventDefault(); try { await apiFetch('/api/owner/billing/prices', { method: 'POST', body: { ...price, amount: Number(price.amount), exchangeRateToUsd: price.exchangeRateToUsd ? Number(price.exchangeRateToUsd) : null } }); onNotify('success', 'تم حفظ سعر الباقة.'); setPrice({ ...price, amount: '' }); load(); } catch (err) { onNotify('error', err instanceof Error ? err.message : 'تعذر حفظ السعر.'); } }
  async function review(id: string, action: 'approve' | 'reject') { try { await apiFetch(`/api/owner/billing/payment-requests/${encodeURIComponent(id)}/review`, { method: 'POST', body: { action, note: action === 'reject' ? 'لم تتم مطابقة التحويل.' : '' } }); onNotify('success', action === 'approve' ? 'تم اعتماد الدفعة وتفعيل الاشتراك.' : 'تم رفض طلب الدفع.'); load(); } catch (err) { onNotify('error', err instanceof Error ? err.message : 'تعذرت مراجعة الطلب.'); } }
  return <div className="mt-6 space-y-4 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] p-5">
    <div><h2 className="text-base font-bold">إعدادات الدفع والعملات</h2><p className="mt-1 text-xs text-[var(--k-ink-muted)]">أضف محافظ يمنية وعدّل أسعار USD وYER والعملات العربية، ثم راجع الإيصالات المعلقة.</p></div>
    <div className="grid gap-4 lg:grid-cols-2">
      <form onSubmit={saveWallet} className="space-y-2 rounded-lg border border-[var(--k-line)] p-4"><h3 className="font-semibold">{wallet.id ? 'تعديل محفظة يمنية' : 'محفظة يمنية'}</h3>{data?.wallets?.length ? <div className="flex flex-wrap gap-1.5">{data.wallets.map((w) => <button type="button" key={String(w.id)} onClick={() => editWallet(w)} className={`rounded-full border px-2.5 py-1 text-xs ${wallet.id === String(w.id) ? 'border-[var(--k-ink)] font-bold' : 'border-[var(--k-line)]'}`}>{String(w.display_name ?? '')}{String(w.account_number ?? '').startsWith('PENDING') ? ' · بلا رقم' : ''}</button>)}</div> : null}<div className="grid grid-cols-2 gap-2"><select aria-label="مزود المحفظة" value={wallet.provider_code} onChange={(e) => setWallet({ ...wallet, provider_code: e.target.value })} className={inputClass}><option value="jawali">جوالي</option><option value="jeeb">جيب</option><option value="onecash">ون كاش</option><option value="cacbank">كاك بنك</option><option value="kuraimi">الكريمي</option><option value="other">أخرى</option></select><input required aria-label="اسم المحفظة" placeholder="اسم المحفظة" value={wallet.display_name} onChange={(e) => setWallet({ ...wallet, display_name: e.target.value })} className={inputClass} /></div><div className="grid grid-cols-2 gap-2"><input required aria-label="اسم المستفيد" placeholder="اسم المستفيد" value={wallet.account_name} onChange={(e) => setWallet({ ...wallet, account_name: e.target.value })} className={inputClass} /><input required aria-label="رقم الحساب" placeholder="رقم الحساب" value={wallet.account_number} onChange={(e) => setWallet({ ...wallet, account_number: e.target.value })} className={inputClass} /></div><div className="grid grid-cols-[1fr_7rem] gap-2"><input aria-label="تعليمات التحويل" placeholder="تعليمات التحويل" value={wallet.instructions} onChange={(e) => setWallet({ ...wallet, instructions: e.target.value })} className={inputClass} /><input type="number" min={0} max={1000} step={1} aria-label="ترتيب العرض" title="ترتيب العرض للعملاء (الأصغر أولاً)" placeholder="الترتيب" value={wallet.sort_order} onChange={(e) => setWallet({ ...wallet, sort_order: e.target.value })} className={inputClass} /></div><label className="flex items-center gap-2 text-xs"><input type="checkbox" checked={wallet.is_active} onChange={(e) => setWallet({ ...wallet, is_active: e.target.checked })} />محفظة نشطة (تظهر للعملاء)</label><div className="flex gap-2"><button className={primaryBtnClass}>{wallet.id ? 'تحديث المحفظة' : 'حفظ المحفظة'}</button>{wallet.id ? <button type="button" onClick={() => setWallet({ id: '', provider_code: 'jawali', display_name: '', account_name: '', account_number: '', instructions: '', is_active: true, sort_order: '100' })} className="rounded-lg border border-[var(--k-line)] px-3 text-sm">جديدة</button> : null}</div></form>
      <form onSubmit={saveYerRate} className="space-y-2 rounded-lg border border-[var(--k-line)] p-4"><h3 className="font-semibold">سعر صرف الدولار (ر.ي)</h3><p className="text-xs text-[var(--k-ink-muted)]">يُستخدم لحساب المبلغ بالريال عند عدم وجود سعر YER مخصص للباقة.</p><div className="flex gap-2"><input required type="number" min="1" step="0.01" placeholder="535" value={yerRate} onChange={(e) => setYerRate(e.target.value)} className={`${inputClass} font-mono`} /><button className={primaryBtnClass}>حفظ السعر</button></div></form>
      <form onSubmit={savePrice} className="space-y-2 rounded-lg border border-[var(--k-line)] p-4"><h3 className="font-semibold">سعر باقة</h3><div className="grid grid-cols-2 gap-2"><select value={price.planCode} onChange={(e) => setPrice({ ...price, planCode: e.target.value })} className={inputClass}><option value="starter">Starter</option><option value="growth">Pro</option><option value="pro">Business</option></select><select value={price.billingCycle} onChange={(e) => setPrice({ ...price, billingCycle: e.target.value })} className={inputClass}><option value="monthly">شهري</option><option value="yearly">سنوي</option></select></div><div className="grid grid-cols-3 gap-2"><input required placeholder="العملة" maxLength={3} value={price.currency} onChange={(e) => setPrice({ ...price, currency: e.target.value.toUpperCase() })} className={`${inputClass} font-mono`} /><input required type="number" min="0" step="0.0001" placeholder="المبلغ" value={price.amount} onChange={(e) => setPrice({ ...price, amount: e.target.value })} className={`${inputClass} font-mono`} /><input type="number" min="0" step="0.000001" placeholder="سعر الصرف" value={price.exchangeRateToUsd} onChange={(e) => setPrice({ ...price, exchangeRateToUsd: e.target.value })} className={`${inputClass} font-mono`} /></div><button className={primaryBtnClass}>حفظ السعر</button></form>
    </div>
    <div><h3 className="mb-2 font-semibold">طلبات الدفع المعلقة ({data?.requests.filter((item) => item.status === 'pending').length ?? 0})</h3>{data?.requests.filter((item) => item.status === 'pending').map((item) => <div key={String(item.id)} className="mb-2 flex flex-wrap items-center justify-between gap-3 rounded-lg border border-[var(--k-line)] p-3 text-xs"><div><strong>{String(item.organization_name || 'مؤسسة')}</strong> · {String(item.plan_code)} · {String(item.amount_yer)} ر.ي · مرجع {String(item.transfer_reference)}</div><div className="flex gap-2"><a href={`/api/owner/billing/payment-requests/${encodeURIComponent(String(item.id))}/receipt`} target="_blank" rel="noreferrer" className={secondaryBtnClass}>معاينة الإيصال</a><button onClick={() => review(String(item.id), 'approve')} className={primaryBtnClass}>اعتماد</button><button onClick={() => review(String(item.id), 'reject')} className={secondaryBtnClass}>رفض</button></div></div>)}</div>
  </div>;
}

interface FreeQuotaExemption { fingerprint: string; reason: string; granted_by: string | null; created_at: string }

function UsageCreditsPanel({ onNotify }: { onNotify: (type: 'success' | 'error' | 'info', text: string) => void }) {
  const [organizations, setOrganizations] = React.useState<Array<{ id: string; name: string }>>([]);
  const [organizationId, setOrganizationId] = React.useState('');
  const [amount, setAmount] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const request = React.useRef<{ key: string; id: string } | null>(null);
  React.useEffect(() => {
    let current = true;
    apiFetch<{ items: Array<{ id: string; name: string }> }>('/api/owner/workspaces')
      .then(data => { if (current) setOrganizations([...new Map(data.items.map(item => [item.id, item])).values()]); })
      .catch(() => { if (current) onNotify('error', 'تعذّر تحميل المؤسسات.'); });
    return () => { current = false; };
  }, [onNotify]);

  async function grant(event: React.FormEvent) {
    event.preventDefault();
    if (busy) return;
    const key = `${organizationId}:${amount}`;
    if (request.current?.key !== key) request.current = { key, id: crypto.randomUUID() };
    setBusy(true);
    try {
      const result = await apiFetch<{ item: { balance_after: number } }>('/api/owner/billing/usage-credits', {
        method: 'POST', body: { organizationId, amount: Number(amount), requestId: request.current.id },
      });
      onNotify('success', `تم الشحن. الرصيد الجديد ${formatNumber(result.item.balance_after)}.`);
      request.current = null;
      setAmount('');
    } catch (error) {
      onNotify('error', error instanceof Error ? error.message : 'تعذّر شحن الرصيد.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="mt-6 space-y-3 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] p-5">
      <h2 className="text-base font-bold">شحن رصيد المهام</h2>
      <form onSubmit={grant} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
        <label className="text-sm">المؤسسة
          <select required className={inputClass} value={organizationId} onChange={event => setOrganizationId(event.target.value)}>
            <option value="">اختر مؤسسة</option>
            {organizations.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label className="text-sm">عدد الأرصدة
          <input required type="number" min={1} max={1000000} step={1} value={amount} onChange={event => setAmount(event.target.value)} className={inputClass} />
        </label>
        <button disabled={busy || !organizationId} type="submit" className={`${primaryBtnClass} self-end`}>شحن الرصيد</button>
      </form>
    </section>
  );
}

function FreeQuotaExemptionsPanel({ onNotify }: { onNotify: (type: 'success' | 'error' | 'info', text: string) => void }) {
  const [items, setItems] = React.useState<FreeQuotaExemption[]>([]);
  const [value, setValue] = React.useState('');
  const [reason, setReason] = React.useState('');
  const load = React.useCallback(() => {
    apiFetch<{ items: FreeQuotaExemption[] }>('/api/owner/billing/free-quota-exemptions')
      .then((r) => setItems(r.items))
      .catch((err) => onNotify('error', err instanceof Error ? err.message : 'تعذر تحميل الاستثناءات.'));
  }, [onNotify]);
  React.useEffect(() => { load(); }, [load]);
  async function add(e: React.FormEvent) {
    e.preventDefault();
    try {
      await apiFetch('/api/owner/billing/free-quota-exemptions', { method: 'POST', body: { value, reason } });
      onNotify('success', 'تم استثناء البصمة من حصة الباقة المجانية.');
      setValue(''); setReason(''); load();
    } catch (err) { onNotify('error', err instanceof Error ? err.message : 'تعذر حفظ الاستثناء.'); }
  }
  async function remove(fingerprint: string) {
    try {
      await apiFetch(`/api/owner/billing/free-quota-exemptions/${encodeURIComponent(fingerprint)}`, { method: 'DELETE' });
      onNotify('success', 'تم إلغاء الاستثناء.'); load();
    } catch (err) { onNotify('error', err instanceof Error ? err.message : 'تعذر إلغاء الاستثناء.'); }
  }
  return <div className="mt-6 space-y-3 rounded-xl border border-[var(--k-line)] bg-[var(--k-surface)] p-5">
    <div>
      <h2 className="text-base font-bold">استثناءات حصة الباقة المجانية</h2>
      <p className="mt-1 text-xs text-[var(--k-ink-muted)]">الحصة المجانية مرتبطة ببصمة SHA-256 لرقم الهاتف/واتساب أو معرّف القناة، ولا تُعاد عند حذف الحساب وإعادة التسجيل. أدخل الرقم أو المعرّف لاستثنائه.</p>
    </div>
    <form onSubmit={add} className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
      <input required dir="ltr" placeholder="+967700000000 أو org:<uuid>" value={value} onChange={(e) => setValue(e.target.value)} className={`${inputClass} font-mono`} />
      <input required minLength={5} maxLength={300} placeholder="سبب الاستثناء" value={reason} onChange={(e) => setReason(e.target.value)} className={inputClass} />
      <button className={primaryBtnClass}>استثناء</button>
    </form>
    {items.length === 0 ? <p className="text-xs text-[var(--k-ink-muted)]">لا توجد استثناءات.</p> : (
      <ul className="divide-y divide-[var(--k-line)] text-sm">
        {items.map((item) => (
          <li key={item.fingerprint} className="flex flex-wrap items-center justify-between gap-2 py-2">
            <div className="min-w-0">
              <p className="truncate font-mono text-xs" dir="ltr">{item.fingerprint.slice(0, 16)}…</p>
              <p className="text-xs text-[var(--k-ink-muted)]">{item.reason} · {formatDateTime(item.created_at)}</p>
            </div>
            <button type="button" className={dangerBtnClass} onClick={() => remove(item.fingerprint)}>إلغاء</button>
          </li>
        ))}
      </ul>
    )}
  </div>;
}
